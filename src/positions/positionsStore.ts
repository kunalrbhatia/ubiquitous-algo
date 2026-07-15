import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { MonthlyPosition, MonthlyPositionSchema } from '../schemas/smartApi';
import logger from '../logging/logger';

export interface IPositionsStore {
  readPosition(underlying: string, month: string, isPaper: boolean): MonthlyPosition | null;
  writePosition(
    underlying: string,
    month: string,
    isPaper: boolean,
    position: MonthlyPosition,
  ): void;
  getCurrentMonthString(): string;
  getMonthlySkipState(underlying: string, month: string, isPaper: boolean): boolean;
  setMonthlySkipState(underlying: string, month: string, isPaper: boolean, skip: boolean): void;
  cleanupOldFiles(retentionMonths: number): void;
}

export class PositionsStore implements IPositionsStore {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), 'data');
  }

  private getFilePath(underlying: string, month: string, isPaper: boolean): string {
    const subfolder = isPaper ? 'paper' : 'live';
    const dir = path.join(this.baseDir, subfolder);
    /* istanbul ignore next */
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `positions-${underlying.toLowerCase()}-${month}.json`);
  }

  getCurrentMonthString(): string {
    const now = dayjs();
    return now.format('YYYY-MM');
  }

  readPosition(underlying: string, month: string, isPaper: boolean): MonthlyPosition | null {
    const filePath = this.getFilePath(underlying, month, isPaper);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return MonthlyPositionSchema.parse(data);
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error reading positions from ${filePath}: ${msg}`);
      return null;
    }
  }

  writePosition(
    underlying: string,
    month: string,
    isPaper: boolean,
    position: MonthlyPosition,
  ): void {
    const filePath = this.getFilePath(underlying, month, isPaper);
    try {
      // Validate schema before writing to guarantee integrity
      MonthlyPositionSchema.parse(position);
      fs.writeFileSync(filePath, JSON.stringify(position, null, 2), 'utf-8');
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      /* istanbul ignore next */
      logger.error(`Error writing positions to ${filePath}: ${msg}`);
      throw error;
    }
  }

  getMonthlySkipState(underlying: string, month: string, isPaper: boolean): boolean {
    const pos = this.readPosition(underlying, month, isPaper);
    return pos ? pos.skippedThisMonth : false;
  }

  setMonthlySkipState(underlying: string, month: string, isPaper: boolean, skip: boolean): void {
    let pos = this.readPosition(underlying, month, isPaper);
    if (!pos) {
      pos = {
        month,
        status: 'skipped',
        marginUtilized: 0,
        orders: [],
        realizedPnl: 0,
        skippedThisMonth: skip,
      };
    } else {
      pos.skippedThisMonth = skip;
      if (skip && pos.status === 'open') {
        pos.status = 'skipped';
      }
    }
    this.writePosition(underlying, month, isPaper, pos);
  }

  cleanupOldFiles(retentionMonths: number): void {
    logger.info(`Starting clean up of position files older than ${retentionMonths} months...`);
    const cutOffDate = dayjs().subtract(retentionMonths, 'month');

    const cleanFolder = (subDir: string) => {
      const dirPath = path.join(this.baseDir, subDir);
      /* istanbul ignore next */
      if (!fs.existsSync(dirPath)) return;

      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        /* istanbul ignore next */
        if (!file.startsWith('positions-') || !file.endsWith('.json')) continue;

        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        // Skip current month file regardless of file date
        const currentMonth = this.getCurrentMonthString();
        /* istanbul ignore next */
        if (file.includes(currentMonth)) continue;

        if (dayjs(stats.mtime).isBefore(cutOffDate)) {
          fs.unlinkSync(filePath);
          logger.info(`Deleted old position file: ${filePath}`);
        }
      }
    };

    cleanFolder('paper');
    cleanFolder('live');
  }
}

export const positionsStore = new PositionsStore();
export default positionsStore;
