import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import logger from '../logging/logger';
import sessionManager from '../auth/session';
import instrumentManager from '../instruments/instrumentManager';
import strategyManager from '../strategy/strategyManager';
import executionManager from '../execution/executionManager';
import positionsStore from '../positions/positionsStore';
import flagWatcher from '../flags/flagWatcher';
import fs from 'fs';
import path from 'path';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

dayjs.tz.setDefault('Asia/Kolkata');

const MONTH_MAP: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

export function parseExpiryDate(exp: string): dayjs.Dayjs {
  const match = exp.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (!match) {
    return dayjs.tz('invalid-date', 'Asia/Kolkata');
  }
  const day = parseInt(match[1], 10);
  const monthStr = match[2];
  const year = parseInt(match[3], 10);
  const month = MONTH_MAP[monthStr];
  if (month === undefined) {
    return dayjs.tz('invalid-date', 'Asia/Kolkata');
  }
  return dayjs.tz(
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    'Asia/Kolkata',
  );
}

export function getLastTuesdayOfMonth(
  year: number,
  month: number,
  activeExpiries?: string[],
): dayjs.Dayjs {
  let date = dayjs
    .tz(`${year}-${String(month).padStart(2, '0')}-01`, 'Asia/Kolkata')
    .endOf('month');
  while (date.day() !== 2) {
    // 2 = Tuesday
    date = date.subtract(1, 'day');
  }

  if (activeExpiries && activeExpiries.length > 0) {
    const formattedDate = date.format('DDMMMYYYY').toUpperCase();
    if (!activeExpiries.includes(formattedDate)) {
      const possibleExpiries = activeExpiries
        .map((exp) => parseExpiryDate(exp))
        .filter(
          (d) => d.isValid() && d.year() === year && d.month() === month - 1 && d.isBefore(date),
        )
        .sort((a, b) => b.diff(a));

      if (possibleExpiries.length > 0) {
        return possibleExpiries[0];
      }
    }
  }

  return date;
}

export function getFirstTradingDayAfter(date: dayjs.Dayjs): dayjs.Dayjs {
  let next = date.add(1, 'day');
  while (next.day() === 0 || next.day() === 6) {
    // 0 = Sunday, 6 = Saturday
    next = next.add(1, 'day');
  }
  return next;
}

export class CronScheduler {
  async handleTradingTick() {
    const isPaper = flagWatcher.isPaperMode();
    const isKill = flagWatcher.isKillSwitched();
    const isLockout = flagWatcher.isDoneForThisMonth();

    const now = dayjs().tz('Asia/Kolkata');
    const minutesSinceMidnight = now.hour() * 60 + now.minute();

    if (minutesSinceMidnight < 555 || minutesSinceMidnight > 930) {
      return;
    }

    if (isKill || isLockout) {
      logger.info('Trading paused (kill switch or monthly lockout active).');
      return;
    }

    await this.processTradingCycle(now, minutesSinceMidnight, isPaper);
  }

  async processTradingCycle(now: dayjs.Dayjs, minutesSinceMidnight: number, isPaper: boolean) {
    const underlying = 'BANKNIFTY';
    const currentMonth = positionsStore.getCurrentMonthString();
    const currentPosition = positionsStore.readPosition(underlying, currentMonth, isPaper);

    const activeExpiries = instrumentManager.getExpiries(underlying);

    const currentExpiry = getLastTuesdayOfMonth(now.year(), now.month() + 1, activeExpiries);
    const prevMonthDate = now.subtract(1, 'month');
    const prevExpiry = getLastTuesdayOfMonth(
      prevMonthDate.year(),
      prevMonthDate.month() + 1,
      activeExpiries,
    );
    const entryDay = getFirstTradingDayAfter(prevExpiry);

    // 1. Auto-clear lockout flag if today is entryDay
    const lockoutPath = path.resolve(process.cwd(), 'done-for-this-month');
    if (now.isSame(entryDay, 'day') && fs.existsSync(lockoutPath)) {
      try {
        fs.unlinkSync(lockoutPath);
        logger.info('Auto-cleared done-for-this-month flag on entry day.');
      } catch (err: any) {
        /* istanbul ignore next */
        logger.error(`Failed to clear done-for-this-month flag: ${err.message}`);
      }
    }

    if (flagWatcher.isDoneForThisMonth()) {
      return;
    }

    // 2. Entry Logic
    const isEntryDay = now.isSame(entryDay, 'day');
    if (isEntryDay) {
      if (minutesSinceMidnight >= 570) {
        if (!currentPosition) {
          await this.attemptEntry(underlying, currentMonth);
          return;
        } else if (currentPosition.status === 'skipped') {
          return;
        }
      }
    }

    // 3. Exit Logic
    const isExpiryDay = now.isSame(currentExpiry, 'day');
    if (isExpiryDay && minutesSinceMidnight >= 915 && minutesSinceMidnight <= 930) {
      if (currentPosition && currentPosition.status === 'open') {
        logger.info(`T0 expiry day reached. Exiting position at 15:15 IST...`);
        await executionManager.executeExit(underlying, currentMonth, isPaper);
        return;
      }
    }

    // 4. Monitoring Logic
    const isAfterOrOnEntry = now.isAfter(entryDay, 'day') || now.isSame(entryDay, 'day');
    const isBeforeOrOnExpiry =
      now.isBefore(currentExpiry, 'day') || now.isSame(currentExpiry, 'day');

    if (isAfterOrOnEntry && isBeforeOrOnExpiry) {
      if (currentPosition && currentPosition.status === 'open') {
        if (isExpiryDay && minutesSinceMidnight >= 915) {
          return;
        }
        await executionManager.monitorPnl(underlying, currentMonth, isPaper);
      }
    }
  }

  private async attemptEntry(underlying: string, month: string) {
    const isPaper = flagWatcher.isPaperMode();

    await sessionManager.login();
    await instrumentManager.loadInstruments();

    const { passed, vix } = await strategyManager.checkVix();
    if (!passed) {
      logger.warn(`VIX check failed (VIX: ${vix}). Skipping entry for ${underlying} this month.`);
      positionsStore.setMonthlySkipState(underlying, month, isPaper, true);
      return;
    }

    const basket = await strategyManager.buildBasket(underlying, false);
    if (!basket) {
      logger.error(`Failed to construct ${underlying} basket. Skipping entry.`);
      return;
    }

    await executionManager.executeEntry(underlying, basket);
  }

  runDailyCleanup() {
    logger.info('Starting daily log and position data retention cleanup...');
    const retentionMonths = 3; // retention of monthly positions files
    const logDir = path.resolve(process.cwd(), 'logs');

    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir);
      const todayStr = dayjs.tz().format('YYYY-MM-DD');

      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        const filePath = path.join(logDir, file);
        const fileBase = path.basename(file, '.log');

        if (fileBase === todayStr) continue;

        const fileDate = dayjs(fileBase, 'YYYY-MM-DD').tz('Asia/Kolkata');
        if (fileDate.isValid() && fileDate.isBefore(dayjs.tz().subtract(1, 'month'))) {
          // logs retained for 1 month
          fs.unlinkSync(filePath);
          logger.info(`Deleted old daily log file: ${filePath}`);
        }
      }
    }

    positionsStore.cleanupOldFiles(retentionMonths);
    logger.info('Daily cleanup complete.');
  }
}

export const cronScheduler = new CronScheduler();
export default cronScheduler;
