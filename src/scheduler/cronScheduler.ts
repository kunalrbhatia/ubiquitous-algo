import cron from 'node-cron';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
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

dayjs.tz.setDefault('Asia/Kolkata');

export function getLastTuesdayOfMonth(
  year: number,
  month: number,
  activeExpiries?: string[],
): dayjs.Dayjs {
  let date = dayjs()
    .year(year)
    .month(month - 1)
    .endOf('month');
  while (date.day() !== 2) {
    // 2 = Tuesday
    date = date.subtract(1, 'day');
  }

  if (activeExpiries && activeExpiries.length > 0) {
    const formattedDate = date.format('DDMMMYYYY').toUpperCase();
    if (!activeExpiries.includes(formattedDate)) {
      const possibleExpiries = activeExpiries
        .map((exp) => dayjs(exp, 'DDMMMYYYY'))
        .filter((d) => d.year() === year && d.month() === month - 1 && d.isBefore(date))
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
  private cronTasks: cron.ScheduledTask[] = [];

  start() {
    logger.info('Starting scheduler daemon (Asia/Kolkata IST)...');

    const tradingTickJob = cron.schedule('* 9-15 * * 1-5', async () => {
      /* istanbul ignore next */
      try {
        await this.handleTradingTick();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in trading tick: ${msg}`);
      }
    });
    this.cronTasks.push(tradingTickJob);

    const scripMasterJob = cron.schedule('30 8 * * 1-5', async () => {
      /* istanbul ignore next */
      try {
        if (flagWatcher.isKillSwitched() || flagWatcher.isDoneForThisMonth()) {
          logger.info(
            'Trading paused (kill switch or monthly lockout active). Skipping instrument master download.',
          );
          return;
        }
        logger.info('Scheduled job: Downloading instrument master...');
        await sessionManager.login();
        await instrumentManager.loadInstruments(true);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to refresh instrument master: ${msg}`);
      }
    });
    this.cronTasks.push(scripMasterJob);

    const initializationJob = cron.schedule('40 8 * * 1-5', async () => {
      /* istanbul ignore next */
      try {
        if (flagWatcher.isKillSwitched() || flagWatcher.isDoneForThisMonth()) {
          logger.info(
            'Trading paused (kill switch or monthly lockout active). Skipping 08:40 AM IST initialization.',
          );
          return;
        }
        logger.info('Scheduled job: Running 08:40 AM IST initialization script...');
        logger.info('Logging in to SmartAPI...');
        await sessionManager.login();

        logger.info('Updating scriptmaster / instrument list...');
        await instrumentManager.loadInstruments(true);

        logger.info('Fetching India VIX...');
        const { vix } = await strategyManager.checkVix();
        logger.info(`Initialization complete. India VIX is ready: ${vix}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed 08:40 AM IST initialization: ${msg}`);
      }
    });
    this.cronTasks.push(initializationJob);

    const marginRefreshJob = cron.schedule('20 9 * * 1-5', async () => {
      /* istanbul ignore next */
      try {
        if (flagWatcher.isKillSwitched() || flagWatcher.isDoneForThisMonth()) {
          logger.info(
            'Trading paused (kill switch or monthly lockout active). Skipping daily margin refresh.',
          );
          return;
        }
        logger.info('Scheduled job: Refreshing margin utilized for open positions...');
        const isPaper = flagWatcher.isPaperMode();
        const currentMonth = positionsStore.getCurrentMonthString();

        await executionManager.updateMarginUtilized('BANKNIFTY', currentMonth, isPaper);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed daily margin refresh: ${msg}`);
      }
    });
    this.cronTasks.push(marginRefreshJob);

    const cleanupJob = cron.schedule('0 0 * * *', () => {
      /* istanbul ignore next */
      try {
        this.runDailyCleanup();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in daily cleanup: ${msg}`);
      }
    });
    this.cronTasks.push(cleanupJob);

    // Auto-clear monthly done-for-this-month flag on entry day
    const lockoutClearJob = cron.schedule('0 9 * * 1-5', () => {
      /* istanbul ignore next */
      try {
        logger.info(
          'Scheduled job: Checking and auto-clearing monthly lockout flag done-for-this-month...',
        );
        const now = dayjs().tz('Asia/Kolkata');
        const activeExpiries = instrumentManager.getExpiries('BANKNIFTY');
        const prevMonthDate = now.subtract(1, 'month');
        const prevExpiry = getLastTuesdayOfMonth(
          prevMonthDate.year(),
          prevMonthDate.month() + 1,
          activeExpiries,
        );
        const entryDay = getFirstTradingDayAfter(prevExpiry);

        if (now.isSame(entryDay, 'day')) {
          const lockoutPath = path.resolve(process.cwd(), 'done-for-this-month');
          if (fs.existsSync(lockoutPath)) {
            fs.unlinkSync(lockoutPath);
            logger.info('Successfully deleted done-for-this-month monthly lockout flag.');
          } else {
            logger.info('No done-for-this-month monthly lockout flag found to delete.');
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in monthly lockout flag check/clear: ${msg}`);
      }
    });
    this.cronTasks.push(lockoutClearJob);

    logger.info('Scheduler started successfully.');
  }

  stop() {
    this.cronTasks.forEach((task) => task.stop());
    logger.info('Scheduler stopped.');
  }

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
      const todayStr = dayjs().format('YYYY-MM-DD');

      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        const filePath = path.join(logDir, file);
        const fileBase = path.basename(file, '.log');

        if (fileBase === todayStr) continue;

        const fileDate = dayjs(fileBase, 'YYYY-MM-DD');
        if (fileDate.isValid() && fileDate.isBefore(dayjs().subtract(1, 'month'))) {
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
