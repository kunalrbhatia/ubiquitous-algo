import { envSchema } from '../src/schemas/env';

describe('Environment Schema Validation', () => {
  test('validates correct configuration', () => {
    const validEnv = {
      PORT: '3000',
      NODE_ENV: 'production',
      API_KEY: 'test_api_key',
      CLIENT_CODE: 'test_client_code',
      CLIENT_PIN: '1234',
      CLIENT_TOTP_PIN: '123456',
    };

    const parsed = envSchema.parse(validEnv);
    expect(parsed.PORT).toBe(3000);
    expect(parsed.NODE_ENV).toBe('production');
  });

  test('throws error on missing credentials', () => {
    const invalidEnv = {
      PORT: '3000',
      NODE_ENV: 'production',
    };

    expect(() => envSchema.parse(invalidEnv)).toThrow();
  });
});
