import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import {
  CronScheduler,
  getLastTuesdayOfMonth,
  getFirstTradingDayAfter,
} from '../src/scheduler/cronScheduler';
import sessionManager from '../src/auth/session';
import instrumentManager from '../src/instruments/instrumentManager';
import strategyManager from '../src/strategy/strategyManager';
import executionManager from '../src/execution/executionManager';
import positionsStore from '../src/positions/positionsStore';
import flagWatcher from '../src/flags/flagWatcher';
import fs from 'fs';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

jest.mock('../src/auth/session');
jest.mock('../src/instruments/instrumentManager');
jest.mock('../src/strategy/strategyManager');
jest.mock('../src/execution/executionManager');
jest.mock('../src/positions/positionsStore');
jest.mock('../src/flags/flagWatcher');
jest.mock('fs');

describe('CronScheduler & Date Helpers', () => {
  let scheduler: CronScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    scheduler = new CronScheduler();

    (flagWatcher.isDoneForThisMonth as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('getLastTuesdayOfMonth holiday adjustment and fallback', () => {
    // July 2026 last Tuesday is July 28
    const date = getLastTuesdayOfMonth(2026, 7);
    expect(date.format('YYYY-MM-DD')).toBe('2026-07-28');

    // With active expiries where July 28 is NOT listed (a holiday)
    // Should fallback to the closest preceding expiry in the same month (say July 27)
    const activeExpiries = ['27JUL2026', '25AUG2026'];
    const adjusted = getLastTuesdayOfMonth(2026, 7, activeExpiries);
    expect(adjusted.format('YYYY-MM-DD')).toBe('2026-07-27');
  });

  test('getFirstTradingDayAfter skips weekends', () => {
    const friday = dayjs('2026-07-10'); // Friday
    const nextTradingDay = getFirstTradingDayAfter(friday);
    expect(nextTradingDay.format('YYYY-MM-DD')).toBe('2026-07-13'); // Monday
  });

  test('handleTradingTick does nothing outside market hours', async () => {
    jest.setSystemTime(new Date('2026-07-15T08:00:00+05:30'));
    await scheduler.handleTradingTick();
    expect(positionsStore.getCurrentMonthString).not.toHaveBeenCalled();
  });

  test('handleTradingTick does nothing if kill switch or lockout is active', async () => {
    jest.setSystemTime(new Date('2026-07-15T10:00:00+05:30'));
    (flagWatcher.isKillSwitched as jest.Mock).mockReturnValue(true);
    await scheduler.handleTradingTick();
    expect(positionsStore.getCurrentMonthString).not.toHaveBeenCalled();
  });

  test('handleTradingTick runs entry on entry day morning', async () => {
    // July 2026: last Tuesday of June 2026 is June 30. First trading day after is Wed July 1.
    jest.setSystemTime(new Date('2026-07-01T10:00:00+05:30')); // Wed July 1, 10:00 AM IST
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (flagWatcher.isKillSwitched as jest.Mock).mockReturnValue(false);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue(null); // No position
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue(['28JUL2026', '25AUG2026']);

    (strategyManager.checkVix as jest.Mock).mockResolvedValue({ passed: true, vix: 12 });
    (strategyManager.buildBasket as jest.Mock).mockResolvedValue([]);

    await scheduler.handleTradingTick();

    expect(sessionManager.login).toHaveBeenCalled();
    expect(executionManager.executeEntry).toHaveBeenCalledWith('BANKNIFTY', []);
  });

  test('handleTradingTick auto-clears lockout flag on entry day', async () => {
    jest.setSystemTime(new Date('2026-07-01T10:00:00+05:30'));
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (flagWatcher.isKillSwitched as jest.Mock).mockReturnValue(false);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue(null);
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue(['28JUL2026', '25AUG2026']);
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    await scheduler.handleTradingTick();

    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('done-for-this-month'));
  });

  test('handleTradingTick skips entry if VIX is invalid', async () => {
    jest.setSystemTime(new Date('2026-07-01T10:00:00+05:30'));
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (flagWatcher.isKillSwitched as jest.Mock).mockReturnValue(false);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue(null);
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue(['28JUL2026', '25AUG2026']);

    (strategyManager.checkVix as jest.Mock).mockResolvedValue({ passed: false, vix: 15 });

    await scheduler.handleTradingTick();

    expect(positionsStore.setMonthlySkipState).toHaveBeenCalledWith(
      'BANKNIFTY',
      '2026-07',
      true,
      true,
    );
    expect(strategyManager.buildBasket).not.toHaveBeenCalled();
  });

  test('handleTradingTick skips entry if basket build returns null', async () => {
    jest.setSystemTime(new Date('2026-07-01T10:00:00+05:30'));
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (flagWatcher.isKillSwitched as jest.Mock).mockReturnValue(false);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue(null);
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue(['28JUL2026', '25AUG2026']);

    (strategyManager.checkVix as jest.Mock).mockResolvedValue({ passed: true, vix: 12 });
    (strategyManager.buildBasket as jest.Mock).mockResolvedValue(null);

    await scheduler.handleTradingTick();

    expect(executionManager.executeEntry).not.toHaveBeenCalled();
  });

  test('handleTradingTick monitors open position on non-expiry day', async () => {
    // Thurs July 2, 10:00 AM IST (after entry day Wed July 1)
    jest.setSystemTime(new Date('2026-07-02T10:00:00+05:30'));
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (flagWatcher.isKillSwitched as jest.Mock).mockReturnValue(false);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue({ status: 'open' });
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue(['28JUL2026', '25AUG2026']);

    await scheduler.handleTradingTick();

    expect(executionManager.monitorPnl).toHaveBeenCalledWith('BANKNIFTY', '2026-07', true);
  });

  test('handleTradingTick does nothing if position already skipped or closed', async () => {
    jest.setSystemTime(new Date('2026-07-01T10:00:00+05:30'));
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (flagWatcher.isKillSwitched as jest.Mock).mockReturnValue(false);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue({ status: 'skipped' });
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue(['28JUL2026', '25AUG2026']);

    await scheduler.handleTradingTick();

    expect(strategyManager.checkVix).not.toHaveBeenCalled();
  });

  test('handleTradingTick exits position on T0 Expiry day at 15:15 IST', async () => {
    // Expiry day: Tuesday July 28, 15:20 IST
    jest.setSystemTime(new Date('2026-07-28T15:20:00+05:30'));
    (flagWatcher.isPaperMode as jest.Mock).mockReturnValue(true);
    (flagWatcher.isKillSwitched as jest.Mock).mockReturnValue(false);
    (positionsStore.getCurrentMonthString as jest.Mock).mockReturnValue('2026-07');
    (positionsStore.readPosition as jest.Mock).mockReturnValue({ status: 'open' });
    (instrumentManager.getExpiries as jest.Mock).mockReturnValue(['28JUL2026', '25AUG2026']);

    await scheduler.handleTradingTick();

    expect(executionManager.executeExit).toHaveBeenCalledWith('BANKNIFTY', '2026-07', true);
  });

  test('runDailyCleanup works correctly', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readdirSync as jest.Mock).mockReturnValue(['2026-05-01.log', '2026-07-01.log']);

    scheduler.runDailyCleanup();
    expect(fs.unlinkSync).toHaveBeenCalled();
  });
});
