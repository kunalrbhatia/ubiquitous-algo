// Black-Scholes helper functions for option greeks

// Cumulative standard normal distribution function
export function stdNormCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + 1.330274 * t))));
  return x > 0 ? 1 - p : p;
}

/**
 * Calculates option delta using Black-Scholes
 * @param s Current stock price (LTP of underlying)
 * @param k Option strike price
 * @param t Time to expiration in years (e.g., days to expiry / 365)
 * @param v Volatility (IV) as a decimal (e.g., 0.12 for 12% IV)
 * @param r Risk-free interest rate (e.g., 0.07 for 7%)
 * @param type Option Type 'CE' (Call) or 'PE' (Put)
 */
export function calculateDelta(
  s: number,
  k: number,
  t: number,
  v: number,
  r: number,
  type: 'CE' | 'PE',
): number {
  if (t <= 0) {
    if (type === 'CE') return s > k ? 1 : 0;
    return s < k ? -1 : 0;
  }
  if (v <= 0) {
    v = 0.01; // Avoid division by zero
  }

  const d1 = (Math.log(s / k) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));

  if (type === 'CE') {
    return stdNormCDF(d1);
  } else {
    return stdNormCDF(d1) - 1;
  }
}
