import env from '../schemas/env';
import sessionManager from '../auth/session';
import httpClient from '../http/httpClient';
import {
  SmartApiLtpResponseSchema,
  SmartApiOrderResponseSchema,
  SmartApiOrderBookResponseSchema,
  MarginCalculatorResponseSchema,
  SmartApiQuoteResponseSchema,
  OrderBookItem,
  OptionGreekItem,
  SmartApiOptionGreeksResponseSchema,
} from '../schemas/smartApi';
import logger from '../logging/logger';

export interface PlaceOrderParams {
  variety: string;
  tradingsymbol: string;
  symboltoken: string;
  transactiontype: 'BUY' | 'SELL';
  exchange: string;
  ordertype: string;
  producttype: string;
  duration: string;
  quantity: number;
  price?: number;
}

export interface MarginLeg {
  exchange: string;
  symboltoken: string;
  quantity: number;
  action: 'BUY' | 'SELL';
}

export interface OptionQuote {
  symbolToken: string;
  ltp: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
}

export interface IBrokerClient {
  getLtp(exchange: string, tradingsymbol: string, symboltoken: string): Promise<number>;
  getMarketData(
    exchange: string,
    symboltoken: string,
  ): Promise<{ ltp: number; bid: number; ask: number }>;
  getMarketDataBatch(exchange: string, symboltokens: string[]): Promise<Map<string, OptionQuote>>;
  placeOrder(params: PlaceOrderParams): Promise<string>;
  cancelOrder(orderid: string, variety: string): Promise<void>;
  getOrderBook(): Promise<OrderBookItem[]>;
  getMarginUtilized(basket: MarginLeg[]): Promise<number>;
  getOptionGreeks(name: string, expirydate: string): Promise<OptionGreekItem[]>;
}

export class BrokerClient implements IBrokerClient {
  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-PrivateKey': env.API_KEY,
      'X-ClientLocalIP': '127.0.0.1',
      'X-ClientPublicIP': '127.0.0.1',
      'X-MACaddress': '00-00-00-00-00-00',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      Authorization: `Bearer ${sessionManager.getJwtToken()}`,
    };
  }

  async getLtp(exchange: string, tradingsymbol: string, symboltoken: string): Promise<number> {
    const url = 'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getLtpData';
    const payload = {
      exchange,
      tradingsymbol,
      symboltoken,
    };

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const parsed = SmartApiLtpResponseSchema.parse(response);
      if (!parsed.status || !parsed.data) {
        throw new Error(`LTP check failed: ${parsed.message}`);
      }
      return parsed.data.ltp;
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting LTP for ${tradingsymbol}: ${msg}`);
      throw error;
    }
  }

  async getMarketData(
    exchange: string,
    symboltoken: string,
  ): Promise<{ ltp: number; bid: number; ask: number }> {
    const url = 'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote';
    const payload = {
      mode: 'FULL',
      exchangeTokens: {
        [exchange]: [symboltoken],
      },
    };

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const parsed = SmartApiQuoteResponseSchema.parse(response);
      if (
        !parsed.status ||
        !parsed.data ||
        !parsed.data.fetched ||
        parsed.data.fetched.length === 0
      ) {
        throw new Error(`Market quote check failed: ${parsed.message}`);
      }

      const item = parsed.data.fetched[0];
      const ltp = item.ltp;
      const buyOrders = item.depth?.buy || [];
      const sellOrders = item.depth?.sell || [];

      const bid = buyOrders.length > 0 ? buyOrders[0].price : ltp;
      const ask = sellOrders.length > 0 ? sellOrders[0].price : ltp;

      return { ltp, bid, ask };
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting market quote for token ${symboltoken}: ${msg}`);
      throw error;
    }
  }

  async getMarketDataBatch(
    exchange: string,
    symboltokens: string[],
  ): Promise<Map<string, OptionQuote>> {
    const resultMap = new Map<string, OptionQuote>();
    if (symboltokens.length === 0) {
      return resultMap;
    }

    // Angel One's /rest/secure/angelbroking/market/v1/quote endpoint in FULL mode
    // accepts a maximum of 50 symbol tokens per API request.
    const chunkSize = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < symboltokens.length; i += chunkSize) {
      chunks.push(symboltokens.slice(i, i + chunkSize));
    }

    const url = 'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote';

    const promises = chunks.map(async (chunk) => {
      const payload = {
        mode: 'FULL',
        exchangeTokens: {
          [exchange]: chunk,
        },
      };

      try {
        const response = await httpClient.request<unknown>(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        const parsed = SmartApiQuoteResponseSchema.parse(response);
        if (!parsed.status || !parsed.data || !parsed.data.fetched) {
          throw new Error(`Market quote batch check failed: ${parsed.message}`);
        }

        for (const item of parsed.data.fetched) {
          const ltp = item.ltp;
          const buyOrders = item.depth?.buy || [];
          const sellOrders = item.depth?.sell || [];

          const bid = buyOrders.length > 0 ? buyOrders[0].price : ltp;
          const bidQty = buyOrders.length > 0 ? buyOrders[0].quantity : 0;
          const ask = sellOrders.length > 0 ? sellOrders[0].price : ltp;
          const askQty = sellOrders.length > 0 ? sellOrders[0].quantity : 0;

          resultMap.set(item.symbolToken, {
            symbolToken: item.symbolToken,
            ltp,
            bid,
            ask,
            bidQty,
            askQty,
          });
        }
      } catch (error: unknown) {
        /* istanbul ignore next */
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Error getting market quote batch: ${msg}`);
        throw error;
      }
    });

    await Promise.all(promises);
    return resultMap;
  }

  async placeOrder(params: PlaceOrderParams): Promise<string> {
    const url = 'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder';
    const payload = {
      variety: params.variety,
      tradingsymbol: params.tradingsymbol,
      symboltoken: params.symboltoken,
      transactiontype: params.transactiontype,
      exchange: params.exchange,
      ordertype: params.ordertype,
      producttype: params.producttype,
      duration: params.duration,
      price: String(params.price ?? 0),
      quantity: String(params.quantity),
    };

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const parsed = SmartApiOrderResponseSchema.parse(response);
      if (!parsed.status || !parsed.data) {
        throw new Error(`Order placement failed: ${parsed.message}`);
      }
      return parsed.data.orderid;
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error placing order for ${params.tradingsymbol}: ${msg}`);
      throw error;
    }
  }

  async cancelOrder(orderid: string, variety: string): Promise<void> {
    const url = 'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/cancelOrder';
    const payload = {
      orderid,
      variety,
    };

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const parsed = SmartApiOrderResponseSchema.parse(response);
      if (!parsed.status || !parsed.data) {
        throw new Error(`Order cancellation failed: ${parsed.message}`);
      }
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error cancelling order ${orderid}: ${msg}`);
      throw error;
    }
  }

  async getOrderBook(): Promise<OrderBookItem[]> {
    const url = 'https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getOrderBook';

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const parsed = SmartApiOrderBookResponseSchema.parse(response);
      if (!parsed.status || !parsed.data) {
        throw new Error(`Failed to fetch OrderBook: ${parsed.message}`);
      }
      return parsed.data;
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting OrderBook: ${msg}`);
      throw error;
    }
  }

  async getMarginUtilized(basket: MarginLeg[]): Promise<number> {
    // Exact path: /rest/secure/angelbroking/margin/v1/batch
    const url = 'https://apiconnect.angelone.in/rest/secure/angelbroking/margin/v1/batch';

    // Map basket legs to Angel batch margin structure
    // Typically: { positions: [ { exchange, symboltoken, quantity, transactiontype, price, producttype } ] }
    const positions = basket.map((leg) => ({
      exchange: leg.exchange,
      token: leg.symboltoken,
      qty: leg.quantity,
      tradeType: leg.action,
      price: 0,
      productType: 'CARRYFORWARD',
      orderType: 'MARKET',
    }));

    const payload = { positions };

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const parsed = MarginCalculatorResponseSchema.parse(response);
      if (!parsed.status || !parsed.data) {
        throw new Error(`Margin calculation failed: ${parsed.message}`);
      }

      // Return marginUtilized if present, or totalMarginRequired as fallback
      return parsed.data.marginUtilized ?? parsed.data.totalMarginRequired ?? 0;
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error calculating batch margin: ${msg}. Returning fallback margin.`);
      // Return a reasonable fallback margin if API fails (e.g. 1.5 Lakhs per calendar pair * 3)
      return 130000;
    }
  }

  async getOptionGreeks(name: string, expirydate: string): Promise<OptionGreekItem[]> {
    const url = 'https://apiconnect.angelone.in/rest/secure/angelbroking/marketData/v1/optionGreek';
    const payload = {
      name,
      expirydate,
    };

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const parsed = SmartApiOptionGreeksResponseSchema.parse(response);
      if (!parsed.status) {
        throw new Error(`Option Greeks check failed: ${parsed.message}`);
      }
      return parsed.data || [];
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting option greeks for ${name} expiry ${expirydate}: ${msg}`);
      throw error;
    }
  }
}

export const brokerClient = new BrokerClient();
export default brokerClient;
