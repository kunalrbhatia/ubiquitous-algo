import WebSocket from 'ws';
import smartStream from '../src/execution/smartStream';
import flagWatcher from '../src/flags/flagWatcher';
import sessionManager from '../src/auth/session';
import positionsStore from '../src/positions/positionsStore';

jest.mock('ws');
jest.mock('../src/flags/flagWatcher');
jest.mock('../src/auth/session');
jest.mock('../src/positions/positionsStore');
jest.mock('../src/logging/logger');

describe('SmartStreamClient', () => {
  let mockWsInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockWsInstance = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      ping: jest.fn(),
      removeAllListeners: jest.fn(),
    };

    (WebSocket as unknown as jest.Mock).mockImplementation(() => mockWsInstance);
    (sessionManager.refreshSession as jest.Mock).mockResolvedValue(undefined);
    (sessionManager.login as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    smartStream.disconnect();
    jest.useRealTimers();
  });

  test('connect in Paper Mode starts mock generator', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue({
      status: 'open',
      orders: [{ symboltoken: 'token123', price: 150 }],
    });

    const callback = jest.fn();
    await smartStream.connect(callback);

    smartStream.subscribe(['token123']);

    // Fast-forward mock interval
    jest.advanceTimersByTime(1500);

    expect(callback).toHaveBeenCalled();
    const mockTick = callback.mock.calls[0][0];
    expect(mockTick.token).toBe('token123');
    expect(mockTick.ltp).toBeGreaterThan(0);
    expect(smartStream.getCachedLtp('token123')).toBe(mockTick.ltp);
    expect(smartStream.getCachedLtp('nonexistent')).toBeNull();
  });

  test('connect in Paper Mode starts mock generator and handles empty positions', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue(null);

    const callback = jest.fn();
    await smartStream.connect(callback);

    smartStream.subscribe(['token123']);

    // Fast-forward mock interval
    jest.advanceTimersByTime(1500);

    expect(callback).toHaveBeenCalled();
  });

  test('connect in Live Mode starts real WebSocket and subscribes', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);
    (sessionManager.getJwtToken as jest.Mock).mockReturnValue('mockJwt');
    (sessionManager.getFeedToken as jest.Mock).mockReturnValue('mockFeed');

    // Add some pre-existing subscribed tokens to cover line 67 (re-subscribing on open)
    smartStream.subscribe(['pre-existing-token']);

    const callback = jest.fn();
    await smartStream.connect(callback);

    expect(WebSocket).toHaveBeenCalledWith(
      'wss://smartapisocket.angelone.in/smart-stream',
      expect.any(Object),
    );

    // Simulate WS Open
    const openCallback = mockWsInstance.on.mock.calls.find((c: any) => c[0] === 'open')[1];
    openCallback();

    expect(mockWsInstance.send).toHaveBeenCalled();

    smartStream.subscribe(['token123']);
    expect(mockWsInstance.send).toHaveBeenLastCalledWith(expect.stringContaining('token123'));

    // Simulate binary message parsing
    const messageCallback = mockWsInstance.on.mock.calls.find((c: any) => c[0] === 'message')[1];

    // Construct buffer matching:
    // Byte 0: subscription type (1)
    // Byte 1: exchange type (2)
    // Bytes 2-26: Token (token123)
    // Bytes 43-50: LTP (150.50 * 100 = 15050)
    const buf = Buffer.alloc(60);
    buf.writeUInt8(1, 0);
    buf.writeUInt8(2, 1);
    buf.write('token123', 2, 25, 'utf8');
    buf.writeBigInt64LE(15050n, 43);

    messageCallback(buf);

    expect(callback).toHaveBeenCalledWith({
      token: 'token123',
      ltp: 150.5,
    });
    expect(smartStream.getCachedLtp('token123')).toBe(150.5);

    // Cover invalid binary frame (type != 1, 2, or 3)
    const buf2 = Buffer.alloc(60);
    buf2.writeUInt8(9, 0);
    messageCallback(buf2);

    // Cover non-buffer tick data
    messageCallback('not-a-buffer');
  });

  test('handles connect errors and socket disconnect/close', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);
    (sessionManager.getJwtToken as jest.Mock).mockReturnValue('mockJwt');
    (sessionManager.getFeedToken as jest.Mock).mockReturnValue('mockFeed');

    const callback = jest.fn();
    await smartStream.connect(callback);

    const closeCallback = mockWsInstance.on.mock.calls.find((c: any) => c[0] === 'close')[1];
    const errorCallback = mockWsInstance.on.mock.calls.find((c: any) => c[0] === 'error')[1];

    // Trigger error callback
    errorCallback(new Error('WS Fail'));
    errorCallback('string error');

    // Trigger close callback which triggers reconnect timer
    closeCallback();

    // Advance timers by 5s for reconnect check
    await jest.advanceTimersByTimeAsync(5000);
    expect(WebSocket).toHaveBeenCalledTimes(2);
  });

  test('covers parse error catch block in message callback', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);
    (sessionManager.getJwtToken as jest.Mock).mockReturnValue('mockJwt');
    (sessionManager.getFeedToken as jest.Mock).mockReturnValue('mockFeed');

    const callback = jest.fn();
    await smartStream.connect(callback);

    // Simulate WS Open
    const openCallback = mockWsInstance.on.mock.calls.find((c: any) => c[0] === 'open')[1];
    openCallback();

    const messageCallback = mockWsInstance.on.mock.calls.find((c: any) => c[0] === 'message')[1];

    // Pass a buffer that triggers an error in parsing (covers Error instance branch in catch block)
    const badBuf = Buffer.alloc(60);
    badBuf.writeUInt8(1, 0);
    badBuf.slice = () => {
      throw new Error('slice error');
    };
    messageCallback(badBuf);

    // Pass a fake buffer that throws a non-Error string when readUInt8 is called (covers String(err) / fallback branch in catch block)
    const stringThrowBuf = Buffer.alloc(10);
    stringThrowBuf.readUInt8 = () => {
      throw 'string parse error';
    };
    messageCallback(stringThrowBuf);

    // Cover token/ltp filters (token is empty string)
    const emptyTokenBuf = Buffer.alloc(60);
    emptyTokenBuf.writeUInt8(1, 0);
    // Write spaces/nulls
    emptyTokenBuf.write('', 2, 25, 'utf8');
    emptyTokenBuf.writeBigInt64LE(15050n, 43);
    messageCallback(emptyTokenBuf);

    // Cover token/ltp filters (ltp <= 0)
    const badLtpBuf = Buffer.alloc(60);
    badLtpBuf.writeUInt8(1, 0);
    badLtpBuf.write('token123', 2, 25, 'utf8');
    badLtpBuf.writeBigInt64LE(0n, 43);
    messageCallback(badLtpBuf);

    // Cover type === 3 branch
    const type3Buf = Buffer.alloc(60);
    type3Buf.writeUInt8(3, 0);
    type3Buf.write('token123', 2, 25, 'utf8');
    type3Buf.writeBigInt64LE(15050n, 43);
    messageCallback(type3Buf);
    expect(callback).toHaveBeenLastCalledWith({ token: 'token123', ltp: 150.5 });
  });

  test('covers catch block in connect method', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);
    // Make jwtToken getter throw an Error instance
    (sessionManager.getJwtToken as jest.Mock).mockImplementation(() => {
      throw new Error('Test throw in connect');
    });

    await smartStream.connect(jest.fn());

    // Make jwtToken getter throw a non-Error string to cover line 112 branch
    (sessionManager.getJwtToken as jest.Mock).mockImplementation(() => {
      throw 'string connect error';
    });

    await smartStream.connect(jest.fn());
  });

  test('covers callback is null check in startMockGenerator', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);

    await smartStream.connect(jest.fn());

    // Set callback to null to cover line 153 branch: if (!this.callback) return;
    (smartStream as any).callback = null;

    jest.advanceTimersByTime(1500);
  });

  test('connect checks missing tokens gracefully', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);

    // Case 1: Both empty
    (sessionManager.getJwtToken as jest.Mock).mockReturnValue('');
    (sessionManager.getFeedToken as jest.Mock).mockReturnValue('');
    await smartStream.connect(jest.fn());
    expect(WebSocket).not.toHaveBeenCalled();

    // Case 2: jwtToken present, feedToken empty
    (sessionManager.getJwtToken as jest.Mock).mockReturnValue('mockJwt');
    (sessionManager.getFeedToken as jest.Mock).mockReturnValue('');
    await smartStream.connect(jest.fn());
    expect(WebSocket).not.toHaveBeenCalled();

    // Case 3: jwtToken empty, feedToken present
    (sessionManager.getJwtToken as jest.Mock).mockReturnValue('');
    (sessionManager.getFeedToken as jest.Mock).mockReturnValue('mockFeed');
    await smartStream.connect(jest.fn());
    expect(WebSocket).not.toHaveBeenCalled();
  });

  test('disconnect when not connected does not throw', () => {
    // Fresh smartStream or disconnected
    expect(smartStream.getIsConnected()).toBe(false);
    smartStream.disconnect(); // should not throw since ws is null
  });

  test('subscribe when disconnected does not attempt ws.send', () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);
    smartStream.disconnect();
    smartStream.subscribe(['token123']); // should check ws/isConnected and do nothing
  });

  test('heartbeat interval re-subscribes on open and clears on close', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);
    (sessionManager.getJwtToken as jest.Mock).mockReturnValue('mockJwt');
    (sessionManager.getFeedToken as jest.Mock).mockReturnValue('mockFeed');

    const callback = jest.fn();
    await smartStream.connect(callback);

    // Set a dummy interval to cover the branch where heartbeatInterval already exists on open
    (smartStream as any).heartbeatInterval = setInterval(() => {}, 1000);

    // Simulate WS Open to start interval
    const openCallback = mockWsInstance.on.mock.calls.find((c: any) => c[0] === 'open')[1];
    openCallback();

    expect(smartStream.getIsConnected()).toBe(true);

    // Subscribe a token so the heartbeat has something to re-subscribe
    smartStream.subscribe(['SOME_TOKEN']);

    // Advance timer to trigger heartbeat (re-subscribe)
    jest.advanceTimersByTime(45000);
    expect(mockWsInstance.send).toHaveBeenCalled();

    // Close the socket to clear interval
    const closeCallback = mockWsInstance.on.mock.calls.find((c: any) => c[0] === 'close')[1];
    closeCallback();

    mockWsInstance.send.mockClear();
    jest.advanceTimersByTime(45000);
    expect(mockWsInstance.send).not.toHaveBeenCalled();
  });

  test('covers auth failure retry pathway', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);
    (sessionManager.refreshSession as jest.Mock).mockRejectedValue(new Error('auth failed'));
    (sessionManager.login as jest.Mock).mockRejectedValue(new Error('login failed'));

    // Set a dummy interval to cover the branch where heartbeatInterval exists during auth failure
    (smartStream as any).heartbeatInterval = setInterval(() => {}, 1000);

    await smartStream.connect(jest.fn());
    expect(WebSocket).not.toHaveBeenCalled();

    // Advance timer to trigger retry connection
    await jest.advanceTimersByTimeAsync(5000);
  });

  test('covers auth failure retry pathway with string error rejections', async () => {
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(false);
    (sessionManager.refreshSession as jest.Mock).mockRejectedValue('auth failed string');
    (sessionManager.login as jest.Mock).mockRejectedValue('login failed string');

    (smartStream as any).heartbeatInterval = setInterval(() => {}, 1000);

    await smartStream.connect(jest.fn());
    expect(WebSocket).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(5000);
  });
});
