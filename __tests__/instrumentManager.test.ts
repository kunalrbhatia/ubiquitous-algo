import fs from 'fs';
import { InstrumentManager } from '../src/instruments/instrumentManager';
import httpClient from '../src/http/httpClient';

jest.mock('fs');
jest.mock('../src/http/httpClient');

describe('InstrumentManager', () => {
  let manager: InstrumentManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new InstrumentManager();
  });

  test('loadInstruments from disk cache if exists and today', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValue({ mtime: new Date() });
    const mockCache = {
      BANKNIFTY_09JUL2026_19000_CE: {
        symboltoken: '123',
        tradingsymbol: 'BANKNIFTY09JUL26C19000',
        lotsize: 50,
        exchange: 'NFO',
      },
    };
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockCache));

    await manager.loadInstruments(false);

    expect(fs.readFileSync).toHaveBeenCalled();
    expect(manager.getInstrument('BANKNIFTY', '09JUL2026', 19000, 'CE')).not.toBeNull();
  });

  test('loadInstruments handles malformed cache by re-downloading', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValue({ mtime: new Date() });
    (fs.readFileSync as jest.Mock).mockReturnValue('invalid-json');
    (httpClient.request as jest.Mock).mockResolvedValueOnce([]);

    await manager.loadInstruments(false);

    expect(httpClient.request).toHaveBeenCalled();
  });

  test('loadInstruments downloads from API and filters properly', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const mockScripMaster = [
      {
        token: '123',
        symbol: 'BANKNIFTY09JUL26C19000CE',
        name: 'BANKNIFTY',
        expiry: '09JUL2026',
        strike: '19000.000000',
        lotsize: '50',
        instrumenttype: 'OPTIDX',
        exch_seg: 'NFO',
      },
      {
        token: '26017',
        symbol: 'INDIA VIX',
        name: 'INDIA VIX',
        lotsize: '1',
        exch_seg: 'NSE',
      },
      // Invalid/ignored rows for coverage
      {
        token: '456',
        symbol: 'INVALID',
        name: 'RELIANCE', // not target underlying
        lotsize: '1',
        exch_seg: 'NSE',
      },
      {
        token: '789',
        symbol: 'BANKNIFTY09JUL26C19000CE',
        name: 'BANKNIFTY',
        expiry: '', // empty expiry
        strike: '19000.000000',
        lotsize: 50,
        instrumenttype: 'OPTIDX',
        exch_seg: 'NFO',
      },
      {
        token: '111',
        symbol: 'BANKNIFTY09JUL26XXXXX', // no CE or PE
        name: 'BANKNIFTY',
        expiry: '09JUL2026',
        strike: '19000.000000',
        lotsize: 50,
        instrumenttype: 'OPTIDX',
        exch_seg: 'NFO',
      },
    ];

    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockScripMaster);

    await manager.loadInstruments(true);

    expect(httpClient.request).toHaveBeenCalled();
    expect(manager.getInstrument('BANKNIFTY', '09JUL2026', 19000, 'CE')).toBeDefined();
    expect(manager.getVixToken()).toBe('26017'); // VIX key is resolved or fallback
  });

  test('downloadAndParseScripMaster handles network/API failure', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (httpClient.request as jest.Mock).mockRejectedValueOnce(new Error('Network offline'));

    await expect(manager.loadInstruments(true)).rejects.toThrow('Network offline');
  });

  test('getInstrument returns null on missing instrument', () => {
    expect(manager.getInstrument('BANKNIFTY', '09JUL2026', 19000, 'CE')).toBeNull();
  });

  test('getVixToken returns fallback if INDIA VIX not in cache', () => {
    expect(manager.getVixToken()).toBe('99926017');
  });
});
