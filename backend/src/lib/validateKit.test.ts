import { assertValidKit, validateKit } from "./validateKit";
import { HttpError } from "./httpError";
import { ErrorCode } from "@prepkit/shared";

/**
 * NOTE on scope: validateKit.ts is a thin zod wrapper (KitSchema.safeParse). It only checks
 * structural shape/types/enums — it does NOT cross-check that schedule.days[].question_ids
 * (or a question's requirement_ids) actually reference ids present elsewhere in the kit. That
 * referential integrity isn't enforced anywhere in the codebase today (grep confirms no
 * cross-reference check in coverage.ts, runPipeline, or elsewhere) — a kit with a dangling
 * question_ids reference passes validateKit. Tests below cover that explicitly so this gap is
 * documented rather than silently assumed.
 */

function makeKit(overrides: any = {}) {
  const base = {
    source: {
      company: "Acme Corp",
      company_url: "https://acme.example.com",
      role: "Backend Engineer",
      location: "Remote",
      jd_chars: 1200,
      researched_at: "2026-01-01T00:00:00.000Z",
      pages_used: ["https://acme.example.com/careers"],
    },
    company_brief: {
      summary: "Acme builds widgets.",
      what_they_do: "B2B widget SaaS.",
      sources: ["https://acme.example.com/about"],
    },
    role: {
      title: "Backend Engineer",
      seniority: "Mid",
      responsibilities: ["Build APIs", "Own the database schema"],
      requirements: [
        { id: "r1", text: "Strong Node.js experience.", kind: "technical", priority: "must" },
        { id: "r2", text: "Has led a small team.", kind: "behavioural", priority: "nice" },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Explain event loop internals.",
        answer_outline: "Phases, microtasks vs macrotasks.",
        difficulty: 2,
        origin: "ai",
        edited: false,
      },
    ],
    flashcards: [
      { id: "f1", front: "What is a closure?", back: "A function bundled with its lexical scope.", requirement_ids: ["r1"], origin: "ai", edited: false },
    ],
    schedule: {
      days_available: 1,
      days: [{ day: 1, focus: "Technical fundamentals", question_ids: ["q1"], minutes: 15 }],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 0,
      status: "complete",
      reason: null,
      must: { total: 1, covered: 1, uncovered_ids: [] },
      nice: { total: 1, covered: 1, uncovered_ids: [] },
    },
  };
  return { ...base, ...overrides };
}

describe("validateKit", () => {
  it("accepts a well-formed kit matching Appendix A", () => {
    const result = validateKit(makeKit());
    expect(result.success).toBe(true);
    expect(result.kit).toBeDefined();
    expect(result.message).toBeUndefined();
  });

  it("rejects a kit missing a required field", () => {
    const kit: any = makeKit();
    delete kit.role.title;
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.message).toContain("role.title");
  });

  it("rejects a kit with a misnamed field instead of the expected one", () => {
    const kit: any = makeKit();
    kit.role.jobTitle = kit.role.title;
    delete kit.role.title;
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.message).toContain("role.title");
  });

  it("rejects a float where minutes must be an integer", () => {
    const kit: any = makeKit();
    kit.schedule.days[0].minutes = 15.5;
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.message).toContain("minutes");
  });

  it("rejects a float where question difficulty must be an integer", () => {
    const kit: any = makeKit();
    kit.questions[0].difficulty = 2.5;
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.message).toContain("difficulty");
  });

  it("rejects an invalid requirement priority enum value", () => {
    const kit: any = makeKit();
    kit.role.requirements[0].priority = "required";
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/priority/);
  });

  it("rejects an invalid question category enum value", () => {
    const kit: any = makeKit();
    kit.questions[0].category = "trivia";
    const result = validateKit(kit);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/category/);
  });

  it("rejects a completely non-object candidate", () => {
    const result = validateKit("not a kit");
    expect(result.success).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(validateKit(null).success).toBe(false);
    expect(validateKit(undefined).success).toBe(false);
  });

  it("does NOT reject a schedule.days[].question_ids entry referencing a question id absent from questions[] — \
zod has no cross-reference rule for this, so it passes structurally", () => {
    const kit: any = makeKit();
    kit.schedule.days[0].question_ids = ["q-does-not-exist"];
    const result = validateKit(kit);
    expect(result.success).toBe(true);
  });

  it("does NOT reject a question requirement_ids entry referencing a requirement id absent from role.requirements", () => {
    const kit: any = makeKit();
    kit.questions[0].requirement_ids = ["r-does-not-exist"];
    const result = validateKit(kit);
    expect(result.success).toBe(true);
  });

  it("applies extension field defaults (origin/edited) when omitted", () => {
    const kit: any = makeKit();
    delete kit.questions[0].origin;
    delete kit.questions[0].edited;
    const result = validateKit(kit);
    expect(result.success).toBe(true);
    expect(result.kit!.questions[0].origin).toBe("ai");
    expect(result.kit!.questions[0].edited).toBe(false);
  });
});

describe("assertValidKit", () => {
  it("returns the parsed kit unchanged on success", () => {
    const kit = assertValidKit(makeKit());
    expect(kit.role.title).toBe("Backend Engineer");
  });

  it("throws an HttpError with 422 and KIT_VALIDATION_FAILED on failure", () => {
    const kit: any = makeKit();
    delete kit.source;
    let thrown: unknown;
    try {
      assertValidKit(kit);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect((thrown as HttpError).statusCode).toBe(422);
    expect((thrown as HttpError).code).toBe(ErrorCode.KIT_VALIDATION_FAILED);
    expect((thrown as HttpError).message.length).toBeGreaterThan(0);
  });
});
