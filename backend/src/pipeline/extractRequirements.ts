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
});

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
  },
  required: ["requirements"],
};

const SYSTEM_INSTRUCTION = `You extract job requirements from a job description for an interview-prep tool.
Rules:
- Only extract requirements that are explicitly stated or unambiguously implied by the text. Never invent a requirement the posting does not support.
- If the posting is thin (very short, vague, or missing most detail), return however few requirements it actually supports — including zero. A thin, honest list is correct; a padded, invented one is a failure.
- priority "must" is for language like "required", "must have", "X+ years of", non-negotiable qualifications. priority "nice" is for language like "bonus", "nice to have", "preferred", "a plus". Do not default everything to "must" — read the actual wording.
- kind "technical" for hard/tool/language/system skills, "behavioural" for soft skills, collaboration, leadership, communication, "domain" for industry/business-domain knowledge.
- Deduplicate near-identical requirements into one entry.`;

/**
 * Extracts requirements from a job description. IDs are assigned here, in
 * code, never trusted from the model — matches the shared package's
 * `nextIds` convention used everywhere else a stable id is created.
 */
export async function extractRequirements(jdText: string): Promise<Requirement[]> {
  const prompt = [
    "Extract the requirements from this job description.",
    wrapUntrusted("JOB DESCRIPTION", truncate(jdText, 12000)),
  ].join("\n\n");

  const result = await generateStructured({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    geminiSchema: GEMINI_SCHEMA,
    zodSchema: ExtractionResultSchema,
  });

  const ids = nextIds([], "r", result.requirements.length);
  return result.requirements.map((draft, i) => ({ id: ids[i], ...draft }));
}
