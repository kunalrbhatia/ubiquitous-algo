import fs from 'fs';
import path from 'path';
import logger from '../logging/logger';
import flagWatcher from '../flags/flagWatcher';
import brokerClient, { PlaceOrderParams } from './brokerClient';
import positionsStore from '../positions/positionsStore';
import { StrategyLeg } from '../strategy/strategyManager';
import { OrderRecord, MonthlyPosition } from '../schemas/smartApi';

const OPTION_TICK_SIZE = 0.05;

export interface IExecutionManager {
  executeEntry(underlying: string, basket: StrategyLeg[]): Promise<boolean>;
  executeExit(
    underlying: string,
    month: string,
    isPaper: boolean,
    isStoploss?: boolean,
  ): Promise<boolean>;
  monitorPnl(underlying: string, month: string, isPaper: boolean): Promise<void>;
  updateMarginUtilized(underlying: string, month: string, isPaper: boolean): Promise<void>;
}

export class ExecutionManager implements IExecutionManager {
  private pollIntervalMs = 1000;
  private maxPollAttempts = 15; // 15 seconds max

  async executeEntry(underlying: string, basket: StrategyLeg[]): Promise<boolean> {
    const isPaper = flagWatcher.isPaperMode();
    const modeStr = isPaper ? 'PAPER' : 'LIVE';
    logger.info(`Starting entry execution in ${modeStr} mode...`);

    const buyLegs = basket.filter((leg) => leg.action === 'BUY');
    const sellLegs = basket.filter((leg) => leg.action === 'SELL');

    const executedOrders: OrderRecord[] = [];

    // Step 1: Execute all Buy Legs first
    for (const leg of buyLegs) {
      const order = await this.placeAndConfirmOrder(leg, isPaper);
      if (!order) {
        logger.error(`Failed to execute buy leg ${leg.tradingsymbol}. Aborting entry sequence.`);
        // Rollback any executed buy legs
        await this.rollbackOrders(executedOrders, isPaper);
        return false;
      }
      executedOrders.push(order);
    }

    // Step 2: Execute all Sell Legs
    for (const leg of sellLegs) {
      const order = await this.placeAndConfirmOrder(leg, isPaper);
      if (!order) {
        logger.error(`Failed to execute sell leg ${leg.tradingsymbol}. Aborting entry sequence.`);
        // Note: Do NOT automatically roll back sells, but keep what is done and notify
        return false;
      }
      executedOrders.push(order);
    }

    // Calculate margin utilized
    let marginUtilized = 0;
    if (isPaper) {
      marginUtilized = 150000 * 3; // simulated margin
    } else {
      marginUtilized = await brokerClient.getMarginUtilized(basket);
    }

    // Save positions
    const month = positionsStore.getCurrentMonthString();
    const position: MonthlyPosition = {
      month,
      status: 'open',
      marginUtilized,
      orders: executedOrders,
      realizedPnl: 0,
      skippedThisMonth: false,
    };

    positionsStore.writePosition(underlying, month, isPaper, position);

    return true;
  }

  // TODO: Add support for partial-fill tracking and dynamic sizing.
  // Currently, if a limit order is partially filled and then cancelled, the remaining
  // quantity needs to be scaled down on subsequent repricing / fallback orders to prevent over-filling.
  private async placeLimitOrderWithReprice(
    leg: { symboltoken: string; tradingsymbol: string; exchange: string; quantity: number },
    transactiontype: 'BUY' | 'SELL',
    maxSlippagePct = 0.03,
    repriceIntervalMs = 3000,
    maxAttempts = 4,
  ): Promise<{ orderid: string | null; cancelFailed: boolean }> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const marketData = await brokerClient.getMarketData(leg.exchange, leg.symboltoken);
        const { ltp, bid, ask } = marketData;

        if (ltp <= 0) {
          logger.error(`Invalid LTP (${ltp}) for ${leg.tradingsymbol}`);
          return { orderid: null, cancelFailed: false };
        }

        const passive = transactiontype === 'BUY' ? bid : ask;
        const aggressive = transactiontype === 'BUY' ? ask : bid;

        const fraction = maxAttempts > 1 ? attempt / (maxAttempts - 1) : 1;
        let targetPrice = passive + fraction * (aggressive - passive);

        if (transactiontype === 'BUY') {
          const cap = ltp * (1 + maxSlippagePct);
          if (targetPrice > cap) {
            targetPrice = cap;
          }
        } else {
          const cap = ltp * (1 - maxSlippagePct);
          if (targetPrice < cap) {
            targetPrice = cap;
          }
        }

        const limitPrice = Math.round(targetPrice / OPTION_TICK_SIZE) * OPTION_TICK_SIZE;

        logger.info(
          `[Reprice Attempt ${attempt + 1}/${maxAttempts}] Placing LIMIT ${transactiontype} order for ${leg.tradingsymbol} @ ₹${limitPrice.toFixed(2)} (LTP: ₹${ltp}, Bid: ₹${bid}, Ask: ₹${ask})`,
        );

        const orderParams: PlaceOrderParams = {
          variety: 'NORMAL',
          tradingsymbol: leg.tradingsymbol,
          symboltoken: leg.symboltoken,
          transactiontype,
          exchange: leg.exchange,
          ordertype: 'LIMIT',
          producttype: 'CARRYFORWARD',
          duration: 'DAY',
          quantity: leg.quantity,
          price: limitPrice,
        };

        const orderid = await brokerClient.placeOrder(orderParams);

        const isFilled = await this.pollOrderStatusWithInterval(orderid, repriceIntervalMs);
        if (isFilled) {
          return { orderid, cancelFailed: false };
        }

        logger.info(`Order ${orderid} unfilled. Cancelling and repricing...`);
        let cancelSucceeded = false;
        try {
          await brokerClient.cancelOrder(orderid, 'NORMAL');
          cancelSucceeded = true;
        } catch (cancelErr: unknown) {
          const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
          logger.warn(`Failed to cancel order ${orderid}: ${msg}. Checking status...`);
          try {
            const orderBook = await brokerClient.getOrderBook();
            const order = orderBook.find((o) => o.orderid === orderid);
            if (order) {
              const statusUpper = order.status.toUpperCase();
              if (statusUpper === 'COMPLETE') {
                return { orderid, cancelFailed: false };
              }
              if (statusUpper === 'CANCELLED' || statusUpper === 'REJECTED') {
                cancelSucceeded = true;
              }
            }
          } catch (obErr) {
            logger.error(`Failed to verify status after cancel failure: ${obErr}`);
          }
        }

        if (!cancelSucceeded) {
          logger.error(
            `Could not confirm cancellation of order ${orderid}. Aborting reprice to avoid double-fill risk.`,
          );
          return { orderid: null, cancelFailed: true };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error on reprice attempt ${attempt + 1}: ${msg}`);
      }
    }

    return { orderid: null, cancelFailed: false };
  }

  private async pollOrderStatusWithInterval(orderid: string, durationMs: number): Promise<boolean> {
    // Computes the number of polling attempts per reprice walk iteration.
    // Splits the repriceIntervalMs duration into pollIntervalMs (1s) check increments.
    const attempts = Math.min(
      this.maxPollAttempts,
      Math.max(1, Math.floor(durationMs / this.pollIntervalMs)),
    );
    for (let attempt = 0; attempt < attempts; attempt++) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      try {
        const orderBook = await brokerClient.getOrderBook();
        const order = orderBook.find((o) => o.orderid === orderid);

        if (order) {
          const statusUpper = order.status.toUpperCase();
          if (statusUpper === 'COMPLETE') {
            return true;
          }
          if (statusUpper === 'REJECTED' || statusUpper === 'CANCELLED') {
            logger.warn(`Order ${orderid} was ${order.status}. Detail: ${order.text || 'None'}`);
            return false;
          }
        }
      } catch (err) {
        logger.warn(`Failed to poll order status: ${err}`);
      }
    }
    return false;
  }

  private async placeAndConfirmOrder(
    leg: StrategyLeg,
    isPaper: boolean,
  ): Promise<OrderRecord | null> {
    if (!isPaper) {
      try {
        const orderBook = await brokerClient.getOrderBook();
        const existing = orderBook.find(
          (o) =>
            o.symboltoken === leg.symboltoken &&
            (o.status.toUpperCase() === 'COMPLETE' ||
              o.status.toUpperCase() === 'PENDING' ||
              o.status.toUpperCase() === 'OPEN' ||
              o.status.toUpperCase() === 'VALIDATION_PENDING'),
        );

        if (existing) {
          logger.info(
            `Duplicate order prevention: found existing order ${existing.orderid} (${existing.status}) for token ${leg.symboltoken}. Skipping leg.`,
          );
          return {
            symboltoken: leg.symboltoken,
            tradingsymbol: leg.tradingsymbol,
            transactiontype: leg.action,
            quantity: leg.quantity,
            exchange: leg.exchange,
            orderid: existing.orderid,
            status: existing.status.toUpperCase(),
            price: existing.averageprice || existing.price || 0,
          };
        }
      } catch (obErr) {
        logger.warn(`Failed to fetch order book for duplicate check: ${obErr}`);
      }
    }

    const ltp = await brokerClient.getLtp(leg.exchange, leg.tradingsymbol, leg.symboltoken);

    if (isPaper) {
      logger.info(
        `[PAPER] Simulating order fill for ${leg.action} ${leg.quantity} ${leg.tradingsymbol} @ ₹${ltp}`,
      );
      return {
        symboltoken: leg.symboltoken,
        tradingsymbol: leg.tradingsymbol,
        transactiontype: leg.action,
        quantity: leg.quantity,
        exchange: leg.exchange,
        orderid: `PAPER-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        status: 'COMPLETE',
        price: ltp,
      };
    }

    const repriceRes = await this.placeLimitOrderWithReprice(leg, leg.action, 0.03, 3000, 4);

    if (repriceRes.cancelFailed) {
      logger.error(
        `Unconfirmed cancellation on leg ${leg.tradingsymbol}. Aborting execution sequence to prevent double-fill risk.`,
      );
      return null;
    }

    let orderid = repriceRes.orderid;

    if (!orderid) {
      logger.warn(
        `Limit reprice exhausted for entry leg ${leg.tradingsymbol}. Sweeping at MARKET.`,
      );

      const orderParams: PlaceOrderParams = {
        variety: 'NORMAL',
        tradingsymbol: leg.tradingsymbol,
        symboltoken: leg.symboltoken,
        transactiontype: leg.action,
        exchange: leg.exchange,
        ordertype: 'MARKET',
        producttype: 'CARRYFORWARD',
        duration: 'DAY',
        quantity: leg.quantity,
      };

      try {
        orderid = await brokerClient.placeOrder(orderParams);
        logger.info(
          `Placed market fallback order ${orderid} for ${leg.tradingsymbol}. Polling for completeness...`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error executing market fallback order: ${msg}`);
        return null;
      }
    }

    try {
      const isComplete = await this.pollOrderStatus(orderid);
      if (!isComplete) {
        return null;
      }

      const orderBook = await brokerClient.getOrderBook();
      const filledOrder = orderBook.find((o) => o.orderid === orderid);
      const filledPrice = filledOrder?.averageprice || filledOrder?.price || ltp;

      return {
        symboltoken: leg.symboltoken,
        tradingsymbol: leg.tradingsymbol,
        transactiontype: leg.action,
        quantity: leg.quantity,
        exchange: leg.exchange,
        orderid,
        status: 'COMPLETE',
        price: filledPrice,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error executing order: ${msg}`);
      return null;
    }
  }

  private async pollOrderStatus(orderid: string): Promise<boolean> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      const orderBook = await brokerClient.getOrderBook();
      const order = orderBook.find((o) => o.orderid === orderid);

      if (order) {
        const statusUpper = order.status.toUpperCase();
        if (statusUpper === 'COMPLETE') {
          return true;
        }
        if (statusUpper === 'REJECTED' || statusUpper === 'CANCELLED') {
          logger.warn(`Order ${orderid} was ${order.status}. Detail: ${order.text || 'None'}`);
          return false;
        }
      }
    }
    logger.error(`Order ${orderid} polling timed out.`);
    return false;
  }

  private async rollbackOrders(orders: OrderRecord[], isPaper: boolean) {
    logger.info(`Rolling back ${orders.length} executed buy orders...`);
    // Close buy legs (by selling them)
    for (const order of orders) {
      if (isPaper) {
        logger.info(
          `[PAPER] Simulated rollback: Selling back ${order.quantity} ${order.tradingsymbol}`,
        );
        continue;
      }

      try {
        const orderParams: PlaceOrderParams = {
          variety: 'NORMAL',
          tradingsymbol: order.tradingsymbol,
          symboltoken: order.symboltoken,
          transactiontype: 'SELL',
          exchange: order.exchange,
          ordertype: 'MARKET',
          producttype: 'CARRYFORWARD',
          duration: 'DAY',
          quantity: order.quantity,
        };
        await brokerClient.placeOrder(orderParams);
        logger.info(`Rollback order placed for ${order.tradingsymbol}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Rollback order failed for ${order.tradingsymbol}: ${msg}`);
      }
    }
  }

  async executeExit(
    underlying: string,
    month: string,
    isPaper: boolean,
    isStoploss = false,
  ): Promise<boolean> {
    const pos = positionsStore.readPosition(underlying, month, isPaper);
    if (!pos || pos.status !== 'open') {
      logger.warn(`No open positions found to exit for ${underlying} month ${month}.`);
      return false;
    }

    const modeStr = isPaper ? 'PAPER' : 'LIVE';
    logger.info(
      `Starting exit unwind for ${underlying} in ${modeStr} mode (isStoploss: ${isStoploss})...`,
    );

    const shortLegs = pos.orders.filter((o) => o.transactiontype === 'SELL');
    const longLegs = pos.orders.filter((o) => o.transactiontype === 'BUY');

    const closedOrders: OrderRecord[] = [];
    let exitSuccess = true;

    // Step 1: Buy back short legs first to release margin and control risk
    for (const leg of shortLegs) {
      const order = await this.placeExitLeg(leg, 'BUY', isPaper, isStoploss);
      if (!order) {
        logger.error(`Failed to close short leg ${leg.tradingsymbol}`);
        exitSuccess = false;
      } else {
        closedOrders.push(order);
      }
    }

    // Step 2: Unwind long legs (sells) after short legs are closed
    for (const leg of longLegs) {
      const order = await this.placeExitLeg(leg, 'SELL', isPaper, isStoploss);
      if (!order) {
        logger.error(`Failed to close long leg ${leg.tradingsymbol}`);
        exitSuccess = false;
      } else {
        closedOrders.push(order);
      }
    }

    let totalPnl = 0;
    for (const entryLeg of pos.orders) {
      const exitLeg = closedOrders.find(
        (co) =>
          co.symboltoken === entryLeg.symboltoken &&
          co.transactiontype !== entryLeg.transactiontype,
      );
      if (exitLeg) {
        if (entryLeg.transactiontype === 'BUY') {
          totalPnl += (exitLeg.price - entryLeg.price) * entryLeg.quantity;
        } else {
          totalPnl += (entryLeg.price - exitLeg.price) * entryLeg.quantity;
        }
      }
    }

    pos.status = 'closed';
    pos.realizedPnl = totalPnl;
    positionsStore.writePosition(underlying, month, isPaper, pos);

    return exitSuccess;
  }

  private async placeExitLeg(
    entryOrder: OrderRecord,
    exitAction: 'BUY' | 'SELL',
    isPaper: boolean,
    isStoploss = false,
  ): Promise<OrderRecord | null> {
    const ltp = await brokerClient.getLtp(
      entryOrder.exchange,
      entryOrder.tradingsymbol,
      entryOrder.symboltoken,
    );

    if (isPaper) {
      logger.info(
        `[PAPER] Simulating exit fill: ${exitAction} ${entryOrder.quantity} ${entryOrder.tradingsymbol} @ ₹${ltp}`,
      );
      return {
        symboltoken: entryOrder.symboltoken,
        tradingsymbol: entryOrder.tradingsymbol,
        transactiontype: exitAction,
        quantity: entryOrder.quantity,
        exchange: entryOrder.exchange,
        orderid: `PAPER-EXIT-${Date.now()}`,
        status: 'COMPLETE',
        price: ltp,
      };
    }

    const maxSlippagePct = isStoploss ? 0.015 : 0.03;
    const maxAttempts = isStoploss ? 2 : 4;

    const repriceRes = await this.placeLimitOrderWithReprice(
      entryOrder,
      exitAction,
      maxSlippagePct,
      3000,
      maxAttempts,
    );

    if (repriceRes.cancelFailed) {
      logger.error(
        `Unconfirmed cancellation on exit leg ${entryOrder.tradingsymbol}. Aborting exit execution for this leg.`,
      );
      return null;
    }

    let orderid = repriceRes.orderid;

    if (!orderid) {
      logger.warn(
        `Limit reprice exhausted for exit leg ${entryOrder.tradingsymbol}. Sweeping at MARKET.`,
      );

      const orderParams: PlaceOrderParams = {
        variety: 'NORMAL',
        tradingsymbol: entryOrder.tradingsymbol,
        symboltoken: entryOrder.symboltoken,
        transactiontype: exitAction,
        exchange: entryOrder.exchange,
        ordertype: 'MARKET',
        producttype: 'CARRYFORWARD',
        duration: 'DAY',
        quantity: entryOrder.quantity,
      };

      try {
        orderid = await brokerClient.placeOrder(orderParams);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error executing exit fallback market order: ${msg}`);
        return null;
      }
    }

    try {
      const isComplete = await this.pollOrderStatus(orderid);
      if (!isComplete) return null;

      const orderBook = await brokerClient.getOrderBook();
      const filledOrder = orderBook.find((o) => o.orderid === orderid);
      const filledPrice = filledOrder?.averageprice || filledOrder?.price || ltp;

      return {
        symboltoken: entryOrder.symboltoken,
        tradingsymbol: entryOrder.tradingsymbol,
        transactiontype: exitAction,
        quantity: entryOrder.quantity,
        exchange: entryOrder.exchange,
        orderid,
        status: 'COMPLETE',
        price: filledPrice,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error executing exit order check: ${msg}`);
      return null;
    }
  }

  async monitorPnl(underlying: string, month: string, isPaper: boolean): Promise<void> {
    // If kill switch is active, do absolutely nothing (no exit)
    if (flagWatcher.isKillSwitched()) {
      logger.info('Kill switch is ACTIVE. Monitoring is paused (read-only).');
      return;
    }

    const pos = positionsStore.readPosition(underlying, month, isPaper);
    if (!pos || pos.status !== 'open') {
      return;
    }

    logger.info(`Monitoring P&L for ${underlying} month ${month}...`);

    let currentPnl = 0;
    for (const leg of pos.orders) {
      try {
        const ltp = await brokerClient.getLtp(leg.exchange, leg.tradingsymbol, leg.symboltoken);
        if (leg.transactiontype === 'BUY') {
          currentPnl += (ltp - leg.price) * leg.quantity;
        } else {
          currentPnl += (leg.price - ltp) * leg.quantity;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to get LTP for ${leg.tradingsymbol} during P&L monitor: ${msg}`);
      }
    }

    logger.info(`Current unrealized P&L for ${underlying}: ₹${currentPnl.toLocaleString()}`);

    // If cumulative loss exceeds 1.5% of the margin utilized, exit immediately
    const stoplossThreshold = -0.015 * pos.marginUtilized;
    // If cumulative profit exceeds 2.0% of the margin utilized, exit immediately
    const profitTargetThreshold = 0.02 * pos.marginUtilized;

    // Update position JSON with current mtm and unrealizedPnl
    pos.unrealizedPnl = currentPnl;
    pos.mtm = currentPnl;
    positionsStore.writePosition(underlying, month, isPaper, pos);

    logger.info(
      `[${underlying}] Stoploss threshold: ₹${stoplossThreshold.toLocaleString()} (1.5% of ₹${pos.marginUtilized.toLocaleString()})`,
    );
    logger.info(
      `[${underlying}] Profit target threshold: ₹${profitTargetThreshold.toLocaleString()} (2.0% of ₹${pos.marginUtilized.toLocaleString()})`,
    );

    if (currentPnl <= stoplossThreshold) {
      logger.warn(
        `Stoploss breached for ${underlying}! Current P&L (₹${currentPnl.toLocaleString()}) <= threshold (₹${stoplossThreshold.toLocaleString()})`,
      );

      const success = await this.executeExit(underlying, month, isPaper, true);
      if (success) {
        // Set skip state for rest of month
        positionsStore.setMonthlySkipState(underlying, month, isPaper, true);
        logger.info(`Set skip state for ${underlying} month ${month}.`);
        // Write monthly lockout flag
        const lockoutPath = path.resolve(process.cwd(), 'done-for-this-month');
        fs.writeFileSync(lockoutPath, 'lockout', 'utf-8');
        logger.info('Created monthly lockout flag done-for-this-month.');
      }
    } else if (currentPnl >= profitTargetThreshold) {
      logger.info(
        `Profit target reached for ${underlying}! Current P&L (₹${currentPnl.toLocaleString()}) >= threshold (₹${profitTargetThreshold.toLocaleString()})`,
      );

      const success = await this.executeExit(underlying, month, isPaper);
      if (success) {
        // Set skip state for rest of month
        positionsStore.setMonthlySkipState(underlying, month, isPaper, true);
        logger.info(`Set skip state for ${underlying} month ${month} after profit target exit.`);
        // Write monthly lockout flag
        const lockoutPath = path.resolve(process.cwd(), 'done-for-this-month');
        fs.writeFileSync(lockoutPath, 'lockout', 'utf-8');
        logger.info('Created monthly lockout flag done-for-this-month.');
      }
    }
  }

  async updateMarginUtilized(underlying: string, month: string, isPaper: boolean): Promise<void> {
    const position = positionsStore.readPosition(underlying, month, isPaper);
    if (!position || position.status !== 'open') {
      return;
    }

    logger.info(
      `Updating margin utilized for ${underlying} (month: ${month}, isPaper: ${isPaper})...`,
    );

    let newMargin = 0;
    if (isPaper) {
      newMargin = 150000 * 3; // simulated margin
    } else {
      try {
        const basket = position.orders.map((o) => ({
          exchange: o.exchange,
          symboltoken: o.symboltoken,
          quantity: o.quantity,
          action: o.transactiontype as 'BUY' | 'SELL',
        }));
        newMargin = await brokerClient.getMarginUtilized(basket);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to fetch updated margin utilized for ${underlying}: ${msg}`);
      }
    }

    if (newMargin > 0) {
      position.marginUtilized = newMargin;
      positionsStore.writePosition(underlying, month, isPaper, position);
      logger.info(
        `Successfully updated margin utilized for ${underlying} to ₹${newMargin.toLocaleString()}`,
      );
    }
  }
}

export const executionManager = new ExecutionManager();
export default executionManager;
