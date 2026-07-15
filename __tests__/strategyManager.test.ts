import { StrategyManager } from '../src/strategy/strategyManager';
import brokerClient from '../src/execution/brokerClient';
import instrumentManager from '../src/instruments/instrumentManager';
import { calculateDelta } from '../src/strategy/blackScholes';

jest.mock('../src/execution/brokerClient');
jest.mock('../src/instruments/instrumentManager');
jest.mock('../src/notify/notifier');
jest.mock('../src/strategy/blackScholes');
jest.mock('../src/logging/logger');

describe('StrategyManager', () => {
  let manager: StrategyManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new StrategyManager();
    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          map.set(token, {
            ltp: 100,
            bid: 99.5,
            ask: 100.5,
            bidQty: 1000,
            askQty: 1000,
          });
        }
        return map;
      },
    );
    (brokerClient.getOptionGreeks as jest.Mock).mockRejectedValue(new Error('API error'));
    (calculateDelta as jest.Mock).mockImplementation((_s, _k, _t, _v, _r, type) => {
      return type === 'CE' ? 0.12 : -0.12;
    });
  });

  test('checkVix passes when VIX is between 10 and 13.5', async () => {
    (instrumentManager.getVixToken as jest.Mock).mockReturnValue('26017');
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(12.5);

    const res = await manager.checkVix();
    expect(res.passed).toBe(true);
    expect(res.vix).toBe(12.5);
  });

  test('checkVix fails when VIX is out of range', async () => {
    (instrumentManager.getVixToken as jest.Mock).mockReturnValue('26017');
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(14.5);

    const res = await manager.checkVix();
    expect(res.passed).toBe(false);
  });

  test('checkVix fails when API error', async () => {
    (instrumentManager.getVixToken as jest.Mock).mockReturnValue('26017');
    (brokerClient.getLtp as jest.Mock).mockRejectedValueOnce(new Error('API error'));

    const res = await manager.checkVix();
    expect(res.passed).toBe(false);
  });

  test('checkVix fails when API error is a string', async () => {
    (instrumentManager.getVixToken as jest.Mock).mockReturnValue('26017');
    (brokerClient.getLtp as jest.Mock).mockRejectedValueOnce('API string error');

    const res = await manager.checkVix();
    expect(res.passed).toBe(false);
  });

  test('buildBasket resolves strikes based on closest delta and ±5% hedge band', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);

    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (instrumentManager.getInstrument as jest.Mock).mockImplementation(
      (underlying, expiry, strike, type) => {
        return {
          symboltoken: `token-${expiry}-${strike}-${type}`,
          tradingsymbol: `BANKNIFTY-${expiry}-${strike}-${type}`,
          lotsize: 15,
          exchange: 'NFO',
        };
      },
    );

    (calculateDelta as jest.Mock).mockImplementation((_s, strike, _t, _v, _r, type) => {
      if (type === 'CE') {
        if (strike === 45100) return 0.11;
        if (strike === 45200) return 0.14;
        if (strike === 45300) return 0.12;
        return 0.05;
      } else {
        if (strike === 44700) return -0.11;
        if (strike === 44800) return -0.14;
        if (strike === 44900) return -0.12;
        return -0.05;
      }
    });

    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          let ltp = 100;
          if (token.includes('25AUG2026')) {
            ltp = 101; // inside 5% band of 100
          }
          map.set(token, {
            ltp,
            bid: ltp - 0.5,
            ask: ltp + 0.5,
            bidQty: 1000,
            askQty: 1000,
          });
        }
        return map;
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY');

    expect(basket).not.toBeNull();
    expect(basket).toHaveLength(4);
    expect(basket?.[0].action).toBe('SELL');
  });

  test('buildBasket fails when not enough future expiries', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr]);

    const basket = await manager.buildBasket('BANKNIFTY');
    expect(basket).toBeNull();
  });

  test('buildBasket returns null when strike resolution fails', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (instrumentManager.getInstrument as jest.Mock).mockReturnValue(null);

    const basket = await manager.buildBasket('BANKNIFTY');
    expect(basket).toBeNull();
  });

  test('buildBasket fails if T0 CE candidates are not liquid/empty', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (instrumentManager.getInstrument as jest.Mock).mockImplementation(
      (underlying, expiry, strike, type) => {
        return {
          symboltoken: `token-${expiry}-${strike}-${type}`,
          tradingsymbol: `BANKNIFTY-${expiry}-${strike}-${type}`,
          lotsize: 15,
          exchange: 'NFO',
        };
      },
    );

    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          map.set(token, {
            ltp: 100,
            bid: 99.5,
            ask: 100.5,
            bidQty: 0, // not liquid
            askQty: 0,
          });
        }
        return map;
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY');
    expect(basket).toBeNull();
  });

  test('isLiquid validations', () => {
    const minLotsDepth = 2;
    const maxSpreadPct = 0.08;
    const inst = { lotsize: 50 } as any;

    expect(
      (manager as any).isLiquid(
        { ltp: 0, bid: 99.5, ask: 100.5, bidQty: 100, askQty: 100, inst },
        minLotsDepth,
        maxSpreadPct,
      ),
    ).toBe(false);
    expect(
      (manager as any).isLiquid(
        { ltp: 100, bid: 90, ask: 110, bidQty: 100, askQty: 100, inst },
        minLotsDepth,
        maxSpreadPct,
      ),
    ).toBe(false);
    expect(
      (manager as any).isLiquid(
        { ltp: 100, bid: 110, ask: 110, bidQty: 100, askQty: 100, inst },
        minLotsDepth,
        maxSpreadPct,
      ),
    ).toBe(false);
    expect(
      (manager as any).isLiquid(
        { ltp: 100, bid: 99.5, ask: 100.5, bidQty: 50, askQty: 100, inst },
        minLotsDepth,
        maxSpreadPct,
      ),
    ).toBe(false);
    expect(
      (manager as any).isLiquid(
        { ltp: 100, bid: 99.5, ask: 100.5, bidQty: 100, askQty: 50, inst },
        minLotsDepth,
        maxSpreadPct,
      ),
    ).toBe(false);
  });

  test('buildBasket returns null when no qualifying T0 CE strikes fall in 0.10-0.15 range', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (calculateDelta as jest.Mock).mockImplementation((_s, _k, _t, _v, _r, type) => {
      return type === 'CE' ? 0.05 : -0.12;
    });

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).toBeNull();
  });

  test('buildBasket returns null when no qualifying T0 PE strikes fall in 0.10-0.15 range', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (calculateDelta as jest.Mock).mockImplementation((_s, _k, _t, _v, _r, type) => {
      return type === 'CE' ? 0.12 : -0.05;
    });

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).toBeNull();
  });

  test('buildBasket returns null when CE hedge matching fails', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (brokerClient.getMarketDataBatch as jest.Mock).mockResolvedValue(new Map());

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).toBeNull();
  });

  test('findHedgeStrike performs upward widening fallback search correctly', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (calculateDelta as jest.Mock).mockImplementation((_s, strike, _t, _v, _r, type) => {
      if (type === 'CE') {
        if (strike === 45100) return 0.11;
        if (strike === 45200) return 0.14;
        if (strike === 45300) return 0.12;
        return 0.05;
      } else {
        if (strike === 44700) return -0.11;
        if (strike === 44800) return -0.14;
        if (strike === 44900) return -0.12;
        return -0.05;
      }
    });

    (instrumentManager.getInstrument as jest.Mock).mockImplementation(
      (underlying, expiry, strike, type) => {
        return {
          symboltoken: `token-${expiry}-${strike}-${type}`,
          tradingsymbol: `BANKNIFTY-${expiry}-${strike}-${type}`,
          lotsize: 15,
          exchange: 'NFO',
        };
      },
    );

    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          let ltp = 100;
          if (token.includes('25AUG2026')) {
            ltp = 5;
            if (token.includes('CE') && token.includes('44500')) {
              ltp = 96;
            }
            if (token.includes('PE') && token.includes('45500')) {
              ltp = 96;
            }
          }
          map.set(token, {
            ltp,
            bid: ltp - 0.5,
            ask: ltp + 0.5,
            bidQty: 1000,
            askQty: 1000,
          });
        }
        return map;
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).not.toBeNull();
    expect(basket).toHaveLength(4);
    const ceHedge = basket?.find((x) => x.action === 'BUY' && x.type === 'CE');
    expect(ceHedge?.strike).toBe(44500);
  });

  test('findHedgeStrike returns null if widening exceeds cap', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (calculateDelta as jest.Mock).mockImplementation((_s, strike, _t, _v, _r, type) => {
      if (type === 'CE') {
        if (strike === 45100) return 0.11;
        if (strike === 45200) return 0.14;
        if (strike === 45300) return 0.12;
        return 0.05;
      } else {
        if (strike === 44700) return -0.11;
        if (strike === 44800) return -0.14;
        if (strike === 44900) return -0.12;
        return -0.05;
      }
    });

    (instrumentManager.getInstrument as jest.Mock).mockImplementation(
      (underlying, expiry, strike, type) => {
        return {
          symboltoken: `token-${expiry}-${strike}-${type}`,
          tradingsymbol: `BANKNIFTY-${expiry}-${strike}-${type}`,
          lotsize: 15,
          exchange: 'NFO',
        };
      },
    );

    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          let ltp = 100;
          if (token.includes('25AUG2026')) {
            ltp = 0;
          }
          map.set(token, {
            ltp,
            bid: ltp - 0.5,
            ask: ltp + 0.5,
            bidQty: 1000,
            askQty: 1000,
          });
        }
        return map;
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).toBeNull();
  });

  test('buildBasket loads live option greeks IVs successfully', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (brokerClient.getOptionGreeks as jest.Mock).mockResolvedValue([
      {
        name: 'BANKNIFTY',
        expiry: todayStr,
        strikePrice: 45000,
        optionType: 'CE',
        impliedVolatility: 15,
      },
      {
        name: 'BANKNIFTY',
        expiry: todayStr,
        strikePrice: 45000,
        optionType: 'PE',
        impliedVolatility: 16,
      },
    ]);

    (instrumentManager.getInstrument as jest.Mock).mockImplementation(
      (underlying, expiry, strike, type) => {
        return {
          symboltoken: `token-${expiry}-${strike}-${type}`,
          tradingsymbol: `BANKNIFTY-${expiry}-${strike}-${type}`,
          lotsize: 15,
          exchange: 'NFO',
        };
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).not.toBeNull();
    expect(basket).toHaveLength(4);
  });

  test('buildBasket returns null when PE hedge matching fails', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          const isT1Pe = token.includes('25AUG2026') && token.includes('PE');
          map.set(token, {
            ltp: isT1Pe ? 0 : 100,
            bid: 99.5,
            ask: 100.5,
            bidQty: 1000,
            askQty: 1000,
          });
        }
        return map;
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).toBeNull();
  });

  test('findHedgeStrike fails when candidates are empty', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (calculateDelta as jest.Mock).mockImplementation((_s, strike, _t, _v, _r, type) => {
      if (type === 'CE') {
        if (strike === 45200) return 0.12;
        return 0.05;
      } else {
        if (strike === 44800) return -0.12;
        return -0.05;
      }
    });

    (instrumentManager.getInstrument as jest.Mock).mockImplementation(
      (underlying, expiry, strike, type) => {
        return {
          symboltoken: `token-${expiry}-${strike}-${type}`,
          tradingsymbol: `BANKNIFTY-${expiry}-${strike}-${type}`,
          lotsize: 15,
          exchange: 'NFO',
        };
      },
    );

    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          if (token.includes('16JUL2026')) {
            map.set(token, {
              ltp: 100,
              bid: 99.5,
              ask: 100.5,
              bidQty: 1000,
              askQty: 1000,
            });
          }
        }
        return map;
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).toBeNull();
  });

  test('findHedgeStrike returns closestCand directly when its LTP is already more expensive than band', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (calculateDelta as jest.Mock).mockImplementation((_s, strike, _t, _v, _r, type) => {
      if (type === 'CE') {
        if (strike === 45200) return 0.12;
        return 0.05;
      } else {
        if (strike === 44800) return -0.12;
        return -0.05;
      }
    });

    (instrumentManager.getInstrument as jest.Mock).mockImplementation(
      (underlying, expiry, strike, type) => {
        return {
          symboltoken: `token-${expiry}-${strike}-${type}`,
          tradingsymbol: `BANKNIFTY-${expiry}-${strike}-${type}`,
          lotsize: 15,
          exchange: 'NFO',
        };
      },
    );

    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          let ltp = 100;
          if (token.includes('25AUG2026')) {
            ltp = 110;
          }
          map.set(token, {
            ltp,
            bid: ltp - 0.5,
            ask: ltp + 0.5,
            bidQty: 1000,
            askQty: 1000,
          });
        }
        return map;
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY', true);
    expect(basket).not.toBeNull();
    expect(basket).toHaveLength(4);
    const ceHedge = basket?.find((x) => x.action === 'BUY' && x.type === 'CE');
    expect(ceHedge?.ltp).toBe(110);
  });

  test('findHedgeStrike performs upward widening fallback search correctly with liquidity checks active', async () => {
    const todayStr = '16JUL2026';
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue([todayStr, '25AUG2026']);
    (brokerClient.getLtp as jest.Mock).mockResolvedValueOnce(45000).mockResolvedValueOnce(12.5);

    (calculateDelta as jest.Mock).mockImplementation((_s, strike, _t, _v, _r, type) => {
      if (type === 'CE') {
        if (strike === 45100) return 0.11;
        if (strike === 45200) return 0.14;
        if (strike === 45300) return 0.12;
        return 0.05;
      } else {
        if (strike === 44700) return -0.11;
        if (strike === 44800) return -0.14;
        if (strike === 44900) return -0.12;
        return -0.05;
      }
    });

    (instrumentManager.getInstrument as jest.Mock).mockImplementation(
      (underlying, expiry, strike, type) => {
        return {
          symboltoken: `token-${expiry}-${strike}-${type}`,
          tradingsymbol: `BANKNIFTY-${expiry}-${strike}-${type}`,
          lotsize: 15,
          exchange: 'NFO',
        };
      },
    );

    (brokerClient.getMarketDataBatch as jest.Mock).mockImplementation(
      async (exchange: string, tokens: string[]) => {
        const map = new Map();
        for (const token of tokens) {
          let ltp = 100;
          let bidQty = 1000;
          let askQty = 1000;
          if (token.includes('25AUG2026')) {
            ltp = 5; // cheap
            if (token.includes('CE')) {
              if (token.includes('44700')) {
                ltp = 98; // closest, but NOT liquid (qty = 0)
                bidQty = 0;
                askQty = 0;
              } else if (token.includes('44600')) {
                ltp = 97; // next closest, but NOT liquid (qty = 0)
                bidQty = 0;
                askQty = 0;
              } else if (token.includes('44500')) {
                ltp = 96; // liquid and in range
              }
            }
            if (token.includes('PE')) {
              if (token.includes('45300')) {
                ltp = 98; // closest, but NOT liquid
                bidQty = 0;
                askQty = 0;
              } else if (token.includes('45400')) {
                ltp = 97; // next closest, but NOT liquid
                bidQty = 0;
                askQty = 0;
              } else if (token.includes('45500')) {
                ltp = 96; // liquid and in range
              }
            }
          }
          map.set(token, {
            ltp,
            bid: ltp - 0.05,
            ask: ltp + 0.05,
            bidQty,
            askQty,
          });
        }
        return map;
      },
    );

    const basket = await manager.buildBasket('BANKNIFTY', false);
    expect(basket).not.toBeNull();
  });
});
