import { CompanyBrief, Flashcard, Kit, Question, QuestionCategory as QuestionCategorySchema, nextIds } from "@prepkit/shared";
import { z } from "zod";
import { regenerateCategoryQuestions } from "../pipeline/generateQuestions";
import { generateCompanyBrief } from "../pipeline/companyBrief";
import { refetchKnownPages } from "../pipeline/crawler";
import { generateFlashcards } from "../pipeline/flashcards";
import { recomputeCoverageField } from "../lib/coverage";
import { buildSchedule } from "../lib/scheduler";
import { badRequest } from "../lib/httpError";

type QuestionCategoryValue = z.infer<typeof QuestionCategorySchema>;

/**
 * The lock rule behind every regeneration in this file: an item survives if
 * a human touched it — either because they wrote it (`origin: 'user'`) or
 * edited it (`edited: true`). See README for the full rationale; this is
 * deliberately the only rule, applied identically everywhere, rather than a
 * separate "pinned" concept layered on top.
 */
function isLocked(item: { origin: "ai" | "user"; edited: boolean }): boolean {
  return item.origin === "user" || item.edited;
}

/** Rebuilds the schedule from whatever questions currently exist — called
 * after every mutation that changes the question set, never patched
 * incrementally (see lib/scheduler.ts: recompute is cheap and keeps every
 * invariant trivially true). */
function rebuildSchedule(kit: Kit): Kit["schedule"] {
  return buildSchedule(kit.role.requirements, kit.questions, kit.schedule.days_available);
}

/**
 * Regenerates one question category: only the untouched-by-a-human questions
 * in that category are discarded and replaced; anything the user wrote or
 * edited survives, per Section 6. Coverage and the schedule are always
 * recomputed afterward since either can change as a result.
 */
export async function regenerateQuestionCategory(kit: Kit, category: QuestionCategoryValue): Promise<Kit> {
  const categoryQuestions = kit.questions.filter((q) => q.category === category);
  const otherQuestions = kit.questions.filter((q) => q.category !== category);
  const locked = categoryQuestions.filter(isLocked);

  const newQuestions = await regenerateCategoryQuestions(
    category,
    kit.role.requirements,
    kit.company_brief,
    kit.source.company,
    locked,
    kit.questions.map((q) => q.id)
  );

  const questions: Question[] = [...otherQuestions, ...locked, ...newQuestions];
  const coverage = recomputeCoverageField(kit.role.requirements, questions, kit.coverage.passes);
  const updated: Kit = { ...kit, questions, coverage };
  updated.schedule = rebuildSchedule(updated);
  return updated;
}

/**
 * The company brief is a single, indivisible section rather than a list of
 * lockable items, so "regenerate the brief" always replaces it outright —
 * the user explicitly asked for that section specifically, which is a
 * different situation from a category regen silently overwriting questions
 * the user never touched. Re-fetches the brief's own original sources
 * (no re-discovery crawl) so the new brief still reflects real page content.
 *
 * Note this deliberately discards any prior inline edit (`editCompanyBrief`)
 * — a user who explicitly asks to regenerate this section is asking for a
 * full replace of it, same as regenerating a question category with zero
 * locked items would also fully replace it. Do not "fix" this into a
 * lock-and-preserve scheme; that would be inconsistent with the doc comment
 * above and is not what full-replace regeneration means here.
 */
export async function regenerateCompanyBrief(kit: Kit): Promise<Kit> {
  const pages = await refetchKnownPages(kit.source.pages_used);
  const company_brief = await generateCompanyBrief({
    companyUrl: kit.source.company_url,
    companyName: kit.source.company,
    pages,
  });
  return { ...kit, company_brief };
}

/**
 * Inline edit to the brief (Section 6). Unlike questions/flashcards there's
 * always exactly one brief, so there's no id to look up and no not-found
 * case — just merge the provided fields and mark it user-touched, matching
 * `editFlashcard`/`editQuestion`.
 */
export function editCompanyBrief(kit: Kit, updates: Partial<Pick<CompanyBrief, "summary" | "what_they_do">>): Kit {
  const company_brief: CompanyBrief = { ...kit.company_brief, ...updates, edited: true };
  return { ...kit, company_brief };
}

/** Schedule regeneration is just re-running the deterministic allocator —
 * already idempotent given the same requirements/questions/days, so this is
 * mostly useful after the user manually reorders/edits things in a way that
 * should re-flow the day-by-day plan. */
export function regenerateSchedule(kit: Kit): Kit {
  return { ...kit, schedule: rebuildSchedule(kit) };
}

export function editQuestion(kit: Kit, questionId: string, updates: Partial<Pick<Question, "prompt" | "answer_outline" | "difficulty">>): Kit {
  const questions = kit.questions.map((q) => (q.id === questionId ? { ...q, ...updates, edited: true } : q));
  if (questions === kit.questions) throw badRequest("QUESTION_NOT_FOUND", "No question with that id.");
  return { ...kit, questions, coverage: recomputeCoverageField(kit.role.requirements, questions, kit.coverage.passes) };
}

export function moveQuestionCategory(kit: Kit, questionId: string, newCategory: QuestionCategoryValue): Kit {
  const found = kit.questions.find((q) => q.id === questionId);
  if (!found) throw badRequest("QUESTION_NOT_FOUND", "No question with that id.");
  // A category move is a content decision, not passive drift — it must also
  // survive a future regeneration of either the old or new category, so it
  // locks the item exactly like an inline edit does.
  const questions = kit.questions.map((q) => (q.id === questionId ? { ...q, category: newCategory, edited: true } : q));
  return { ...kit, questions };
}

export function reorderQuestions(kit: Kit, category: QuestionCategoryValue, orderedIds: string[]): Kit {
  const inCategory = kit.questions.filter((q) => q.category === category);
  if (orderedIds.length !== inCategory.length || !inCategory.every((q) => orderedIds.includes(q.id))) {
    throw badRequest("REORDER_MISMATCH", "The reordered id list doesn't match this category's current questions.");
  }
  const byId = new Map(inCategory.map((q) => [q.id, q]));
  const reordered = orderedIds.map((id) => byId.get(id)!);
  const others = kit.questions.filter((q) => q.category !== category);
  return { ...kit, questions: [...others, ...reordered] };
}

export function addQuestion(kit: Kit, draft: Pick<Question, "category" | "prompt" | "answer_outline" | "difficulty" | "requirement_ids">): Kit {
  const knownIds = new Set(kit.role.requirements.map((r) => r.id));
  const [id] = nextIds(kit.questions.map((q) => q.id), "q", 1);
  const question: Question = {
    id,
    category: draft.category,
    prompt: draft.prompt,
    answer_outline: draft.answer_outline,
    difficulty: draft.difficulty,
    requirement_ids: draft.requirement_ids.filter((rid) => knownIds.has(rid)),
    origin: "user",
    edited: false,
  };
  const questions = [...kit.questions, question];
  const updated: Kit = { ...kit, questions, coverage: recomputeCoverageField(kit.role.requirements, questions, kit.coverage.passes) };
  updated.schedule = rebuildSchedule(updated);
  return updated;
}

export function deleteQuestion(kit: Kit, questionId: string): Kit {
  const questions = kit.questions.filter((q) => q.id !== questionId);
  if (questions.length === kit.questions.length) throw badRequest("QUESTION_NOT_FOUND", "No question with that id.");
  const updated: Kit = { ...kit, questions, coverage: recomputeCoverageField(kit.role.requirements, questions, kit.coverage.passes) };
  updated.schedule = rebuildSchedule(updated);
  return updated;
}

export function editFlashcard(kit: Kit, flashcardId: string, updates: Partial<Pick<Flashcard, "front" | "back">>): Kit {
  const flashcards = kit.flashcards.map((f) => (f.id === flashcardId ? { ...f, ...updates, edited: true } : f));
  if (flashcards === kit.flashcards) throw badRequest("FLASHCARD_NOT_FOUND", "No flashcard with that id.");
  return { ...kit, flashcards };
}

export function addFlashcard(kit: Kit, draft: Pick<Flashcard, "front" | "back" | "requirement_ids">): Kit {
  const knownIds = new Set(kit.role.requirements.map((r) => r.id));
  const [id] = nextIds(kit.flashcards.map((f) => f.id), "f", 1);
  const flashcard: Flashcard = {
    id,
    front: draft.front,
    back: draft.back,
    requirement_ids: draft.requirement_ids.filter((rid) => knownIds.has(rid)),
    origin: "user",
    edited: false,
  };
  return { ...kit, flashcards: [...kit.flashcards, flashcard] };
}

export function deleteFlashcard(kit: Kit, flashcardId: string): Kit {
  const flashcards = kit.flashcards.filter((f) => f.id !== flashcardId);
  if (flashcards.length === kit.flashcards.length) throw badRequest("FLASHCARD_NOT_FOUND", "No flashcard with that id.");
  return { ...kit, flashcards };
}

export async function regenerateFlashcards(kit: Kit): Promise<Kit> {
  const locked = kit.flashcards.filter(isLocked);
  const generated = await generateFlashcards(
    kit.role.requirements,
    kit.company_brief,
    kit.source.company,
    locked.map((f) => f.id)
  );
  return { ...kit, flashcards: [...locked, ...generated] };
}
