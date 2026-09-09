import { Coverage, Question, Requirement } from "@prepkit/shared";

export interface GapCheck {
  mustUncovered: string[];
  niceUncovered: string[];
}

/** Pure — no LLM, no I/O. A requirement is "covered" if at least one question
 * lists its id in requirement_ids. */
export function computeCoverage(requirements: Requirement[], questions: Question[]): GapCheck {
  const covered = new Set<string>();
  for (const q of questions) {
    for (const rid of q.requirement_ids) covered.add(rid);
  }
  const mustUncovered = requirements.filter((r) => r.priority === "must" && !covered.has(r.id)).map((r) => r.id);
  const niceUncovered = requirements.filter((r) => r.priority === "nice" && !covered.has(r.id)).map((r) => r.id);
  return { mustUncovered, niceUncovered };
}

function toCoverageField(requirements: Requirement[], check: GapCheck, passes: number, status: Coverage["status"], reason: Coverage["reason"]): Coverage {
  const mustTotal = requirements.filter((r) => r.priority === "must").length;
  const niceTotal = requirements.filter((r) => r.priority === "nice").length;
  return {
    uncovered_requirement_ids: check.mustUncovered,
    passes,
    status,
    reason,
    must: { total: mustTotal, covered: mustTotal - check.mustUncovered.length, uncovered_ids: check.mustUncovered },
    nice: { total: niceTotal, covered: niceTotal - check.niceUncovered.length, uncovered_ids: check.niceUncovered },
  };
}

const MAX_PASSES = 3;

/**
 * Section 4's "second pass": after the first draft, find requirements with no
 * question against them and generate targeted questions for exactly those
 * gaps, then check again. `generateForGaps` is injected so this stays a pure,
 * network-free function to unit test — the real implementation (one batched
 * LLM call per pass, never one call per requirement) lives in
 * pipeline/generateQuestions.ts.
 *
 * Stops early — before exhausting MAX_PASSES — the moment a pass fails to
 * shrink the must-gap count at all, on the theory that a model that couldn't
 * help this pass won't magically help the next one; this avoids burning the
 * free-tier rate/token budget chasing a requirement it just can't satisfy.
 * A kit that still has gaps after stopping is reported honestly via
 * `coverage.status`, never silently patched over — Section 10: "inventing
 * requirements a description does not contain is worse than reporting that
 * there were few."
 */
export async function runCoverageLoop(
  requirements: Requirement[],
  initialQuestions: Question[],
  generateForGaps: (gapRequirementIds: string[]) => Promise<Question[]>,
  maxPasses: number = MAX_PASSES
): Promise<{ questions: Question[]; coverage: Coverage }> {
  let questions = initialQuestions;
  let passes = 0;

  for (;;) {
    const check = computeCoverage(requirements, questions);
    if (check.mustUncovered.length === 0) {
      return { questions, coverage: toCoverageField(requirements, check, passes, "complete", null) };
    }
    if (passes >= maxPasses) {
      return { questions, coverage: toCoverageField(requirements, check, passes, "incomplete", "max_passes_reached") };
    }

    const newQuestions = await generateForGaps(check.mustUncovered);
    passes += 1;
    const merged = questions.concat(newQuestions);
    const newCheck = computeCoverage(requirements, merged);

    if (newCheck.mustUncovered.length === check.mustUncovered.length) {
      return { questions: merged, coverage: toCoverageField(requirements, newCheck, passes, "incomplete", "stalled") };
    }
    questions = merged;
  }
}
