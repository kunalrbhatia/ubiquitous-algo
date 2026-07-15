import fs from 'fs';
import { FlagWatcher } from '../src/flags/flagWatcher';

jest.mock('fs');

describe('FlagWatcher', () => {
  let flagWatcher: FlagWatcher;

  beforeEach(() => {
    jest.clearAllMocks();
    flagWatcher = new FlagWatcher();
  });

  test('isPaperMode returns true if .paper file exists', () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    expect(flagWatcher.isPaperMode()).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('.paper'));
  });

  test('isPaperMode returns false if .paper file does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
    expect(flagWatcher.isPaperMode()).toBe(false);
  });

  test('isKillSwitched returns true if .kill file exists', () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    expect(flagWatcher.isKillSwitched()).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('.kill'));
  });

  test('isKillSwitched returns false if .kill file does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
    expect(flagWatcher.isKillSwitched()).toBe(false);
  });

  test('isDoneForThisMonth returns true if done-for-this-month file exists', () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    expect(flagWatcher.isDoneForThisMonth()).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('done-for-this-month'));
  });

  test('isDoneForThisMonth returns false if done-for-this-month file does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
    expect(flagWatcher.isDoneForThisMonth()).toBe(false);
  });
});
