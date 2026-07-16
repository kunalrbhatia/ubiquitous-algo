import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import logger from '../logging/logger';
import sessionManager from '../auth/session';
import instrumentManager from '../instruments/instrumentManager';
import strategyManager from '../strategy/strategyManager';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Kolkata');

async function main() {
  logger.info('Generating Strategy Order Basket...');
  try {
    await sessionManager.login();
    await instrumentManager.loadInstruments();

    const underlying = 'BANKNIFTY';
    const basket = await strategyManager.buildBasket(underlying, false);
    if (!basket) {
      logger.error('Failed to construct the basket.');
      process.exit(1);
    }

    console.log(JSON.stringify(basket, null, 2));
    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to generate basket: ${msg}`);
    process.exit(1);
  }
}

main();
