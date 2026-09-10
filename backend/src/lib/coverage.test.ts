import { computeCoverage, recomputeCoverageField, runCoverageLoop, toCoverageField } from "./coverage";
import { Question, Requirement } from "@prepkit/shared";

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "r1",
    text: "Explain your experience with distributed systems.",
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
    prompt: "Describe a distributed system you built.",
    answer_outline: "CAP tradeoffs, consistency model, failure handling.",
    difficulty: 2,
    origin: "ai",
    edited: false,
    ...overrides,
  };
}

describe("computeCoverage", () => {
  it("reports a requirement with no referencing question as an uncovered gap", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const questions = [makeQuestion({ requirement_ids: [] })];
    const check = computeCoverage(requirements, questions);
    expect(check.mustUncovered).toEqual(["r1"]);
  });

  it("does not report a requirement covered by at least one question", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const questions = [makeQuestion({ requirement_ids: ["r1"] })];
    const check = computeCoverage(requirements, questions);
    expect(check.mustUncovered).toEqual([]);
  });

  it("tracks must and nice gaps separately", () => {
    const requirements = [
      makeRequirement({ id: "r-must", priority: "must" }),
      makeRequirement({ id: "r-nice", priority: "nice" }),
    ];
    const questions: Question[] = [];
    const check = computeCoverage(requirements, questions);
    expect(check.mustUncovered).toEqual(["r-must"]);
    expect(check.niceUncovered).toEqual(["r-nice"]);
  });

  it("a question covering multiple requirements clears all of them", () => {
    const requirements = [
      makeRequirement({ id: "r1", priority: "must" }),
      makeRequirement({ id: "r2", priority: "must" }),
    ];
    const questions = [makeQuestion({ requirement_ids: ["r1", "r2"] })];
    const check = computeCoverage(requirements, questions);
    expect(check.mustUncovered).toEqual([]);
  });
});

describe("toCoverageField / recomputeCoverageField", () => {
  it("reports complete status with a full must/nice breakdown when nothing is uncovered", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" }), makeRequirement({ id: "r2", priority: "nice" })];
    const questions = [makeQuestion({ requirement_ids: ["r1", "r2"] })];
    const coverage = recomputeCoverageField(requirements, questions, 0);
    expect(coverage.status).toBe("complete");
    expect(coverage.reason).toBeNull();
    expect(coverage.uncovered_requirement_ids).toEqual([]);
    expect(coverage.must).toEqual({ total: 1, covered: 1, uncovered_ids: [] });
    expect(coverage.nice).toEqual({ total: 1, covered: 1, uncovered_ids: [] });
  });

  it("reports incomplete/max_passes_reached with correct counts when a must gap remains", () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" }), makeRequirement({ id: "r2", priority: "must" })];
    const questions = [makeQuestion({ requirement_ids: ["r1"] })];
    const coverage = recomputeCoverageField(requirements, questions, 2);
    expect(coverage.status).toBe("incomplete");
    expect(coverage.reason).toBe("max_passes_reached");
    expect(coverage.uncovered_requirement_ids).toEqual(["r2"]);
    expect(coverage.must).toEqual({ total: 2, covered: 1, uncovered_ids: ["r2"] });
    expect(coverage.passes).toBe(2);
  });

  it("uncovered_requirement_ids mirrors must-only uncovered ids, never nice ones", () => {
    const requirements = [makeRequirement({ id: "r-nice", priority: "nice" })];
    const check = computeCoverage(requirements, []);
    const coverage = toCoverageField(requirements, check, 0, "complete", null);
    // Nice-only gaps don't block "complete" status per the module's own status derivation upstream,
    // but uncovered_requirement_ids is defined as must-only regardless of what status is passed in.
    expect(coverage.uncovered_requirement_ids).toEqual([]);
    expect(coverage.nice?.uncovered_ids).toEqual(["r-nice"]);
  });
});

describe("runCoverageLoop", () => {
  it("returns complete immediately when the initial question set already covers everything", async () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const initialQuestions = [makeQuestion({ requirement_ids: ["r1"] })];
    const generateForGaps = jest.fn();

    const result = await runCoverageLoop(requirements, initialQuestions, generateForGaps);

    expect(result.coverage.status).toBe("complete");
    expect(result.coverage.passes).toBe(0);
    expect(generateForGaps).not.toHaveBeenCalled();
  });

  it("closes a gap in one pass when generateForGaps returns a covering question", async () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const generateForGaps = jest.fn(async (gapIds: string[]) => [
      makeQuestion({ id: "q-new", requirement_ids: gapIds }),
    ]);

    const result = await runCoverageLoop(requirements, [], generateForGaps);

    expect(result.coverage.status).toBe("complete");
    expect(result.coverage.passes).toBe(1);
    expect(result.questions.map((q) => q.id)).toContain("q-new");
    expect(generateForGaps).toHaveBeenCalledTimes(1);
  });

  it("stops at max_passes_reached when every pass makes some progress but never finishes in time", async () => {
    // Two must gaps, but each pass only closes one — after 3 passes (default max), one gap survives.
    const requirements = [
      makeRequirement({ id: "r1", priority: "must" }),
      makeRequirement({ id: "r2", priority: "must" }),
      makeRequirement({ id: "r3", priority: "must" }),
      makeRequirement({ id: "r4", priority: "must" }),
    ];
    let call = 0;
    const generateForGaps = jest.fn(async (gapIds: string[]) => {
      call += 1;
      // Cover only the first remaining gap each pass — guaranteed progress, never full closure within 3 passes.
      return [makeQuestion({ id: `q-pass${call}`, requirement_ids: [gapIds[0]] })];
    });

    const result = await runCoverageLoop(requirements, [], generateForGaps, 3);

    expect(generateForGaps).toHaveBeenCalledTimes(3);
    expect(result.coverage.passes).toBe(3);
    expect(result.coverage.status).toBe("incomplete");
    expect(result.coverage.reason).toBe("max_passes_reached");
    expect(result.coverage.uncovered_requirement_ids).toEqual(["r4"]);
  });

  it("detects a stall and stops early — before exhausting maxPasses — when a pass fails to shrink the gap at all", async () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    // Callback returns a question that does NOT cover the gap (wrong requirement_ids) — simulates
    // a model that couldn't help; the loop should give up after this single failed pass rather than
    // retrying up to maxPasses.
    const generateForGaps = jest.fn(async () => [makeQuestion({ id: "q-useless", requirement_ids: ["r-unrelated"] })]);

    const result = await runCoverageLoop(requirements, [], generateForGaps, 3);

    expect(generateForGaps).toHaveBeenCalledTimes(1);
    expect(result.coverage.passes).toBe(1);
    expect(result.coverage.status).toBe("incomplete");
    expect(result.coverage.reason).toBe("stalled");
    // The unhelpful question is still merged in even though it didn't close the gap.
    expect(result.questions.map((q) => q.id)).toContain("q-useless");
  });

  it("terminates instead of looping forever when generateForGaps never covers anything and maxPasses is large", async () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const generateForGaps = jest.fn(async () => []); // never returns anything useful

    const result = await runCoverageLoop(requirements, [], generateForGaps, 50);

    // Stall detection fires on pass 1 regardless of how high maxPasses is set.
    expect(generateForGaps).toHaveBeenCalledTimes(1);
    expect(result.coverage.reason).toBe("stalled");
  });

  it("respects a custom maxPasses of 0 — reports incomplete without ever calling generateForGaps", async () => {
    const requirements = [makeRequirement({ id: "r1", priority: "must" })];
    const generateForGaps = jest.fn();

    const result = await runCoverageLoop(requirements, [], generateForGaps, 0);

    expect(generateForGaps).not.toHaveBeenCalled();
    expect(result.coverage.status).toBe("incomplete");
    expect(result.coverage.reason).toBe("max_passes_reached");
    expect(result.coverage.passes).toBe(0);
  });
});
