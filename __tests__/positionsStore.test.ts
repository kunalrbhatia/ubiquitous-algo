import fs from 'fs';
import dayjs from 'dayjs';
import { PositionsStore } from '../src/positions/positionsStore';
import { MonthlyPosition } from '../src/schemas/smartApi';

jest.mock('fs');

describe('PositionsStore', () => {
  let store: PositionsStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new PositionsStore();
  });

  test('getCurrentMonthString format', () => {
    const month = store.getCurrentMonthString();
    expect(month).toMatch(/^\d{4}-\d{2}$/);
  });

  test('readPosition returns null when file does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    expect(store.readPosition('BANKNIFTY', '2026-07', true)).toBeNull();
    expect(store.readPosition('BANKNIFTY', '2026-07', false)).toBeNull();
  });

  test('readPosition returns parsed positions on valid file', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const validData = {
      month: '2026-07',
      status: 'open',
      marginUtilized: 150000,
      orders: [
        {
          symboltoken: '1234',
          tradingsymbol: 'BANKNIFTY09JUL26C19000',
          transactiontype: 'BUY',
          quantity: 50,
          exchange: 'NFO',
          orderid: 'ORD-123',
          status: 'COMPLETE',
          price: 150,
        },
      ],
      realizedPnl: 0,
      skippedThisMonth: false,
    };
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(validData));

    const result = store.readPosition('BANKNIFTY', '2026-07', true);
    expect(result).not.toBeNull();
    expect(result?.month).toBe('2026-07');
    expect(result?.orders[0].tradingsymbol).toBe('BANKNIFTY09JUL26C19000');
  });

  test('readPosition returns null on invalid or malformed data', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ malformed: 'data' }));

    expect(store.readPosition('BANKNIFTY', '2026-07', true)).toBeNull();
  });

  test('writePosition validates and writes data', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    const position = {
      month: '2026-07',
      status: 'open' as const,
      marginUtilized: 150000,
      orders: [],
      realizedPnl: 0,
      skippedThisMonth: false,
    };

    expect(() => store.writePosition('BANKNIFTY', '2026-07', true, position)).not.toThrow();
    expect(() => store.writePosition('BANKNIFTY', '2026-07', false, position)).not.toThrow();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('writePosition throws and logs when write or validation fails', () => {
    const invalidPosition = {
      month: '2026-07',
    };

    expect(() =>
      store.writePosition(
        'BANKNIFTY',
        '2026-07',
        true,
        invalidPosition as unknown as MonthlyPosition,
      ),
    ).toThrow();
  });

  test('getMonthlySkipState and setMonthlySkipState', () => {
    // getMonthlySkipState when no position
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    expect(store.getMonthlySkipState('BANKNIFTY', '2026-07', true)).toBe(false);

    // getMonthlySkipState when position exists and skippedThisMonth is false
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        month: '2026-07',
        status: 'open',
        marginUtilized: 100,
        orders: [],
        realizedPnl: 0,
        skippedThisMonth: false,
      }),
    );
    expect(store.getMonthlySkipState('BANKNIFTY', '2026-07', true)).toBe(false);

    // setMonthlySkipState when no position (mock existsSync to return false so pos is null)
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    store.setMonthlySkipState('BANKNIFTY', '2026-07', true, true);
    expect(fs.writeFileSync).toHaveBeenCalled();

    // setMonthlySkipState with active open position
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        month: '2026-07',
        status: 'open',
        marginUtilized: 100,
        orders: [],
        realizedPnl: 0,
        skippedThisMonth: false,
      }),
    );
    store.setMonthlySkipState('BANKNIFTY', '2026-07', true, true);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('cleanupOldFiles deletes only files older than retention limit', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readdirSync as jest.Mock).mockReturnValue([
      'positions-banknifty-2026-05.json',
      'positions-banknifty-2026-07.json',
    ]);

    const oldMtime = dayjs().subtract(4, 'month').toDate();
    const newMtime = new Date();

    (fs.statSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath.includes('2026-05')) {
        return { mtime: oldMtime };
      }
      return { mtime: newMtime };
    });

    store.cleanupOldFiles(3);

    expect(fs.unlinkSync).toHaveBeenCalled();
  });
});
