import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import logger from '../logging/logger';
import sessionManager from '../auth/session';
import instrumentManager from '../instruments/instrumentManager';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Kolkata');

async function main() {
  logger.info('Starting daily scrip master download and preparation...');
  try {
    await sessionManager.login();
    await instrumentManager.loadInstruments();
    logger.info('Daily scrip master preparation completed successfully.');
    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Daily preparation failed: ${msg}`);
    process.exit(1);
  }
}

main();
