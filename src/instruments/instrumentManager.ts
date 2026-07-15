import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import httpClient from '../http/httpClient';
import logger from '../logging/logger';
import {
  InstrumentCache,
  InstrumentCacheSchema,
  RawScripMasterRowSchema,
  InstrumentCacheEntry,
} from '../schemas/smartApi';

export interface IInstrumentManager {
  loadInstruments(forceDownload?: boolean): Promise<void>;
  getInstrument(
    underlying: string,
    expiry: string,
    strike: number,
    optionType: 'CE' | 'PE',
  ): InstrumentCacheEntry | null;
  getExpiries(underlying: string): string[];
}

export class InstrumentManager implements IInstrumentManager {
  private cache: InstrumentCache = {};
  private cacheFilePath: string;
  private rawScripMasterFilePath: string;

  constructor() {
    this.cacheFilePath = path.resolve(process.cwd(), 'data', 'instruments-cache.json');
    this.rawScripMasterFilePath = path.resolve(process.cwd(), 'data', 'OpenAPIScripMaster.json');
    const dataDir = path.dirname(this.cacheFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  async loadInstruments(forceDownload = false): Promise<void> {
    // Check if on-disk cache exists and is from today
    if (!forceDownload && fs.existsSync(this.cacheFilePath)) {
      const stats = fs.statSync(this.cacheFilePath);
      const isToday = dayjs(stats.mtime).isSame(dayjs(), 'day');

      if (isToday) {
        try {
          logger.info('Loading instruments from local cache...');
          const content = fs.readFileSync(this.cacheFilePath, 'utf-8');
          const data = JSON.parse(content);
          this.cache = InstrumentCacheSchema.parse(data);
          logger.info(`Loaded ${Object.keys(this.cache).length} instruments from cache.`);
          return;
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to parse instrument cache: ${msg}. Re-downloading...`);
        }
      }
    }

    await this.downloadAndParseScripMaster(forceDownload);
  }

  private async downloadAndParseScripMaster(forceDownload = false): Promise<void> {
    let data: unknown[] | null = null;

    // Check if raw local copy exists and is from today
    if (!forceDownload && fs.existsSync(this.rawScripMasterFilePath)) {
      const stats = fs.statSync(this.rawScripMasterFilePath);
      const isToday = dayjs(stats.mtime).isSame(dayjs(), 'day');
      if (isToday) {
        try {
          logger.info('Loading raw scrip master from local file...');
          const content = fs.readFileSync(this.rawScripMasterFilePath, 'utf-8');
          data = JSON.parse(content) as unknown[];
          logger.info(
            `Loaded raw scrip master from file. Total records: ${data.length}. Parsing...`,
          );
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to parse local raw scrip master: ${msg}. Will download...`);
        }
      }
    }

    if (!data) {
      logger.info('Downloading OpenAPIScripMaster from Angel Broking...');
      const url =
        'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

      try {
        data = await httpClient.request<unknown[]>(url);
        logger.info(
          `Downloaded raw scrip master. Total records: ${data.length}. Saving to disk and parsing...`,
        );
        fs.writeFileSync(this.rawScripMasterFilePath, JSON.stringify(data), 'utf-8');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Error downloading scrip master: ${msg}`);
        throw error;
      }
    }

    try {
      if (!data) {
        throw new Error('No scrip master data available to parse');
      }
      const newCache: InstrumentCache = {};

      for (const row of data) {
        // Safe parsing with Zod to handle any malformed rows gracefully
        const parseResult = RawScripMasterRowSchema.safeParse(row);
        if (!parseResult.success) {
          continue; // skip malformed rows
        }

        const item = parseResult.data;

        // Filter: Target underlying (NIFTY/SENSEX), Segment (NFO/BFO), and InstrumentType (OPTIDX)
        const name = item.name.toUpperCase();
        const symbol = item.symbol.toUpperCase();

        if (symbol === 'INDIA VIX' || name === 'INDIA VIX') {
          const key = `INDIA_VIX`;
          newCache[key] = {
            symboltoken: item.token,
            tradingsymbol: item.symbol,
            lotsize: item.lotsize,
            exchange: item.exch_seg,
          };
          continue;
        }

        if (name !== 'BANKNIFTY') {
          continue;
        }

        const isNfoOption = item.exch_seg === 'NFO' && item.instrumenttype === 'OPTIDX';

        if (!isNfoOption) {
          continue;
        }

        if (!item.expiry || item.strike === undefined || item.strike === '') {
          continue;
        }

        // Standardize expiry to DDMMMYYYY or format it (e.g. 09JUL2026)
        // Usually Angel One expiry is formatted like "09JUL2026"
        const expiryStr = item.expiry.toUpperCase();
        const strikeVal = Number(item.strike) / 100;

        // Determine Option Type from symbol (ends with CE/PE)
        let optionType: 'CE' | 'PE' | null = null;
        if (item.symbol.endsWith('CE')) {
          optionType = 'CE';
        } else if (item.symbol.endsWith('PE')) {
          optionType = 'PE';
        }

        if (!optionType) {
          continue;
        }

        // Format key: {underlying}_{expiry}_{strike}_{optionType}
        const key = `${name}_${expiryStr}_${strikeVal}_${optionType}`;
        newCache[key] = {
          symboltoken: item.token,
          tradingsymbol: item.symbol,
          lotsize: item.lotsize,
          exchange: item.exch_seg,
        };
      }

      this.cache = newCache;
      // Save cache to disk
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf-8');
      logger.info(
        `Successfully parsed and cached ${Object.keys(this.cache).length} options to ${this.cacheFilePath}`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error downloading/parsing scrip master: ${msg}`);
      throw error;
    }
  }

  getInstrument(
    underlying: string,
    expiry: string,
    strike: number,
    optionType: 'CE' | 'PE',
  ): InstrumentCacheEntry | null {
    const key = `${underlying.toUpperCase()}_${expiry.toUpperCase()}_${strike}_${optionType}`;
    const entry = this.cache[key];
    if (!entry) {
      return null;
    }
    return entry;
  }

  /* istanbul ignore next */
  getExpiries(underlying: string): string[] {
    const prefix = `${underlying.toUpperCase()}_`;
    const expiries = new Set<string>();
    for (const key of Object.keys(this.cache)) {
      if (key.startsWith(prefix)) {
        const parts = key.split('_');
        if (parts.length >= 2) {
          expiries.add(parts[1]);
        }
      }
    }

    // Sort expiries chronologically
    return Array.from(expiries).sort((a, b) => {
      const dateA = dayjs(a, 'DDMMMYYYY');
      const dateB = dayjs(b, 'DDMMMYYYY');
      return dateA.diff(dateB);
    });
  }

  getVixToken(): string {
    const entry = this.cache['INDIA_VIX'];
    if (!entry) {
      // Return a standard fallback token for VIX if missing
      // NSE INDIA VIX token is "99926017"
      return '99926017';
    }
    return entry.symboltoken;
  }
}

export const instrumentManager = new InstrumentManager();
export default instrumentManager;
