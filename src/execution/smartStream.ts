import WebSocket from 'ws';
import env from '../schemas/env';
import sessionManager from '../auth/session';
import logger from '../logging/logger';
import flagWatcher from '../flags/flagWatcher';
import positionsStore from '../positions/positionsStore';

export interface TickData {
  token: string;
  ltp: number;
}

export type TickCallback = (tick: TickData) => void;

class SmartStreamClient {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private mockInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private callback: TickCallback | null = null;
  private subscribedTokens: Set<string> = new Set();
  private ltpCache: Map<string, number> = new Map();

  getCachedLtp(token: string): number | null {
    return this.ltpCache.get(token) || null;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  async connect(callback: TickCallback): Promise<void> {
    this.callback = (tick: TickData) => {
      this.ltpCache.set(tick.token, tick.ltp);
      callback(tick);
    };

    if (flagWatcher.isPaperMode()) {
      logger.info('Starting SmartStream Client in [PAPER MODE] mock tick generator');
      this.startMockGenerator();
      this.isConnected = true;
      return;
    }

    // Refresh session before connecting
    try {
      logger.info('Refreshing session before connecting/reconnecting SmartStream WebSocket...');
      try {
        await sessionManager.refreshSession();
      } catch (refreshErr: any) {
        logger.warn(`Session refresh failed: ${refreshErr.message}. Attempting full login...`);
        await sessionManager.login();
      }
    } catch (authError: any) {
      logger.error(
        `Failed to refresh session or login during SmartStream connect: ${authError?.message || authError}`,
      );
      this.isConnected = false;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      setTimeout(() => {
        this.connect(callback);
      }, 5000);
      return;
    }

    try {
      const jwtToken = sessionManager.getJwtToken();
      const feedToken = sessionManager.getFeedToken();

      if (!jwtToken) {
        logger.error('Cannot connect to WebSocket: JWT Token is missing');
        return;
      }
      if (!feedToken) {
        logger.error('Cannot connect to WebSocket: Feed Token is missing');
        return;
      }

      const url = 'wss://smartapisocket.angelone.in/smart-stream';
      const wsHeaders: Record<string, string> = {
        Authorization: 'Bearer ' + jwtToken,
        'x-api-key': env.API_KEY,
        'x-client-code': env.CLIENT_CODE,
        'x-feed-token': feedToken,
      };

      this.ws = new WebSocket(url, {
        headers: wsHeaders,
        rejectUnauthorized: false,
      });

      this.ws.on('open', () => {
        logger.info('SmartStream WebSocket connection established successfully.');
        this.isConnected = true;

        // Clear any existing heartbeat
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
        }

        // Heartbeat: re-subscribe every 45s to keep the connection alive.
        // Angel One's SmartStream drops idle WebSockets after ~120s.
        // Standard ws.ping() frames are not responded to, so we re-subscribe instead.
        this.heartbeatInterval = setInterval(() => {
          if (this.ws && this.isConnected && this.subscribedTokens.size > 0) {
            logger.info('SmartStream heartbeat: re-subscribing to tokens...');
            this.subscribe(Array.from(this.subscribedTokens));
          }
        }, 45000);

        // Re-subscribe if we had previous tokens
        if (this.subscribedTokens.size > 0) {
          this.subscribe(Array.from(this.subscribedTokens));
        }
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          if (Buffer.isBuffer(data)) {
            const type = data.readUInt8(0);
            const isLtpOrQuote = type === 1 || type === 2 || type === 3;
            if (isLtpOrQuote && data.length >= 51) {
              const tokenBuffer = data.slice(2, 27);
              const token = tokenBuffer.toString('utf8').replace(/\0/g, '').trim();
              const ltpRaw = data.readBigInt64LE(43);
              const ltp = Number(ltpRaw) / 100;

              if (token && ltp > 0) {
                if (this.callback) {
                  this.callback({ token, ltp });
                }
              }
            }
          }
        } catch (err: any) {
          logger.error(`Error parsing WebSocket binary message: ${err?.message || err}`);
        }
      });

      this.ws.on('error', (err: any) => {
        logger.error(`SmartStream WebSocket error: ${err?.message || err}`);
      });

      this.ws.on('close', () => {
        logger.warn('SmartStream WebSocket connection closed. Attempting reconnect in 5s...');
        this.isConnected = false;
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        setTimeout(() => {
          this.connect(callback);
        }, 5000);
      });
    } catch (error: any) {
      logger.error(`Failed to initiate SmartStream connection: ${error?.message || error}`);
    }
  }

  subscribe(tokens: string[]): void {
    tokens.forEach((t) => this.subscribedTokens.add(t));

    if (flagWatcher.isPaperMode()) {
      logger.info(`Mock subscribed to tokens: ${tokens.join(', ')}`);
      return;
    }

    if (this.ws && this.isConnected) {
      const payload = {
        action: 1, // 1 = Subscribe
        params: {
          mode: 1, // 1 = LTP
          tokenList: tokens.map((t) => ({
            exchangeType: 2, // 2 = NFO (Options)
            tokens: [t],
          })),
        },
      };
      this.ws.send(JSON.stringify(payload));
      logger.info(`Subscribed to SmartStream tokens: ${tokens.join(', ')}`);
    }
  }

  disconnect(): void {
    this.stopMockGenerator();
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.subscribedTokens.clear();
    this.ltpCache.clear();
    logger.info('SmartStream WebSocket disconnected.');
  }

  private startMockGenerator(): void {
    this.stopMockGenerator();
    this.mockInterval = setInterval(() => {
      if (!this.callback) return;

      const currentMonth = positionsStore.getCurrentMonthString();
      const openOrders: Array<{ symboltoken: string; price: number }> = [];
      const seenTokens = new Set<string>();

      const positions = positionsStore.readPosition('BANKNIFTY', currentMonth, true);
      if (positions && positions.status === 'open') {
        for (const order of positions.orders) {
          if (!seenTokens.has(order.symboltoken)) {
            seenTokens.add(order.symboltoken);
            openOrders.push(order);
          }
        }
      }

      if (openOrders.length === 0) {
        for (const token of this.subscribedTokens) {
          const ltp = 100 + (Math.random() - 0.5) * 5;
          this.callback({ token, ltp: parseFloat(ltp.toFixed(2)) });
        }
        return;
      }

      for (const order of openOrders) {
        if (this.subscribedTokens.has(order.symboltoken)) {
          const currentPrice = this.ltpCache.get(order.symboltoken) || order.price;
          const change = (Math.random() - 0.53) * 1.5;
          const nextPrice = Math.max(0.05, currentPrice + change);
          this.callback({
            token: order.symboltoken,
            ltp: parseFloat(nextPrice.toFixed(2)),
          });
        }
      }
    }, 1500);
  }

  private stopMockGenerator(): void {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }
}

export const smartStream = new SmartStreamClient();
export default smartStream;
