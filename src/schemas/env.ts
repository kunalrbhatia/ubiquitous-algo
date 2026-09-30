import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env in non-test environments or if specifically required
/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY: z.string().min(1, 'API_KEY is required'),
  CLIENT_CODE: z.string().min(1, 'CLIENT_CODE is required'),
  CLIENT_PIN: z.string().min(1, 'CLIENT_PIN is required'),
  CLIENT_TOTP_PIN: z.string().min(1, 'CLIENT_TOTP_PIN is required'),
  LOTS: z.coerce.number().int().positive().default(1),
  /** Market-close exit time on expiry day (HH:MM, 24h IST) — e.g. "14:59" */
  EXIT_TIME: z.string().default('14:59'),
  /** Max slippage vs LTP allowed on entry limit orders (fraction, 0.03 = 3%) */
  MAX_SLIPPAGE_PCT: z.coerce.number().nonnegative().default(0.03),
  /** Max slippage vs LTP allowed on stop-loss exits (fraction) */
  SL_SLIPPAGE_PCT: z.coerce.number().nonnegative().default(0.015),
  /** Wall-clock budget (ms) for confirming a single order fill */
  ORDER_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  /**
   * Minimum lots of book depth required on both bid and ask for a T0 short leg.
   * Demanding 2 lots rejects far-OTM month-ahead strikes whose books are thin.
   */
  SHORT_LEG_MIN_LOTS_DEPTH: z.coerce.number().int().nonnegative().default(1),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

/* istanbul ignore next */
try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (process.env.NODE_ENV === 'test') {
    // Return a dummy env for tests to avoid throwing during module resolution
    parsedEnv = {
      PORT: 3000,
      NODE_ENV: 'test',
      API_KEY: 'test_key',
      CLIENT_CODE: 'test_code',
      CLIENT_PIN: '1234',
      CLIENT_TOTP_PIN: '123456',
      LOTS: 1,
      EXIT_TIME: '14:59',
      MAX_SLIPPAGE_PCT: 0.03,
      SL_SLIPPAGE_PCT: 0.015,
      ORDER_POLL_TIMEOUT_MS: 30000,
      SHORT_LEG_MIN_LOTS_DEPTH: 1,
    };
  } else {
    console.error('❌ Invalid environment configuration:', error);
    process.exit(1);
  }
}

export const env = parsedEnv;
export default env;
