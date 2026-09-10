import { z } from "zod";
import { Requirement, RequirementKind, RequirementPriority, nextIds } from "@prepkit/shared";
import { generateStructured, SchemaType } from "../llm/client";
import { truncate, wrapUntrusted } from "../llm/prompts/untrusted";

const RequirementDraftSchema = z.object({
  text: z.string().min(1),
  kind: RequirementKind,
  priority: RequirementPriority,
});

const ExtractionResultSchema = z.object({
  requirements: z.array(RequirementDraftSchema),
  // Same JD text, same LLM round-trip — seniority and responsibilities are
  // both derived from the posting exactly like requirements are, so they
  // ride along on this one call rather than costing a second request.
  seniority: z.string().min(1),
  responsibilities: z.array(z.string()),
});

export interface ExtractionResult {
  requirements: Requirement[];
  seniority: string;
  responsibilities: string[];
}

const GEMINI_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    requirements: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          text: { type: SchemaType.STRING, description: "The requirement, in the JD's own terms." },
          kind: { type: SchemaType.STRING, enum: ["technical", "behavioural", "domain"] },
          priority: { type: SchemaType.STRING, enum: ["must", "nice"] },
        },
        required: ["text", "kind", "priority"],
      },
    },
    seniority: {
      type: SchemaType.STRING,
      description:
        "A short seniority label inferred from the JD (e.g. 'Senior', 'Mid-level', 'Staff', 'Junior'). Use 'Not specified' if the text gives no real signal — never guess.",
    },
    responsibilities: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Short day-to-day duties/responsibilities the JD actually lists, distinct from qualifications/skills.",
    },
  },
  required: ["requirements", "seniority", "responsibilities"],
};

const SYSTEM_INSTRUCTION = `You extract job requirements from a job description for an interview-prep tool.
Rules:
- Only extract requirements that are explicitly stated or unambiguously implied by the text. Never invent a requirement the posting does not support.
- If the posting is thin (very short, vague, or missing most detail), return however few requirements it actually supports — including zero. A thin, honest list is correct; a padded, invented one is a failure.
- priority "must" is for language like "required", "must have", "X+ years of", non-negotiable qualifications. priority "nice" is for language like "bonus", "nice to have", "preferred", "a plus". Do not default everything to "must" — read the actual wording.
- kind "technical" for hard/tool/language/system skills, "behavioural" for soft skills, collaboration, leadership, communication, "domain" for industry/business-domain knowledge.
- Deduplicate near-identical requirements into one entry.
- seniority: infer a short label (e.g. "Senior", "Mid-level", "Staff", "Junior", "Lead") from the title, years-of-experience language, or explicit seniority words in the JD. If the JD genuinely gives no such signal, return exactly "Not specified" — inventing a seniority level the text doesn't support is worse than honestly reporting there was little to go on.
- responsibilities: list the actual day-to-day duties/responsibilities the JD describes (what the person will DO), as short strings, kept distinct from requirements (qualifications/skills the person must already HAVE). If the JD has no distinguishable responsibilities section, return an empty array rather than fabricating one.`;

/**
 * Extracts requirements, seniority, and responsibilities from a job
 * description in a single LLM call — all three are derived from the same JD
 * text in the same conceptual step, so splitting them into separate
 * round-trips would just double rate-limiter load for no benefit. IDs are
 * assigned here, in code, never trusted from the model — matches the shared
 * package's `nextIds` convention used everywhere else a stable id is created.
 */
export async function extractRequirements(jdText: string): Promise<ExtractionResult> {
  const prompt = [
    "Extract the requirements, seniority, and responsibilities from this job description.",
    wrapUntrusted("JOB DESCRIPTION", truncate(jdText, 12000)),
  ].join("\n\n");

  const result = await generateStructured({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    geminiSchema: GEMINI_SCHEMA,
    zodSchema: ExtractionResultSchema,
  });

  const ids = nextIds([], "r", result.requirements.length);
  return {
    requirements: result.requirements.map((draft, i) => ({ id: ids[i], ...draft })),
    seniority: result.seniority,
    responsibilities: result.responsibilities,
  };
}
