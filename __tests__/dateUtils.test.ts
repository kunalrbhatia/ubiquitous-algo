import { parseExpiryDate } from '../src/instruments/dateUtils';

describe('dateUtils', () => {
  it('should parse valid expiry date correctly', () => {
    const res = parseExpiryDate('25AUG2026');
    expect(res.isValid()).toBe(true);
    expect(res.format('YYYY-MM-DD')).toBe('2026-08-25');
  });

  it('should return invalid date for malformed input', () => {
    const res = parseExpiryDate('invalid-format');
    expect(res.isValid()).toBe(false);
  });

  it('should return invalid date for invalid month abbreviation', () => {
    const res = parseExpiryDate('25XYZ2026');
    expect(res.isValid()).toBe(false);
  });
});
