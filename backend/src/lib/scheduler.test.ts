import { buildSchedule } from "./scheduler";
import { Question, Requirement } from "@prepkit/shared";

/** Shared fixture builders — keep test bodies focused on the behaviour under test. */
function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "r1",
    text: "Explain how you'd design a rate limiter.",
    kind: "technical",
    priority: "must",
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    requirement_ids: [],
    category: "technical",
    prompt: "Walk through a rate limiter design.",
    answer_outline: "Token bucket, sliding window, distributed considerations.",
    difficulty: 2,
    origin: "ai",
    edited: false,
    ...overrides,
  };
}

describe("buildSchedule", () => {
  it("produces exactly the number of days requested", () => {
    const requirements = [makeRequirement()];
    const questions = [makeQuestion({ requirement_ids: ["r1"] })];

    expect(buildSchedule(requirements, questions, 1).days).toHaveLength(1);
    expect(buildSchedule(requirements, questions, 60).days).toHaveLength(60);
  });

  it("handles a 60-day schedule with far more days than questions — most days become buffer days", () => {
    const requirements = [makeRequirement()];
    const questions = [
      makeQuestion({ id: "q1", requirement_ids: ["r1"] }),
      makeQuestion({ id: "q2", requirement_ids: [] }),
    ];
    const schedule = buildSchedule(requirements, questions, 60);

    expect(schedule.days_available).toBe(60);
    expect(schedule.days).toHaveLength(60);
    const allQuestionIds = schedule.days.flatMap((d) => d.question_ids);
    expect(allQuestionIds.sort()).toEqual(["q1", "q2"]);
    // Buffer days get the placeholder focus label.
    const bufferDays = schedule.days.filter((d) => d.question_ids.length === 0);
    expect(bufferDays.length).toBeGreaterThan(0);
    for (const day of bufferDays) {
      expect(day.focus).toBe("Review / buffer day");
      expect(day.minutes).toBe(0);
    }
  });

  it("places every must-have question somewhere in the schedule, even on a single day", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const questions = Array.from({ length: 5 }, (_, i) =>
      makeQuestion({ id: `q${i + 1}`, requirement_ids: ["r1"], difficulty: 3 })
    );
    const schedule = buildSchedule(requirements, questions, 1);
    const scheduledIds = new Set(schedule.days.flatMap((d) => d.question_ids));
    for (const q of questions) {
      expect(scheduledIds.has(q.id)).toBe(true);
    }
  });

  it("never drops a must question even when far more questions than days force overflow onto the last day", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    // 20 hard (25-minute) must questions across only 2 days — capacity will be blown.
    const questions = Array.from({ length: 20 }, (_, i) =>
      makeQuestion({ id: `q${i + 1}`, requirement_ids: ["r1"], difficulty: 3 })
    );
    const schedule = buildSchedule(requirements, questions, 2);
    const scheduledIds = schedule.days.flatMap((d) => d.question_ids);
    expect(scheduledIds.sort()).toEqual(questions.map((q) => q.id).sort());
  });

  it("every minutes value is an integer, never a float, even though per-question minutes sum arbitrarily", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" }), makeRequirement({ id: "r2", priority: "nice" })];
    const questions = [
      makeQuestion({ id: "q1", requirement_ids: ["r1"], difficulty: 1 }),
      makeQuestion({ id: "q2", requirement_ids: ["r2"], difficulty: 2 }),
      makeQuestion({ id: "q3", requirement_ids: [], difficulty: 3 }),
    ];
    for (const days of [1, 3, 7, 60]) {
      const schedule = buildSchedule(requirements, questions, days);
      for (const day of schedule.days) {
        expect(Number.isInteger(day.minutes)).toBe(true);
      }
    }
  });

  it("lands higher-priority (must) and harder material on earlier days rather than the last day", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const mustQuestion = makeQuestion({ id: "q-must", requirement_ids: ["r1"], difficulty: 3 });
    // A pile of low-priority filler that would otherwise consume early-day capacity.
    const filler = Array.from({ length: 10 }, (_, i) =>
      makeQuestion({ id: `q-filler${i}`, requirement_ids: [], difficulty: 1 })
    );
    const schedule = buildSchedule(requirements, [...filler, mustQuestion], 5);
    const mustDay = schedule.days.find((d) => d.question_ids.includes("q-must"));
    expect(mustDay).toBeDefined();
    expect(mustDay!.day).toBeLessThan(5);
  });

  it("every question_ids entry refers to a question id that actually exists in the input", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" }), makeRequirement({ id: "r2", priority: "nice" })];
    const questions = [
      makeQuestion({ id: "q1", requirement_ids: ["r1"] }),
      makeQuestion({ id: "q2", requirement_ids: ["r2"] }),
      makeQuestion({ id: "q3", requirement_ids: [] }),
    ];
    const validIds = new Set(questions.map((q) => q.id));
    for (const days of [1, 4, 60]) {
      const schedule = buildSchedule(requirements, questions, days);
      for (const day of schedule.days) {
        for (const id of day.question_ids) {
          expect(validIds.has(id)).toBe(true);
        }
      }
    }
  });

  it("handles zero questions without throwing — a thin JD produces an all-buffer schedule", () => {
    const requirements = [makeRequirement()];
    const schedule = buildSchedule(requirements, [], 5);
    expect(schedule.days).toHaveLength(5);
    for (const day of schedule.days) {
      expect(day.question_ids).toEqual([]);
      expect(day.minutes).toBe(0);
      expect(day.focus).toBe("Review / buffer day");
    }
  });

  it("handles zero requirements and zero questions (degenerate case) for both 1 and 60 days", () => {
    for (const days of [1, 60]) {
      const schedule = buildSchedule([], [], days);
      expect(schedule.days).toHaveLength(days);
      expect(schedule.days.every((d) => d.question_ids.length === 0)).toBe(true);
    }
  });

  it("every question is scheduled exactly once — no duplication across days", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" }), makeRequirement({ id: "r2", priority: "nice" })];
    const questions = [
      ...Array.from({ length: 3 }, (_, i) => makeQuestion({ id: `m${i}`, requirement_ids: ["r1"], difficulty: 2 })),
      ...Array.from({ length: 3 }, (_, i) => makeQuestion({ id: `n${i}`, requirement_ids: ["r2"], difficulty: 1 })),
      ...Array.from({ length: 3 }, (_, i) => makeQuestion({ id: `o${i}`, requirement_ids: [], difficulty: 1 })),
    ];
    const schedule = buildSchedule(requirements, questions, 3);
    const allIds = schedule.days.flatMap((d) => d.question_ids);
    expect(allIds.length).toBe(new Set(allIds).size);
    expect(allIds.sort()).toEqual(questions.map((q) => q.id).sort());
  });

  it("dominant category label reflects the majority category scheduled that day", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const questions = [
      makeQuestion({ id: "q1", requirement_ids: ["r1"], category: "system-design", difficulty: 1 }),
      makeQuestion({ id: "q2", requirement_ids: ["r1"], category: "system-design", difficulty: 1 }),
      makeQuestion({ id: "q3", requirement_ids: ["r1"], category: "behavioural", difficulty: 1 }),
    ];
    const schedule = buildSchedule(requirements, questions, 1);
    expect(schedule.days[0].focus).toBe("System design");
  });
});
