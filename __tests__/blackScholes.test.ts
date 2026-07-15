import { calculateDelta, stdNormCDF } from '../src/strategy/blackScholes';

describe('Black-Scholes Delta calculations', () => {
  test('stdNormCDF', () => {
    expect(stdNormCDF(0)).toBeCloseTo(0.5, 4);
    expect(stdNormCDF(1.96)).toBeCloseTo(0.975, 3);
    expect(stdNormCDF(-1.96)).toBeCloseTo(0.025, 3);
  });

  test('calculateDelta - Call Option (CE)', () => {
    // ATM call delta should be close to 0.5
    const deltaATM = calculateDelta(100, 100, 0.25, 0.2, 0.05, 'CE');
    expect(deltaATM).toBeGreaterThan(0.45);
    expect(deltaATM).toBeLessThan(0.6);

    // Deep ITM call delta should be close to 1
    const deltaITM = calculateDelta(120, 100, 0.25, 0.2, 0.05, 'CE');
    expect(deltaITM).toBeCloseTo(0.99, 1);

    // Deep OTM call delta should be close to 0
    const deltaOTM = calculateDelta(80, 100, 0.25, 0.2, 0.05, 'CE');
    expect(deltaOTM).toBeCloseTo(0.01, 1);
  });

  test('calculateDelta - Put Option (PE)', () => {
    // ATM put delta should be close to -0.5
    const deltaATM = calculateDelta(100, 100, 0.25, 0.2, 0.05, 'PE');
    expect(deltaATM).toBeLessThan(-0.4);
    expect(deltaATM).toBeGreaterThan(-0.55);

    // Deep ITM put delta should be close to -1
    const deltaITM = calculateDelta(80, 100, 0.25, 0.2, 0.05, 'PE');
    expect(deltaITM).toBeCloseTo(-0.99, 1);

    // Deep OTM put delta should be close to 0
    const deltaOTM = calculateDelta(120, 100, 0.25, 0.2, 0.05, 'PE');
    expect(deltaOTM).toBeCloseTo(0.0, 1);
  });

  test('calculateDelta edge cases', () => {
    // Expiry t <= 0
    expect(calculateDelta(105, 100, 0, 0.2, 0.05, 'CE')).toBe(1);
    expect(calculateDelta(95, 100, 0, 0.2, 0.05, 'CE')).toBe(0);
    expect(calculateDelta(105, 100, 0, 0.2, 0.05, 'PE')).toBe(0);
    expect(calculateDelta(95, 100, 0, 0.2, 0.05, 'PE')).toBe(-1);

    // Volatility v <= 0
    const deltaZeroVol = calculateDelta(105, 100, 0.1, 0, 0.05, 'CE');
    expect(deltaZeroVol).toBeGreaterThan(0.9);
  });
});
