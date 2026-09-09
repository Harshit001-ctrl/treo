import { Question, Requirement, Schedule, ScheduleDay } from "@prepkit/shared";

/** Integer minutes per difficulty tier — read + think + answer + review, scaled by depth. */
const MINUTES_BY_DIFFICULTY: Record<number, number> = { 1: 8, 2: 15, 3: 25 };

const DAILY_TARGET_MINUTES = 45; // one comfortable practice session
const FRONT_LOAD_MULTIPLIER = 1.2; // the first 60% of days get extra capacity
const SINGLE_DAY_CAP_MINUTES = 180; // soft cap for nice/general fill when days=1

const CATEGORY_LABELS: Record<string, string> = {
  "system-design": "System design",
  technical: "Technical fundamentals",
  domain: "Domain knowledge",
  behavioural: "Behavioural",
  "company-fit": "Company & culture fit",
};
const LABEL_PRIORITY = ["system-design", "technical", "domain", "behavioural", "company-fit"];

function priorityScore(question: Question, mustIds: Set<string>, niceIds: Set<string>): number {
  if (question.requirement_ids.some((id) => mustIds.has(id))) return 2;
  if (question.requirement_ids.some((id) => niceIds.has(id))) return 1;
  return 0;
}

function dayCapacities(days: number): number[] {
  if (days === 1) return [SINGLE_DAY_CAP_MINUTES];
  const frontLoadedDays = Math.ceil(days * 0.6);
  return Array.from({ length: days }, (_, i) =>
    Math.round(DAILY_TARGET_MINUTES * (i < frontLoadedDays ? FRONT_LOAD_MULTIPLIER : 1))
  );
}

function dominantLabel(questionIds: string[], questionById: Map<string, Question>): string {
  if (questionIds.length === 0) return "Review / buffer day";
  const counts = new Map<string, number>();
  for (const id of questionIds) {
    const category = questionById.get(id)?.category;
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  let top = LABEL_PRIORITY[LABEL_PRIORITY.length - 1];
  let topCount = -1;
  for (const category of LABEL_PRIORITY) {
    const count = counts.get(category) ?? 0;
    if (count > topCount) {
      topCount = count;
      top = category;
    }
  }
  return CATEGORY_LABELS[top] ?? "Mixed practice";
}

/**
 * Pure, deterministic, and always recomputed from scratch (never patched
 * incrementally) — cheap enough that recomputing is simpler than trying to
 * diff-and-repair an existing schedule, and it trivially keeps every
 * invariant true after a regeneration changes the question set. See
 * Section 8: exact day count, every must-have covered somewhere, harder/
 * higher-priority material lands earlier, integer minutes throughout.
 */
export function buildSchedule(requirements: Requirement[], questions: Question[], days: number): Schedule {
  const mustIds = new Set(requirements.filter((r) => r.priority === "must").map((r) => r.id));
  const niceIds = new Set(requirements.filter((r) => r.priority === "nice").map((r) => r.id));
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const scored = questions.map((q) => ({
    id: q.id,
    score: priorityScore(q, mustIds, niceIds),
    difficulty: q.difficulty,
    minutes: MINUTES_BY_DIFFICULTY[q.difficulty] ?? 15,
  }));

  // Deterministic ordering: priority desc, difficulty desc, original index (stable sort) as tie-break.
  const ordered = scored
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.score - a.item.score || b.item.difficulty - a.item.difficulty || a.index - b.index)
    .map(({ item }) => item);

  const mustQueue = ordered.filter((q) => q.score === 2);
  const niceQueue = ordered.filter((q) => q.score === 1);
  const otherQueue = ordered.filter((q) => q.score === 0);

  const caps = dayCapacities(days);
  const dayEntries: { day: number; question_ids: string[]; minutes: number }[] = Array.from(
    { length: days },
    (_, i) => ({ day: i + 1, question_ids: [], minutes: 0 })
  );

  // Pass 1: must-tied questions are never dropped, even if they blow a day's cap — they only spill forward.
  let cursor = 0;
  for (const item of mustQueue) {
    while (cursor < days - 1 && dayEntries[cursor].minutes + item.minutes > caps[cursor] && dayEntries[cursor].question_ids.length > 0) {
      cursor += 1;
    }
    dayEntries[cursor].question_ids.push(item.id);
    dayEntries[cursor].minutes += item.minutes;
  }

  // Pass 2: nice, then general — fill the earliest day with room; may go unscheduled if truly no room anywhere.
  for (const queue of [niceQueue, otherQueue]) {
    for (const item of queue) {
      for (let d = 0; d < days; d++) {
        if (dayEntries[d].minutes + item.minutes <= caps[d] || dayEntries[d].question_ids.length === 0) {
          dayEntries[d].question_ids.push(item.id);
          dayEntries[d].minutes += item.minutes;
          break;
        }
      }
    }
  }

  const scheduleDays: ScheduleDay[] = dayEntries.map((entry) => ({
    day: entry.day,
    focus: dominantLabel(entry.question_ids, questionById),
    question_ids: entry.question_ids,
    minutes: entry.minutes,
  }));

  return { days_available: days, days: scheduleDays };
}
