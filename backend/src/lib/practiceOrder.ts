export interface PracticeEntry {
  flashcardId: string;
  lastConfidence: number;
  timesReviewed: number;
}

/**
 * Section 7: "order the next session by what they were least confident
 * about." A simple confidence-weighted sort (ascending) rather than a full
 * spaced-repetition interval — chosen because it's trivial to explain and
 * verify (least-confident card first), and because there's no review-date
 * data model here to make interval scheduling meaningful yet. A card never
 * reviewed is treated as least confident of all (lower than a real rating of
 * 1), so brand-new cards surface before ones the user already rated low but
 * has since improved on.
 */
export function orderPracticeSession(flashcardIds: string[], practice: PracticeEntry[]): string[] {
  const byId = new Map(practice.map((p) => [p.flashcardId, p]));
  return [...flashcardIds].sort((a, b) => {
    const scoreA = byId.get(a)?.lastConfidence ?? 0;
    const scoreB = byId.get(b)?.lastConfidence ?? 0;
    return scoreA - scoreB;
  });
}
