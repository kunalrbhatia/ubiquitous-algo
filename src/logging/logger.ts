import fs from 'fs';
import path from 'path';
import winston from 'winston';
import dayjs from 'dayjs';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Simple wrapper around winston that handles daily file writing manually to avoid transport typescript typing issues
export class CustomLogger {
  private winstonLogger: winston.Logger;
  private currentDay: string = '';
  private writeStream: fs.WriteStream | null = null;

  constructor() {
    this.winstonLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        }),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `${timestamp} [${level}]: ${message}`;
            }),
          ),
        }),
      ],
    });
  }

  private rotateStream() {
    const today = dayjs().format('YYYY-MM-DD');
    if (this.currentDay !== today) {
      if (this.writeStream) {
        this.writeStream.end();
      }
      this.currentDay = today;
      const filename = path.join(LOG_DIR, `${today}.log`);
      this.writeStream = fs.createWriteStream(filename, { flags: 'a' });
    }
  }

  private writeToFile(level: string, message: string) {
    this.rotateStream();
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS');
    const logLine = `${timestamp} [${level.toUpperCase()}]: ${message}\n`;
    if (this.writeStream) {
      this.writeStream.write(logLine);
    }
  }

  info(message: string) {
    this.winstonLogger.info(message);
    this.writeToFile('info', message);
  }

  warn(message: string) {
    this.winstonLogger.warn(message);
    this.writeToFile('warn', message);
  }

  error(message: string) {
    this.winstonLogger.error(message);
    this.writeToFile('error', message);
  }
}

export const logger = new CustomLogger();
export default logger;
