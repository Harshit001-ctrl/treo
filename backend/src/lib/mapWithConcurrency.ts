/** Runs `fn` over `items` with at most `limit` in flight at once. Each item's
 * failure is isolated to its own promise — callers that want "continue after
 * one case fails" (Section 9) wrap `fn` in its own try/catch, same as this
 * function itself never rejects because of one bad item. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
