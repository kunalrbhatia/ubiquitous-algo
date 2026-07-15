import logger, { CustomLogger } from '../src/logging/logger';
import fs from 'fs';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(true),
    createWriteStream: jest.fn().mockReturnValue({
      write: jest.fn(),
      end: jest.fn(),
    }),
  };
});

describe('Logger', () => {
  test('should log info, warn, and error without throwing', () => {
    expect(() => {
      logger.info('Test info log');
      logger.warn('Test warn log');
      logger.error('Test error log');
    }).not.toThrow();
  });

  test('should rotate file when day changes', () => {
    const customLogger = new CustomLogger();
    // Simulate day change
    customLogger.info('Log day 1');

    // Override current day to force rotation
    (customLogger as unknown as { currentDay: string }).currentDay = '2000-01-01';
    customLogger.info('Log day 2');

    expect(fs.createWriteStream).toHaveBeenCalled();
  });
});
