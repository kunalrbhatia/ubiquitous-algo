import http from 'http';
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

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Kolkata');

const PORT = env.PORT;

async function bootstrap() {
  logger.info('===================================================');
  logger.info('Initializing Ratio Double Calendar Spread Daemon...');
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Paper Mode: ${flagWatcher.isPaperMode() ? 'ACTIVE' : 'INACTIVE'}`);
  logger.info(`Kill Switch: ${flagWatcher.isKillSwitched() ? 'ACTIVE' : 'INACTIVE'}`);
  logger.info('===================================================');

  try {
    // 1. Initial SmartAPI Auth
    await sessionManager.login();

    // 2. Load Instruments Cache
    await instrumentManager.loadInstruments();

    // 3. Initialize SmartStream WebSocket
    const { smartStream } = await import('./execution/smartStream');
    const { positionsStore } = await import('./positions/positionsStore');

    const manageWebSocketConnection = async () => {
      const isPaper = flagWatcher.isPaperMode();

      if (flagWatcher.isKillSwitched() || flagWatcher.isDoneForThisMonth()) {
        logger.info(
          'Trading paused (kill switch or monthly lockout active). Disconnecting SmartStream WebSocket...',
        );
        if (smartStream.getIsConnected()) {
          smartStream.disconnect();
        }
        return;
      }

      const liveDir = path.resolve(process.cwd(), 'data', 'live');

      // "if no position file exists in data/live/, skip the WebSocket entirely."
      const liveFiles = fs.existsSync(liveDir)
        ? fs.readdirSync(liveDir).filter((f) => f.endsWith('.json'))
        : [];
      if (liveFiles.length === 0) {
        logger.info(
          'No position files exist in data/live/. Skipping WebSocket connection entirely.',
        );
        if (smartStream.getIsConnected()) {
          smartStream.disconnect();
        }
        return;
      }

      // "Only connect during market hours — 09:15–15:30 IST, Mon–Fri"
      const now = dayjs().tz('Asia/Kolkata');
      const day = now.day();
      const minutesSinceMidnight = now.hour() * 60 + now.minute();
      const isMarketHours =
        day >= 1 &&
        day <= 5 &&
        minutesSinceMidnight >= 555 && // 09:15 IST
        minutesSinceMidnight <= 930; // 15:30 IST

      if (!isMarketHours) {
        if (smartStream.getIsConnected()) {
          logger.info('Outside market hours. Disconnecting SmartStream WebSocket...');
          smartStream.disconnect();
        }
        return;
      }

      // "Connect only when positionsStore.readPosition() returns an open position."
      const currentMonth = positionsStore.getCurrentMonthString();
      const subscribeTokens: string[] = [];
      let hasOpenPosition = false;

      const currentPosition = positionsStore.readPosition('BANKNIFTY', currentMonth, isPaper);
      if (currentPosition && currentPosition.status === 'open') {
        hasOpenPosition = true;
        const tokens = currentPosition.orders.map((o) => o.symboltoken);
        subscribeTokens.push(...tokens);
      }

      if (!hasOpenPosition) {
        logger.info('No open position found in positionsStore. Skipping/disconnecting WebSocket.');
        if (smartStream.getIsConnected()) {
          smartStream.disconnect();
        }
        return;
      }

      // If we should connect and are not connected
      if (!smartStream.getIsConnected()) {
        logger.info('Connecting SmartStream WebSocket...');
        await smartStream.connect((_tick) => {
          // Real-time tick callback - cache is updated automatically in smartStream
        });

        if (subscribeTokens.length > 0) {
          smartStream.subscribe(subscribeTokens);
          logger.info(
            `Resubscribed SmartStream to active position tokens: ${subscribeTokens.join(', ')}`,
          );
        }
      }
    };

    // Call on startup
    await manageWebSocketConnection();

    // Check periodically to handle market open/close and dynamic position changes
    const wsInterval = setInterval(async () => {
      try {
        await manageWebSocketConnection();
      } catch (err: any) {
        logger.error(`Error in WebSocket connection manager: ${err?.message || err}`);
      }
    }, 30000);

    // 4. Start Scheduler
    cronScheduler.start();

    // 4. Create simple HTTP server for health monitoring (built-in, no express needed)
    const server = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'UP',
            timestamp: new Date().toISOString(),
            paperMode: flagWatcher.isPaperMode(),
            killSwitched: flagWatcher.isKillSwitched(),
            nodeVersion: process.version,
            env: env.NODE_ENV,
          }),
        );
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    });

    server.listen(PORT, () => {
      logger.info(`Health check server listening on port ${PORT}`);
    });

    // Graceful Shutdown
    const shutdown = () => {
      logger.info('Shutting down gracefully...');
      clearInterval(wsInterval);
      cronScheduler.stop();
      smartStream.disconnect();
      server.close(() => {
        logger.info('HTTP server closed. Process exiting.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Critical error during bootstrap: ${msg}`);
    process.exit(1);
  }
}

bootstrap();
