import fs from 'fs';
import path from 'path';

export interface IFlagWatcher {
  isPaperMode(): boolean;
  isKillSwitched(): boolean;
  isDoneForThisMonth(): boolean;
}

export class FlagWatcher implements IFlagWatcher {
  private paperPath: string;
  private killPath: string;
  private doneForThisMonthPath: string;

  constructor() {
    this.paperPath = path.resolve(process.cwd(), '.paper');
    this.killPath = path.resolve(process.cwd(), '.kill');
    this.doneForThisMonthPath = path.resolve(process.cwd(), 'done-for-this-month');
  }

  isPaperMode(): boolean {
    return fs.existsSync(this.paperPath);
  }

  isKillSwitched(): boolean {
    return fs.existsSync(this.killPath);
  }

  isDoneForThisMonth(): boolean {
    return fs.existsSync(this.doneForThisMonthPath);
  }
}

export const flagWatcher = new FlagWatcher();
export default flagWatcher;
