import { z } from "zod";
import { CompanyBrief, Flashcard, Requirement, nextIds } from "@prepkit/shared";
import { generateStructured, SchemaType } from "../llm/client";

const FlashcardDraftSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()),
});
const FlashcardsResultSchema = z.object({ flashcards: z.array(FlashcardDraftSchema) });

const GEMINI_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    flashcards: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          front: { type: SchemaType.STRING, description: "A short prompt, term, or question." },
          back: { type: SchemaType.STRING, description: "A concise answer, a few sentences at most — for quick recall, not an essay." },
          requirement_ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["front", "back", "requirement_ids"],
      },
    },
  },
  required: ["flashcards"],
};

const SYSTEM_INSTRUCTION = `You write flashcards for quick-recall interview prep.
Rules:
- front is short: a term, a question, or a prompt — not a paragraph.
- back is concise: a few sentences, the kind of answer someone reviews in 10 seconds, not a full essay.
- Only reference requirement ids that are given to you.
- Cover the must-have requirements first; a few general/company-context cards are fine but should not dominate.`;

export async function generateFlashcards(
  requirements: Requirement[],
  companyBrief: CompanyBrief,
  companyName: string,
  existingIds: string[] = []
): Promise<Flashcard[]> {
  const mustCount = requirements.filter((r) => r.priority === "must").length;
  const targetCount = Math.min(12, Math.max(3, mustCount + 2));

  const prompt = [
    `Company: ${companyName}. What they do: ${companyBrief.what_they_do || "(unknown)"}`,
    `Target roughly ${targetCount} flashcards, prioritising must-have requirements.`,
    "Requirements available to reference:",
    JSON.stringify(requirements.map((r) => ({ id: r.id, text: r.text, priority: r.priority })), null, 2),
  ].join("\n\n");

  const result = await generateStructured({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    geminiSchema: GEMINI_SCHEMA,
    zodSchema: FlashcardsResultSchema,
  });

  const knownIds = new Set(requirements.map((r) => r.id));
  const ids = nextIds(existingIds, "f", result.flashcards.length);
  return result.flashcards.map((draft, i) => ({
    id: ids[i],
    front: draft.front,
    back: draft.back,
    requirement_ids: Array.from(new Set(draft.requirement_ids.filter((id) => knownIds.has(id)))),
    origin: "ai" as const,
    edited: false,
  }));
}
