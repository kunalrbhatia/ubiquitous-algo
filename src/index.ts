import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import env from './schemas/env';
import logger from './logging/logger';
import sessionManager from './auth/session';
import instrumentManager from './instruments/instrumentManager';
import cronScheduler from './scheduler/cronScheduler';
import flagWatcher from './flags/flagWatcher';
import executionManager from './execution/executionManager';
import positionsStore from './positions/positionsStore';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Kolkata');

const lockFilePath = path.resolve(process.cwd(), 'trading-tick.lock');

function acquireLock(): boolean {
  if (fs.existsSync(lockFilePath)) {
    try {
      const pidStr = fs.readFileSync(lockFilePath, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid)) {
        process.kill(pid, 0);
        // If process.kill doesn't throw, the process is still running.
        return false;
      }
    } catch (err: unknown) {
      // Process is not running (ESRCH) or we don't have permission. Overwrite lock.
    }
  }

  fs.writeFileSync(lockFilePath, process.pid.toString(), 'utf-8');

  const releaseLock = () => {
    try {
      if (fs.existsSync(lockFilePath)) {
        const pidStr = fs.readFileSync(lockFilePath, 'utf-8').trim();
        if (parseInt(pidStr, 10) === process.pid) {
          fs.unlinkSync(lockFilePath);
        }
      }
    } catch (err) {
      // Ignore release lock errors
    }
  };

  process.on('exit', releaseLock);
  process.on('SIGINT', () => {
    releaseLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    releaseLock();
    process.exit(0);
  });
  return true;
}

async function bootstrap() {
  if (!acquireLock()) {
    logger.warn('Another instance of the strategy tick is already running. Exiting.');
    process.exit(0);
  }

  logger.info('===================================================');
  logger.info('Running Banknifty Monthly Calendar Spread Option Strategy Tick...');
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Paper Mode: ${flagWatcher.isPaperMode() ? 'ACTIVE' : 'INACTIVE'}`);
  logger.info(`Kill Switch: ${flagWatcher.isKillSwitched() ? 'ACTIVE' : 'INACTIVE'}`);
  logger.info('===================================================');

  try {
    // 1. SmartAPI Auth Login
    await sessionManager.login();

    // 2. Load/Update Instruments Cache
    await instrumentManager.loadInstruments();

    const isPaper = flagWatcher.isPaperMode();
    const currentMonth = positionsStore.getCurrentMonthString();

    // 3. Update margin utilized for open position (if any)
    await executionManager.updateMarginUtilized('BANKNIFTY', currentMonth, isPaper);

    // 4. Run Trading Tick Cycle (Entry / Monitoring / Exit)
    await cronScheduler.handleTradingTick();

    // 5. Run daily cleanup log retention
    cronScheduler.runDailyCleanup();

    logger.info('Execution completed successfully.');
    process.exit(0);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Critical error during execution tick: ${msg}`);
    process.exit(1);
  }
}

bootstrap();
