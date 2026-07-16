import { BrokerClient } from '../src/execution/brokerClient';
import httpClient from '../src/http/httpClient';
import sessionManager from '../src/auth/session';

jest.mock('../src/http/httpClient');
jest.mock('../src/auth/session');

describe('BrokerClient', () => {
  let client: BrokerClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new BrokerClient();
    (sessionManager.getJwtToken as jest.Mock).mockReturnValue('mock_jwt');
  });

  test('getLtp returns ltp value', async () => {
    const mockLtpRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        exchange: 'NSE',
        tradingsymbol: 'INDIA VIX',
        symboltoken: '26017',
        ltp: 12.5,
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockLtpRes);

    const ltp = await client.getLtp('NSE', 'INDIA VIX', '26017');
    expect(ltp).toBe(12.5);
  });

  test('getLtp throws error on status false', async () => {
    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'LTP fetch failed',
      errorcode: '123',
    });

    await expect(client.getLtp('NSE', 'VIX', '26017')).rejects.toThrow('LTP check failed');
  });

  test('getLtp handles network throws', async () => {
    (httpClient.request as jest.Mock).mockRejectedValueOnce(new Error('Network exception'));
    await expect(client.getLtp('NSE', 'VIX', '26017')).rejects.toThrow('Network exception');
  });

  test('placeOrder returns orderId', async () => {
    const mockOrderRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        orderid: 'ORD12345',
        uniqueorderid: 'UORD123',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockOrderRes);

    const orderId = await client.placeOrder({
      variety: 'NORMAL',
      tradingsymbol: 'NIFTY',
      symboltoken: '123',
      transactiontype: 'BUY',
      exchange: 'NFO',
      ordertype: 'MARKET',
      producttype: 'CARRYOVER',
      duration: 'DAY',
      quantity: 50,
    });

    expect(orderId).toBe('ORD12345');
  });

  test('placeOrder throws on status false', async () => {
    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'No Funds',
      errorcode: '111',
    });

    await expect(
      client.placeOrder({
        variety: 'NORMAL',
        tradingsymbol: 'NIFTY',
        symboltoken: '123',
        transactiontype: 'BUY',
        exchange: 'NFO',
        ordertype: 'MARKET',
        producttype: 'CARRYOVER',
        duration: 'DAY',
        quantity: 50,
      }),
    ).rejects.toThrow('Order placement failed');
  });

  test('getOrderBook returns list of orders', async () => {
    const mockOrderBookRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: [
        {
          orderid: 'ORD123',
          status: 'COMPLETE',
          tradingsymbol: 'NIFTY',
          symboltoken: '123',
          transactiontype: 'BUY',
          quantity: 50,
          price: 100,
        },
      ],
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockOrderBookRes);

    const orders = await client.getOrderBook();
    expect(orders).toHaveLength(1);
    expect(orders[0].orderid).toBe('ORD123');
  });

  test('getOrderBook throws on status false', async () => {
    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'API disabled',
      errorcode: '222',
    });

    await expect(client.getOrderBook()).rejects.toThrow('Failed to fetch OrderBook');
  });

  test('getMarginUtilized calls batch endpoint and returns margin', async () => {
    const mockMarginRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        totalMargin: 400000,
        marginUtilized: 380000,
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockMarginRes);

    const margin = await client.getMarginUtilized([
      { exchange: 'NFO', symboltoken: '123', quantity: 50, action: 'BUY' },
    ]);
    expect(margin).toBe(380000);
  });

  test('getMarginUtilized falls back to totalMarginRequired if marginUtilized is absent', async () => {
    const mockMarginRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        totalMargin: 0,
        totalMarginRequired: 400000,
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockMarginRes);

    const margin = await client.getMarginUtilized([
      { exchange: 'NFO', symboltoken: '123', quantity: 50, action: 'BUY' },
    ]);
    expect(margin).toBe(400000);
  });

  test('getMarginUtilized throws on status false and uses fallback', async () => {
    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'Calculations failed',
      errorcode: '333',
    });

    const margin = await client.getMarginUtilized([]);
    expect(margin).toBe(130000);
  });

  test('getMarketData returns ltp, bid, and ask', async () => {
    const mockQuoteRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        fetched: [
          {
            exchange: 'NFO',
            tradingSymbol: 'NIFTY16JUL26C19100',
            symbolToken: 'token123',
            ltp: 100,
            depth: {
              buy: [{ price: 99.5, quantity: 100 }],
              sell: [{ price: 100.5, quantity: 100 }],
            },
          },
        ],
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockQuoteRes);

    const res = await client.getMarketData('NFO', 'token123');
    expect(res).toEqual({ ltp: 100, bid: 99.5, ask: 100.5 });
  });

  test('getMarketData falls back to ltp if depth is empty', async () => {
    const mockQuoteRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        fetched: [
          {
            exchange: 'NFO',
            tradingSymbol: 'NIFTY16JUL26C19100',
            symbolToken: 'token123',
            ltp: 100,
            depth: null,
          },
        ],
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockQuoteRes);

    const res = await client.getMarketData('NFO', 'token123');
    expect(res).toEqual({ ltp: 100, bid: 100, ask: 100 });
  });

  test('getMarketData throws on status false', async () => {
    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'Quote check failed',
      errorcode: '999',
    });

    await expect(client.getMarketData('NFO', 'token123')).rejects.toThrow(
      'Market quote check failed',
    );
  });

  test('getMarketDataBatch returns map of quotes', async () => {
    const mockQuoteRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        fetched: [
          {
            exchange: 'NFO',
            tradingSymbol: 'NIFTY16JUL26C19100',
            symbolToken: 'token123',
            ltp: 100,
            depth: {
              buy: [{ price: 99.5, quantity: 100 }],
              sell: [{ price: 100.5, quantity: 100 }],
            },
          },
        ],
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockQuoteRes);

    const res = await client.getMarketDataBatch('NFO', ['token123']);
    expect(res.size).toBe(1);
    const quote = res.get('token123');
    expect(quote).toEqual({ ltp: 100, bid: 99.5, ask: 100.5, bidQty: 100, askQty: 100 });
  });

  test('getMarketDataBatch handles empty tokens list', async () => {
    const res = await client.getMarketDataBatch('NFO', []);
    expect(res.size).toBe(0);
  });

  test('getMarketDataBatch handles chunking for > 50 tokens', async () => {
    const tokens = Array.from({ length: 60 }, (_, i) => `token${i}`);
    const mockQuoteRes1 = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        fetched: Array.from({ length: 50 }, (_, i) => ({
          exchange: 'NFO',
          tradingSymbol: `NIFTY-${i}`,
          symbolToken: `token${i}`,
          ltp: 100,
          depth: {
            buy: [{ price: 99.5, quantity: 100 }],
            sell: [{ price: 100.5, quantity: 100 }],
          },
        })),
      },
    };
    const mockQuoteRes2 = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        fetched: Array.from({ length: 10 }, (_, i) => ({
          exchange: 'NFO',
          tradingSymbol: `NIFTY-${i + 50}`,
          symbolToken: `token${i + 50}`,
          ltp: 100,
          depth: {
            buy: [{ price: 99.5, quantity: 100 }],
            sell: [{ price: 100.5, quantity: 100 }],
          },
        })),
      },
    };

    (httpClient.request as jest.Mock)
      .mockResolvedValueOnce(mockQuoteRes1)
      .mockResolvedValueOnce(mockQuoteRes2);

    const res = await client.getMarketDataBatch('NFO', tokens);
    expect(res.size).toBe(60);
    expect(res.get('token0')).toBeDefined();
    expect(res.get('token59')).toBeDefined();
  });

  test('getMarketDataBatch throws on status false', async () => {
    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'Quote check failed',
      errorcode: '999',
    });

    await expect(client.getMarketDataBatch('NFO', ['token123'])).rejects.toThrow(
      'Market quote batch check failed',
    );
  });

  test('getMarketDataBatch falls back to ltp when depth is empty', async () => {
    const mockQuoteRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        fetched: [
          {
            exchange: 'NFO',
            tradingSymbol: 'NIFTY16JUL26C19100',
            symbolToken: 'token123',
            ltp: 100,
            depth: null,
          },
        ],
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockQuoteRes);

    const res = await client.getMarketDataBatch('NFO', ['token123']);
    expect(res.size).toBe(1);
    const quote = res.get('token123');
    expect(quote).toEqual({ ltp: 100, bid: 100, ask: 100, bidQty: 0, askQty: 0 });
  });

  test('cancelOrder succeeds on status true', async () => {
    const mockCancelRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        orderid: 'ORD12345',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockCancelRes);

    await expect(client.cancelOrder('ORD12345', 'NORMAL')).resolves.not.toThrow();
  });

  test('cancelOrder throws on status false', async () => {
    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'Order already completed',
      errorcode: '123',
    });

    await expect(client.cancelOrder('ORD12345', 'NORMAL')).rejects.toThrow(
      'Order cancellation failed',
    );
  });

  test('getOptionGreeks returns list of option greeks', async () => {
    const mockGreeksRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: [
        {
          name: 'NIFTY',
          expiry: '21JUL2026',
          strikePrice: '24600.000000',
          optionType: 'CE',
          delta: '0.150000',
          gamma: '0.002800',
          theta: '-4.091800',
          vega: '2.296700',
          impliedVolatility: '16.330000',
          tradeVolume: '24048.00',
        },
      ],
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockGreeksRes);

    const res = await client.getOptionGreeks('NIFTY', '21JUL2026');
    expect(res).toHaveLength(1);
    expect(res[0].impliedVolatility).toBe(16.33);
  });

  test('getOptionGreeks returns empty list when data is absent', async () => {
    const mockGreeksRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: null,
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockGreeksRes);

    const res = await client.getOptionGreeks('NIFTY', '21JUL2026');
    expect(res).toEqual([]);
  });

  test('getOptionGreeks throws on status false', async () => {
    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'No Data Available',
      errorcode: 'AB9019',
    });

    await expect(client.getOptionGreeks('NIFTY', '21JUL2026')).rejects.toThrow(
      'Option Greeks check failed',
    );
  });
});
