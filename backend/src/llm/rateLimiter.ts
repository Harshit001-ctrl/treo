/**
 * Free-tier LLM providers cap tokens-per-minute as well as requests-per-minute,
 * and the brief calls out "a pipeline that falls over the first time a
 * provider says 'slow down'" as the most common way to lose points. This
 * module is the single choke point every LLM call goes through: calls are
 * serialized (never concurrent, so we never burst past a per-minute cap) with
 * a minimum spacing between them, and a failed call is retried with
 * exponential backoff + jitter before giving up.
 */

const MIN_INTERVAL_MS = 1100; // keeps us comfortably under a ~50-60 req/min free tier
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? err);
  return (
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    /rate.?limit|RESOURCE_EXHAUSTED|429|overloaded|UNAVAILABLE|timeout|timed out|ETIMEDOUT|ECONNRESET|aborted/i.test(message)
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_RETRIES || !isRetryable(err)) throw err;
      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
      const jitter = Math.random() * backoff * 0.3;
      await sleep(backoff + jitter);
    }
  }
}

export function enqueueLlmCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return withRetry(fn);
  });
  queue = run.catch(() => undefined);
  return run;
}
