/**
 * Stable id assignment for requirements/questions/flashcards ("r1", "q1", "f1").
 * IDs are never trusted from the LLM — always assigned here, in code, after a
 * generation call returns. `nextIds` scans the current max numeric suffix for a
 * prefix across all *existing* items (including ones just kept from a partial
 * regeneration) so freshly generated items can never collide with survivors.
 */

const idPattern = (prefix: string) => new RegExp(`^${prefix}(\\d+)$`);

export function maxIdSuffix(ids: string[], prefix: string): number {
  const pattern = idPattern(prefix);
  let max = 0;
  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return max;
}

/** Returns `count` fresh ids like ["q4", "q5"] that don't collide with `existingIds`. */
export function nextIds(existingIds: string[], prefix: string, count: number): string[] {
  const start = maxIdSuffix(existingIds, prefix) + 1;
  return Array.from({ length: count }, (_, i) => `${prefix}${start + i}`);
}
