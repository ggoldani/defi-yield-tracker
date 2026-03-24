import { log } from './logger.js';

export async function retry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delay?: number; label?: string } = {},
): Promise<T> {
  const { retries = 3, delay = 1000, label = 'operation' } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = delay * Math.pow(2, attempt);
      log.warn(
        `${label} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${wait}ms...`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw new Error('Unreachable');
}
