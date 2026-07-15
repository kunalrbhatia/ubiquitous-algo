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
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  TELEGRAM_ENABLED: z.coerce.boolean().default(false),
  SLACK_ENABLED: z.coerce.boolean().default(false),
  SLACK_WEBHOOK_URL: z.string().optional().default(''),
  SLACK_SIGNING_SECRET: z.string().optional().default(''),
  SENSEX_EXPIRY_ENABLED: z
    .preprocess(
      (val) =>
        val === undefined || val === '' ? true : val === 'true' || val === '1' || val === true,
      z.boolean(),
    )
    .default(true),
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
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_CHAT_ID: '',
      TELEGRAM_ENABLED: false,
      SLACK_ENABLED: false,
      SLACK_WEBHOOK_URL: '',
      SLACK_SIGNING_SECRET: '',
      SENSEX_EXPIRY_ENABLED: true,
    };
  } else {
    console.error('❌ Invalid environment configuration:', error);
    process.exit(1);
  }
}

export const env = parsedEnv;
export default env;
