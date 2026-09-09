import { z } from "zod";
import { CompanyBrief, Question, QuestionCategory as QuestionCategorySchema, Requirement, nextIds } from "@prepkit/shared";
import { generateStructured, SchemaType } from "../llm/client";
import { truncate, wrapUntrusted } from "../llm/prompts/untrusted";
import { CrawledPage } from "./crawler";
import { DiscussionSnippet } from "./discussionSearch";

export type QuestionCategoryValue = z.infer<typeof QuestionCategorySchema>;

const QuestionDraftSchema = z.object({
  requirement_ids: z.array(z.string()),
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});

const QUESTION_DRAFT_GEMINI_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    requirement_ids: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Which requirement ids (from the list given) this question tests. Empty array if general.",
    },
    prompt: { type: SchemaType.STRING },
    answer_outline: { type: SchemaType.STRING, description: "A short model-answer outline, 2-5 bullet points worth of guidance as prose." },
    difficulty: { type: SchemaType.INTEGER, description: "1 = warm-up, 2 = solid mid-level, 3 = senior/deep." },
  },
  required: ["requirement_ids", "prompt", "answer_outline", "difficulty"],
};

function questionsArraySchema(withCategory: boolean) {
  const itemProps = withCategory
    ? { ...QUESTION_DRAFT_GEMINI_SCHEMA.properties, category: { type: SchemaType.STRING, enum: ["technical", "behavioural", "system-design", "company-fit"] } }
    : QUESTION_DRAFT_GEMINI_SCHEMA.properties;
  const required = withCategory ? [...QUESTION_DRAFT_GEMINI_SCHEMA.required, "category"] : QUESTION_DRAFT_GEMINI_SCHEMA.required;
  return {
    type: SchemaType.OBJECT,
    properties: {
      questions: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.OBJECT, properties: itemProps, required },
      },
    },
    required: ["questions"],
  };
}

const QuestionsResultSchema = z.object({ questions: z.array(QuestionDraftSchema) });
const CategorizedQuestionsResultSchema = z.object({
  questions: z.array(QuestionDraftSchema.extend({ category: QuestionCategorySchema })),
});

interface CategoryConfig {
  category: QuestionCategoryValue;
  relevantKinds: Requirement["kind"][] | null; // null = not requirement-driven
  instruction: string;
}

const CATEGORY_CONFIG: CategoryConfig[] = [
  {
    category: "technical",
    relevantKinds: ["technical", "domain"],
    instruction:
      "Generate technical interview questions that make the candidate apply the skill (not just define it) for the requirements listed below. Prefer scenario/code/design-decision framing over trivia.",
  },
  {
    category: "behavioural",
    relevantKinds: ["behavioural"],
    instruction:
      "Generate behavioural interview questions (STAR-style: situation, task, action, result) for the requirements listed below. Each should probe a real past experience, not a hypothetical.",
  },
  {
    category: "system-design",
    relevantKinds: ["technical", "domain"],
    instruction:
      "Generate system-design interview questions appropriate to this role's seniority and domain. Ground them in the company's actual product/domain where the company brief supports it. If the hiring-process research below mentions a system-design round, match that round's apparent scope.",
  },
  {
    category: "company-fit",
    relevantKinds: null,
    instruction:
      "Generate company-fit / culture questions based on the company brief and (if present) the hiring-process research below — what this company actually values, not generic 'why do you want to work here' filler. requirement_ids may be empty for these.",
  },
];

const BASE_SYSTEM_INSTRUCTION = `You write interview questions for a candidate's prep kit.
Rules:
- Only reference requirement ids that are given to you. Never invent a requirement id.
- Do not pad with filler questions to hit a count — if the material only supports fewer good questions, return fewer.
- difficulty is an integer 1-3 (1=warm-up, 2=solid mid-level, 3=senior/deep), never a float or string.
- Ground questions in the specific requirement text and company context given, not generic interview-question-bank material.`;

function targetCount(relevantCount: number): number {
  return Math.max(2, Math.min(6, relevantCount + 1));
}

function buildHiringSignalsBlock(pages: CrawledPage[], discussion: DiscussionSnippet[]): string {
  const pageText = pages
    .slice(0, 4)
    .map((p) => `${p.title}: ${truncate(p.text, 1500)}`)
    .join("\n---\n");
  const discussionText = discussion.map((d) => `${d.title}: ${d.snippet}`).join("\n---\n");
  const combined = [pageText, discussionText].filter(Boolean).join("\n---\n");
  return combined || "(No hiring-process research was found for this company.)";
}

function sanitizeRequirementIds(ids: string[], knownIds: Set<string>): string[] {
  return Array.from(new Set(ids.filter((id) => knownIds.has(id))));
}

interface GenerateAllInput {
  requirements: Requirement[];
  companyBrief: CompanyBrief;
  companyName: string;
  pages: CrawledPage[];
  discussion: DiscussionSnippet[];
}

/**
 * Runs one LLM call per category, each with different instructions and a
 * different slice of context — per Section 3's "a requirement like five
 * years of React leads to technical questions while mentoring junior
 * engineers leads to behavioural ones; the two should not come from the same
 * call with the same instructions."
 */
export async function generateAllCategories(input: GenerateAllInput): Promise<Question[]> {
  const knownIds = new Set(input.requirements.map((r) => r.id));
  const hiringSignals = buildHiringSignalsBlock(input.pages, input.discussion);
  const questions: Question[] = [];

  for (const config of CATEGORY_CONFIG) {
    const relevant = config.relevantKinds
      ? input.requirements.filter((r) => config.relevantKinds!.includes(r.kind))
      : input.requirements.filter((r) => r.kind === "behavioural");

    if (config.relevantKinds && relevant.length === 0) continue; // nothing to ask about in this category

    const prompt = [
      config.instruction,
      `Target roughly ${targetCount(relevant.length)} questions.`,
      "Requirements available to reference:",
      JSON.stringify(relevant.map((r) => ({ id: r.id, text: r.text, priority: r.priority })), null, 2),
      `Company: ${input.companyName}`,
      `What they do: ${input.companyBrief.what_they_do || "(unknown)"}`,
      wrapUntrusted("HIRING PROCESS RESEARCH", truncate(hiringSignals, 4000)),
    ].join("\n\n");

    const result = await generateStructured({
      systemInstruction: BASE_SYSTEM_INSTRUCTION,
      prompt,
      geminiSchema: questionsArraySchema(false),
      zodSchema: QuestionsResultSchema,
    });

    const ids = nextIds([...knownIds, ...questions.map((q) => q.id)], "q", result.questions.length);
    result.questions.forEach((draft, i) => {
      questions.push({
        id: ids[i],
        requirement_ids: sanitizeRequirementIds(draft.requirement_ids, knownIds),
        category: config.category,
        prompt: draft.prompt,
        answer_outline: draft.answer_outline,
        difficulty: draft.difficulty,
        origin: "ai",
        edited: false,
      });
    });
  }

  return questions;
}

/**
 * Regenerates ONLY the untouched-by-a-human slots of one category. The
 * caller (server/regenerate.ts) has already split that category's current
 * questions into `locked` (user-authored or user-edited — survives, per
 * Section 6) and the rest, which get discarded and replaced by this call.
 * `locked` is passed back in as negative context so the model doesn't
 * generate near-duplicates of what's being kept.
 */
export async function regenerateCategoryQuestions(
  category: QuestionCategoryValue,
  requirements: Requirement[],
  companyBrief: CompanyBrief,
  companyName: string,
  lockedQuestions: Question[],
  existingQuestionIds: string[]
): Promise<Question[]> {
  const config = CATEGORY_CONFIG.find((c) => c.category === category);
  if (!config) throw new Error(`Unknown question category: ${category}`);

  const knownIds = new Set(requirements.map((r) => r.id));
  const relevant = config.relevantKinds
    ? requirements.filter((r) => config.relevantKinds!.includes(r.kind))
    : requirements.filter((r) => r.kind === "behavioural");

  const lockedBlock = lockedQuestions.length
    ? `These questions already exist in this category and must be kept as-is — do NOT generate duplicates or close variants of them:\n${lockedQuestions.map((q) => `- ${q.prompt}`).join("\n")}`
    : "There are no existing questions to avoid duplicating.";

  const prompt = [
    config.instruction,
    `Generate roughly ${targetCount(relevant.length)} NEW questions for this category.`,
    lockedBlock,
    "Requirements available to reference:",
    JSON.stringify(relevant.map((r) => ({ id: r.id, text: r.text, priority: r.priority })), null, 2),
    `Company: ${companyName}`,
    `What they do: ${companyBrief.what_they_do || "(unknown)"}`,
  ].join("\n\n");

  const result = await generateStructured({
    systemInstruction: BASE_SYSTEM_INSTRUCTION,
    prompt,
    geminiSchema: questionsArraySchema(false),
    zodSchema: QuestionsResultSchema,
  });

  const ids = nextIds([...knownIds, ...existingQuestionIds], "q", result.questions.length);
  return result.questions.map((draft, i) => ({
    id: ids[i],
    requirement_ids: sanitizeRequirementIds(draft.requirement_ids, knownIds),
    category,
    prompt: draft.prompt,
    answer_outline: draft.answer_outline,
    difficulty: draft.difficulty,
    origin: "ai" as const,
    edited: false,
  }));
}

/**
 * The coverage loop's gap-fill step (Section 4): one batched call covering
 * every currently-uncovered must-have requirement at once, rather than one
 * call per requirement — the direct answer to the free-tier rate-limit
 * warning in the brief's Preferred Tech Stack section. The model chooses the
 * category per question here (unlike the per-category calls above), since a
 * gap requirement could reasonably be closed by a technical or a behavioural
 * question depending on its wording.
 */
export async function generateGapFillQuestions(
  requirements: Requirement[],
  gapRequirementIds: string[],
  existingQuestionIds: string[]
): Promise<Question[]> {
  const knownIds = new Set(requirements.map((r) => r.id));
  const gapRequirements = requirements.filter((r) => gapRequirementIds.includes(r.id));
  if (gapRequirements.length === 0) return [];

  const prompt = [
    "The following must-have requirements have no interview question covering them yet. Generate exactly one targeted question per requirement (or more if a requirement genuinely needs more than one to assess properly).",
    JSON.stringify(gapRequirements.map((r) => ({ id: r.id, text: r.text, kind: r.kind })), null, 2),
  ].join("\n\n");

  const result = await generateStructured({
    systemInstruction: BASE_SYSTEM_INSTRUCTION,
    prompt,
    geminiSchema: questionsArraySchema(true),
    zodSchema: CategorizedQuestionsResultSchema,
  });

  const ids = nextIds([...knownIds, ...existingQuestionIds], "q", result.questions.length);
  return result.questions.map((draft, i) => ({
    id: ids[i],
    requirement_ids: sanitizeRequirementIds(draft.requirement_ids, knownIds),
    category: draft.category,
    prompt: draft.prompt,
    answer_outline: draft.answer_outline,
    difficulty: draft.difficulty,
    origin: "ai" as const,
    edited: false,
  }));
}
