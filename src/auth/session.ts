import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import env from '../schemas/env';
import httpClient from '../http/httpClient';
import { SmartApiLoginResponseSchema } from '../schemas/smartApi';
import logger from '../logging/logger';

/* istanbul ignore next */
function decodeBase32(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';

  for (const char of base32.toUpperCase().replace(/=+$/, '')) {
    const val = alphabet.indexOf(char);
    if (val === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }
    bits += val.toString(2).padStart(5, '0');
  }

  for (let i = 0; i + 8 <= bits.length; i += 8) {
    hex += parseInt(bits.substring(i, i + 8), 2)
      .toString(16)
      .padStart(2, '0');
  }
  return Buffer.from(hex, 'hex');
}

/* istanbul ignore next */
function generateTOTP(secretBase32: string): string {
  if (/^\d{6}$/.test(secretBase32)) {
    return secretBase32;
  }
  const key = decodeBase32(secretBase32);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / 30);

  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();

  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;

  return code.toString().padStart(6, '0');
}

export interface ISessionManager {
  login(): Promise<void>;
  getJwtToken(): string;
  getFeedToken(): string;
  getRefreshToken(): string;
  refreshSession(): Promise<void>;
}

export class SessionManager implements ISessionManager {
  private jwtToken: string = '';
  private feedToken: string = '';
  private refreshToken: string = '';
  private loginTime: number = 0;
  private cacheFilePath: string;

  constructor() {
    this.cacheFilePath = path.resolve(process.cwd(), 'data', 'session-cache.json');
    const dataDir = path.dirname(this.cacheFilePath);
    /* istanbul ignore next */
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadSessionFromDisk(): boolean {
    if (fs.existsSync(this.cacheFilePath)) {
      try {
        const content = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const data = JSON.parse(content);
        if (data.jwtToken && data.refreshToken && data.feedToken && data.loginTime) {
          // Check if it's from today (using dayjs)
          const isToday = dayjs(data.loginTime).isSame(dayjs(), 'day');
          if (isToday) {
            this.jwtToken = data.jwtToken;
            this.refreshToken = data.refreshToken;
            this.feedToken = data.feedToken;
            this.loginTime = data.loginTime;
            logger.info('Loaded active session from disk cache.');
            return true;
          }
        }
      } catch (error) {
        /* istanbul ignore next */
        logger.warn('Failed to load session from disk cache');
      }
    }
    return false;
  }

  private saveSessionToDisk(): void {
    try {
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(
          {
            jwtToken: this.jwtToken,
            refreshToken: this.refreshToken,
            feedToken: this.feedToken,
            loginTime: this.loginTime,
          },
          null,
          2,
        ),
        'utf-8',
      );
    } catch (error) {
      /* istanbul ignore next */
      logger.warn('Failed to save session to disk cache');
    }
  }

  getJwtToken(): string {
    if (!this.jwtToken) {
      this.loadSessionFromDisk();
    }
    if (!this.jwtToken) {
      throw new Error('No active session. Call login() first.');
    }
    return this.jwtToken;
  }

  getFeedToken(): string {
    if (!this.feedToken) {
      this.loadSessionFromDisk();
    }
    if (!this.feedToken) {
      throw new Error('No active session. Call login() first.');
    }
    return this.feedToken;
  }

  getRefreshToken(): string {
    if (!this.refreshToken) {
      this.loadSessionFromDisk();
    }
    if (!this.refreshToken) {
      throw new Error('No active session. Call login() first.');
    }
    return this.refreshToken;
  }

  async login(): Promise<void> {
    logger.info('Attempting SmartAPI login...');
    const url = 'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword';

    const totpCode = generateTOTP(env.CLIENT_TOTP_PIN);
    logger.info(`Generated TOTP for login.`);

    const body = {
      clientcode: env.CLIENT_CODE,
      password: env.CLIENT_PIN,
      totp: totpCode,
    };

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-PrivateKey': env.API_KEY,
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACaddress': '00-00-00-00-00-00',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
        },
        body: JSON.stringify(body),
      });

      const parsed = SmartApiLoginResponseSchema.parse(response);

      if (!parsed.status || !parsed.data) {
        throw new Error(`Login response status is false: ${parsed.message}`);
      }

      this.jwtToken = parsed.data.jwtToken;
      this.refreshToken = parsed.data.refreshToken;
      this.feedToken = parsed.data.feedToken;
      this.loginTime = Date.now();

      this.saveSessionToDisk();
      logger.info('SmartAPI login successful.');
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`SmartAPI login failed: ${msg}`);
      throw error;
    }
  }

  async refreshSession(): Promise<void> {
    logger.info('Attempting to refresh SmartAPI token...');
    const url = 'https://apiconnect.angelone.in/rest/auth/angelbroking/jwt/v1/generateTokens';

    if (!this.refreshToken) {
      // Try to load from disk
      this.loadSessionFromDisk();
    }

    if (!this.refreshToken) {
      throw new Error('Cannot refresh token: no refresh token available.');
    }

    const body = {
      refreshToken: this.refreshToken,
    };

    try {
      const response = await httpClient.request<unknown>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-PrivateKey': env.API_KEY,
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACaddress': '00-00-00-00-00-00',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          Authorization: `Bearer ${this.jwtToken}`,
        },
        body: JSON.stringify(body),
      });

      // Angel One renewal returns same structure as login response or similar
      const parsed = SmartApiLoginResponseSchema.parse(response);

      if (!parsed.status || !parsed.data) {
        throw new Error(`RenewToken response status is false: ${parsed.message}`);
      }

      this.jwtToken = parsed.data.jwtToken;
      this.refreshToken = parsed.data.refreshToken;
      this.feedToken = parsed.data.feedToken;
      this.loginTime = Date.now();

      this.saveSessionToDisk();
      logger.info('SmartAPI token refreshed successfully.');
    } catch (error: unknown) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`SmartAPI token refresh failed: ${msg}`);
      throw error;
    }
  }
}

export const sessionManager = new SessionManager();
export default sessionManager;
