import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const MONTH_MAP: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

export function parseExpiryDate(exp: string): dayjs.Dayjs {
  const match = exp.toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (!match) {
    return dayjs('invalid-date');
  }
  const day = parseInt(match[1], 10);
  const monthStr = match[2];
  const year = parseInt(match[3], 10);
  const month = MONTH_MAP[monthStr];
  if (month === undefined) {
    return dayjs('invalid-date');
  }
  return dayjs.tz(
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    'Asia/Kolkata',
  );
}
