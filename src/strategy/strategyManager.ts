import dayjs from 'dayjs';
import logger from '../logging/logger';
import instrumentManager from '../instruments/instrumentManager';
import brokerClient from '../execution/brokerClient';
import { calculateDelta } from './blackScholes';
import { InstrumentCacheEntry } from '../schemas/smartApi';
import env from '../schemas/env';

export interface StrategyLeg {
  action: 'BUY' | 'SELL';
  quantity: number;
  expiry: string;
  strike: number;
  type: 'CE' | 'PE';
  symboltoken: string;
  tradingsymbol: string;
  exchange: string;
  lotsize: number;
  targetDelta: number;
  actualDelta: number;
  ltp?: number;
}

export interface LiquidCandidate {
  strike: number;
  inst: InstrumentCacheEntry;
  ltp: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  delta?: number;
}

export interface IStrategyManager {
  checkVix(): Promise<{ passed: boolean; vix: number }>;
  buildBasket(underlying: string, skipLiquidityCheck?: boolean): Promise<StrategyLeg[] | null>;
}

export class StrategyManager implements IStrategyManager {
  async checkVix(): Promise<{ passed: boolean; vix: number }> {
    logger.info('Performing VIX entry filter check...');
    try {
      const vixToken = instrumentManager.getVixToken();
      const vix = await brokerClient.getLtp('NSE', 'INDIA VIX', vixToken);
      logger.info(`Current India VIX: ${vix}`);
      const passed = vix >= 10 && vix <= 13.5;
      return { passed, vix };
      /* istanbul ignore next */
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to check VIX: ${msg}. Proceeding assuming VIX check fails.`);
      return { passed: false, vix: 0 };
    }
  }

  private async getLiquidCandidates(
    underlying: string,
    expiry: string,
    type: 'CE' | 'PE',
    strikes: number[],
  ): Promise<LiquidCandidate[]> {
    const instrumentsWithStrikes: { strike: number; inst: InstrumentCacheEntry }[] = [];
    for (const strike of strikes) {
      const inst = instrumentManager.getInstrument(underlying, expiry, strike, type);
      if (inst) {
        instrumentsWithStrikes.push({ strike, inst });
      }
    }

    if (instrumentsWithStrikes.length === 0) {
      return [];
    }

    const exchange = instrumentsWithStrikes[0].inst.exchange;
    const tokens = instrumentsWithStrikes.map((x) => x.inst.symboltoken);

    const marketDataMap = await brokerClient.getMarketDataBatch(exchange, tokens);

    const candidates: LiquidCandidate[] = [];
    for (const { strike, inst } of instrumentsWithStrikes) {
      const quote = marketDataMap.get(inst.symboltoken);
      if (quote) {
        candidates.push({
          strike,
          inst,
          ltp: quote.ltp,
          bid: quote.bid,
          ask: quote.ask,
          bidQty: quote.bidQty,
          askQty: quote.askQty,
        });
      }
    }
    return candidates;
  }

  private isLiquid(
    candidate: LiquidCandidate,
    minLotsDepth = 2,
    maxSpreadPct = 0.08,
    maxMidpointDiffPct = 0.08,
  ): boolean {
    const { ltp, bid, ask, bidQty, askQty, inst } = candidate;
    if (ltp <= 0) return false;
    if ((ask - bid) / ltp > maxSpreadPct) return false;
    if (Math.abs(ltp - (ask + bid) / 2) / ltp > maxMidpointDiffPct) return false;
    if (bidQty < minLotsDepth * inst.lotsize) return false;
    if (askQty < minLotsDepth * inst.lotsize) return false;
    return true;
  }

  private findHedgeStrike(
    shortLtp: number,
    candidates: LiquidCandidate[], // sorted by strike ascending
    type: 'CE' | 'PE',
    skipLiquidityCheck: boolean,
    widenCap = 10,
  ): LiquidCandidate | null {
    const S = shortLtp;
    const lowerBound = S * 0.9;
    const upperBound = S * 1.1;

    // 1. Try to find the closest within the ±10% band
    let bestInBand: LiquidCandidate | null = null;
    let minDiff = Infinity;

    for (const c of candidates) {
      if (c.ltp >= lowerBound && c.ltp <= upperBound) {
        const isCandLiquid = skipLiquidityCheck || this.isLiquid(c);
        if (isCandLiquid) {
          const diff = Math.abs(c.ltp - S);
          if (diff < minDiff) {
            minDiff = diff;
            bestInBand = c;
          }
        }
      }
    }

    if (bestInBand) {
      return bestInBand;
    }

    // 2. Fallback: find the strike closest to S, and widen to more expensive premiums
    let closestIndex = -1;
    let closestDiff = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const diff = Math.abs(candidates[i].ltp - S);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    if (closestIndex === -1) {
      return null;
    }

    const closestCand = candidates[closestIndex];

    /* istanbul ignore next */
    if (closestCand.ltp >= lowerBound && (skipLiquidityCheck || this.isLiquid(closestCand))) {
      return closestCand;
    }

    // CE higher premium means lower strike. Moving left in candidates (which is sorted by strike ascending)
    // PE higher premium means higher strike. Moving right in candidates
    const stepDirection = type === 'CE' ? -1 : 1;

    /* istanbul ignore next */
    for (let step = 1; step <= widenCap; step++) {
      const nextIndex = closestIndex + step * stepDirection;
      if (nextIndex < 0 || nextIndex >= candidates.length) {
        break;
      }
      const cand = candidates[nextIndex];
      if (cand.ltp >= lowerBound) {
        const isCandLiquid = skipLiquidityCheck || this.isLiquid(cand);
        if (isCandLiquid) {
          logger.info(
            `Hedge search widened by ${step} steps to strike ${cand.strike} (LTP: ${cand.ltp})`,
          );
          return cand;
        }
      }
    }

    return null;
  }

  async buildBasket(underlying: string, skipLiquidityCheck = false): Promise<StrategyLeg[] | null> {
    logger.info(`Building strategy basket for ${underlying}...`);

    // 1. Resolve Expiry_T0 and Expiry_T1
    const expiries = instrumentManager.getExpiries(underlying);
    const now = dayjs();

    const futureExpiries = expiries.filter((exp) => {
      const expDate = dayjs(exp, 'DDMMMYYYY').endOf('day');
      /* istanbul ignore next */
      return expDate.isAfter(now) || expDate.isSame(now, 'day');
    });

    if (futureExpiries.length < 2) {
      logger.error(`Not enough future expiries found for ${underlying}. Found: ${futureExpiries}`);
      return null;
    }

    const expiryT0 = futureExpiries[0];
    const expiryT1 = futureExpiries[1];
    logger.info(`Resolved Expiry_T0: ${expiryT0}, Expiry_T1: ${expiryT1}`);

    // 2. Fetch underlying price (LTP)
    const underlyingToken = '99926009'; // BANKNIFTY Index token
    const underlyingExchange = 'NSE';
    const underlyingLtp = await brokerClient.getLtp(
      underlyingExchange,
      'Nifty Bank',
      underlyingToken,
    );
    logger.info(`Underlying ${underlying} LTP: ${underlyingLtp}`);

    // 3. Fetch VIX as proxy for IV
    const vixToken = instrumentManager.getVixToken();
    const vix = await brokerClient.getLtp('NSE', 'INDIA VIX', vixToken);
    const vixIv = vix / 100;

    let atmCeIv = vixIv;
    let atmPeIv = vixIv;
    const ivMap = new Map<number, number>();
    try {
      const greeks = await brokerClient.getOptionGreeks(underlying, expiryT0);
      for (const item of greeks) {
        ivMap.set(Math.round(item.strikePrice), item.impliedVolatility / 100);
      }
      const atmStrike = Math.round(underlyingLtp / 100) * 100;
      const atmCe = greeks.find(
        (item) => Math.round(item.strikePrice) === atmStrike && item.optionType === 'CE',
      );
      if (atmCe) {
        atmCeIv = atmCe.impliedVolatility / 100;
      }
      const atmPe = greeks.find(
        (item) => Math.round(item.strikePrice) === atmStrike && item.optionType === 'PE',
      );
      if (atmPe) {
        atmPeIv = atmPe.impliedVolatility / 100;
      }
      logger.info(
        `Atm CE IV: ${(atmCeIv * 100).toFixed(2)}%, Atm PE IV: ${(atmPeIv * 100).toFixed(2)}%`,
      );
    } catch (err: unknown) {
      /* istanbul ignore next */
      logger.warn(
        `Failed to fetch option greeks / IV map for ${underlying} on ${expiryT0}. Falling back to VIX.`,
      );
    }

    // 4. Find option strikes with closest deltas
    const candidateStrikes: number[] = [];
    const minStrike = Math.round((underlyingLtp * 0.8) / 100) * 100;
    const maxStrike = Math.round((underlyingLtp * 1.2) / 100) * 100;

    for (let strike = minStrike; strike <= maxStrike; strike += 100) {
      candidateStrikes.push(strike);
    }

    const t0ExpDate = dayjs(expiryT0, 'DDMMMYYYY').hour(15).minute(30);
    const t0DaysToExpiry = Math.max(0.01, t0ExpDate.diff(now, 'day', true));
    const t0 = t0DaysToExpiry / 365;

    const t1ExpDate = dayjs(expiryT1, 'DDMMMYYYY').hour(15).minute(30);
    const t1DaysToExpiry = Math.max(0.01, t1ExpDate.diff(now, 'day', true));
    const t1 = t1DaysToExpiry / 365;

    // A. Resolve Short CE Leg (T0)
    const t0CeCandidates = await this.getLiquidCandidates(
      underlying,
      expiryT0,
      'CE',
      candidateStrikes,
    );
    for (const c of t0CeCandidates) {
      c.delta = Math.abs(calculateDelta(underlyingLtp, c.strike, t0, atmCeIv, 0.07, 'CE'));
    }
    const t0CeFiltered = t0CeCandidates.filter(
      (c) => c.delta! >= 0.1 && c.delta! <= 0.15 && (skipLiquidityCheck || this.isLiquid(c)),
    );
    if (t0CeFiltered.length === 0) {
      logger.error(`No qualifying T0 CE strikes in delta range 0.10-0.15 for ${underlying}.`);
      return null;
    }
    const shortCe = t0CeFiltered.reduce((best, cur) => {
      const curDiff = Math.abs(cur.delta! - 0.15);
      const bestDiff = Math.abs(best.delta! - 0.15);
      if (curDiff < bestDiff) {
        return cur;
      }
      return best;
    }, t0CeFiltered[0]);

    // B. Resolve Short PE Leg (T0)
    const t0PeCandidates = await this.getLiquidCandidates(
      underlying,
      expiryT0,
      'PE',
      candidateStrikes,
    );
    for (const c of t0PeCandidates) {
      const rawIv = ivMap.get(c.strike) ?? atmPeIv;
      const iv = Math.min(rawIv, 1.5 * vixIv);
      c.delta = Math.abs(calculateDelta(underlyingLtp, c.strike, t0, iv, 0.07, 'PE'));
    }
    const t0PeFiltered = t0PeCandidates.filter(
      (c) => c.delta! >= 0.1 && c.delta! <= 0.15 && (skipLiquidityCheck || this.isLiquid(c)),
    );
    if (t0PeFiltered.length === 0) {
      logger.error(`No qualifying T0 PE strikes in delta range 0.10-0.15 for ${underlying}.`);
      return null;
    }
    const shortPe = t0PeFiltered.reduce((best, cur) => {
      const curDiff = Math.abs(cur.delta! - 0.15);
      const bestDiff = Math.abs(best.delta! - 0.15);
      if (curDiff < bestDiff) {
        return cur;
      }
      return best;
    }, t0PeFiltered[0]);

    // C. Resolve T1 CE Hedge Leg
    const t1CeCandidates = await this.getLiquidCandidates(
      underlying,
      expiryT1,
      'CE',
      candidateStrikes,
    );
    const hedgeCe = this.findHedgeStrike(shortCe.ltp, t1CeCandidates, 'CE', skipLiquidityCheck);
    if (!hedgeCe) {
      logger.error(`No valid T1 CE hedge strike found for ${underlying}.`);
      return null;
    }

    // D. Resolve T1 PE Hedge Leg
    const t1PeCandidates = await this.getLiquidCandidates(
      underlying,
      expiryT1,
      'PE',
      candidateStrikes,
    );
    const hedgePe = this.findHedgeStrike(shortPe.ltp, t1PeCandidates, 'PE', skipLiquidityCheck);
    if (!hedgePe) {
      logger.error(`No valid T1 PE hedge strike found for ${underlying}.`);
      return null;
    }

    // Calculate delta for hedges to store in basket metadata
    hedgeCe.delta = Math.abs(
      calculateDelta(underlyingLtp, hedgeCe.strike, t1, atmCeIv, 0.07, 'CE'),
    );

    const rawPeHedgeIv = ivMap.get(hedgePe.strike) ?? atmPeIv;
    const peHedgeIv = Math.min(rawPeHedgeIv, 1.5 * vixIv);
    hedgePe.delta = Math.abs(
      calculateDelta(underlyingLtp, hedgePe.strike, t1, peHedgeIv, 0.07, 'PE'),
    );

    const basket: StrategyLeg[] = [
      {
        action: 'SELL',
        quantity: shortCe.inst.lotsize * env.LOTS,
        expiry: expiryT0,
        strike: shortCe.strike,
        type: 'CE',
        symboltoken: shortCe.inst.symboltoken,
        tradingsymbol: shortCe.inst.tradingsymbol,
        exchange: shortCe.inst.exchange,
        lotsize: shortCe.inst.lotsize,
        targetDelta: 0.15,
        actualDelta: shortCe.delta!,
        ltp: shortCe.ltp,
      },
      {
        action: 'SELL',
        quantity: shortPe.inst.lotsize * env.LOTS,
        expiry: expiryT0,
        strike: shortPe.strike,
        type: 'PE',
        symboltoken: shortPe.inst.symboltoken,
        tradingsymbol: shortPe.inst.tradingsymbol,
        exchange: shortPe.inst.exchange,
        lotsize: shortPe.inst.lotsize,
        targetDelta: 0.15,
        actualDelta: shortPe.delta!,
        ltp: shortPe.ltp,
      },
      {
        action: 'BUY',
        quantity: hedgeCe.inst.lotsize * env.LOTS,
        expiry: expiryT1,
        strike: hedgeCe.strike,
        type: 'CE',
        symboltoken: hedgeCe.inst.symboltoken,
        tradingsymbol: hedgeCe.inst.tradingsymbol,
        exchange: hedgeCe.inst.exchange,
        lotsize: hedgeCe.inst.lotsize,
        targetDelta: hedgeCe.delta!,
        actualDelta: hedgeCe.delta!,
        ltp: hedgeCe.ltp,
      },
      {
        action: 'BUY',
        quantity: hedgePe.inst.lotsize * env.LOTS,
        expiry: expiryT1,
        strike: hedgePe.strike,
        type: 'PE',
        symboltoken: hedgePe.inst.symboltoken,
        tradingsymbol: hedgePe.inst.tradingsymbol,
        exchange: hedgePe.inst.exchange,
        lotsize: hedgePe.inst.lotsize,
        targetDelta: hedgePe.delta!,
        actualDelta: hedgePe.delta!,
        ltp: hedgePe.ltp,
      },
    ];

    logger.info('Successfully constructed strategy basket:');
    basket.forEach((leg) => {
      logger.info(
        `- ${leg.action} ${leg.quantity} (${leg.quantity / leg.lotsize} lots) ${leg.tradingsymbol} (Strike: ${leg.strike}, Delta: ${leg.actualDelta.toFixed(3)}, LTP: ${leg.ltp})`,
      );
    });

    return basket;
  }
}

export const strategyManager = new StrategyManager();
export default strategyManager;
