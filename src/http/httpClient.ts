import logger from '../logging/logger';

export interface HttpClientOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

export class HttpClient {
  private timeoutMs: number;
  private retries: number;
  private backoffMs: number;

  constructor(options?: HttpClientOptions) {
    this.timeoutMs = options?.timeoutMs ?? 10000; // 10 seconds default
    this.retries = options?.retries ?? 3;
    this.backoffMs = options?.backoffMs ?? 1000;
  }

  async request<T>(url: string, init?: RequestInit): Promise<T> {
    let attempt = 0;
    while (attempt < this.retries) {
      attempt++;
      const controller = new AbortController();
      const id = setTimeout(/* istanbul ignore next */ () => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(id);

        if (!response.ok) {
          const bodyText = await response.text();
          throw new Error(
            `HTTP Error ${response.status}: ${response.statusText}. Body: ${bodyText}`,
          );
        }

        const data = await response.json();

        // Normalize common Angel One API Gateway response variations
        /* istanbul ignore next */
        if (data && typeof data === 'object') {
          const raw = data as any;
          if (raw.status === undefined && raw.success !== undefined) {
            raw.status = raw.success;
          }
          if (raw.errorcode === undefined && raw.errorCode !== undefined) {
            raw.errorcode = raw.errorCode;
          }
          if (raw.data === '') {
            raw.data = null;
          }
        }

        return data as T;
      } catch (error: unknown) {
        clearTimeout(id);
        const err = error as Error;
        const isTimeout = err?.name === 'AbortError';
        /* istanbul ignore next */
        let msg = isTimeout
          ? `Request timed out after ${this.timeoutMs}ms`
          : err?.message || String(error);

        /* istanbul ignore next */
        if (err && typeof err === 'object' && 'cause' in err && err.cause) {
          const cause = (err as any).cause;
          const causeMsg = cause instanceof Error ? cause.message : String(cause);
          msg += ` (Cause: ${causeMsg})`;
        }

        logger.warn(
          `HttpClient request failed (Attempt ${attempt}/${this.retries}): ${msg} to ${url}`,
        );

        if (attempt >= this.retries) {
          throw new Error(`Request failed after ${this.retries} attempts. Last error: ${msg}`);
        }

        // Wait with exponential backoff
        /* istanbul ignore next */
        const delay = this.backoffMs * Math.pow(2, attempt - 1);
        /* istanbul ignore next */
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error('Unreachable: HttpClient loop finished without returning or throwing');
  }
}

export const httpClient = new HttpClient();
export default httpClient;
