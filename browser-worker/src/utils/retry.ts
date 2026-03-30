import { createLogger } from './logger';

const log = createLogger('retry');

interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  label?: string;
}

/**
 * Retry an async function up to `attempts` times with a fixed delay.
 * Throws the last error if all attempts fail.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  { attempts = 3, delayMs = 500, label = 'operation' }: RetryOptions = {}
): Promise<T> {
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      log.warn({ attempt: i, attempts, label }, `Attempt ${i}/${attempts} failed`);
      if (i < attempts) {
        await sleep(delayMs * i); // incremental backoff
      }
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
