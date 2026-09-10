import { z } from "zod";
import { CompanyBrief } from "@prepkit/shared";
import { generateStructured, SchemaType } from "../llm/client";
import { truncate, wrapUntrusted } from "../llm/prompts/untrusted";
import { CrawledPage } from "./crawler";

const BriefResultSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
});

const GEMINI_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING, description: "2-4 sentence overview for someone prepping for an interview." },
    what_they_do: { type: SchemaType.STRING, description: "1-3 sentences on the product/business." },
  },
  required: ["summary", "what_they_do"],
};

const SYSTEM_INSTRUCTION = `You write a short, factual company brief for a job candidate preparing for an interview.
Rules:
- Base the brief only on the provided page text. Never invent facts, funding details, headcount, or products not supported by the text.
- If the provided pages are thin or generic, write a short, honest brief that reflects that — do not pad it with speculation.
- Neutral, informative tone. No marketing language lifted verbatim from the site if it's vague ("we empower innovation") — translate it into something concrete, or say the pages didn't offer much substance.`;

export interface CompanyBriefInput {
  companyUrl: string;
  companyName: string;
  pages: CrawledPage[];
}

/**
 * If nothing was crawlable, this returns an honest, deterministic brief
 * without ever calling the model — Section 10: "a company you can find
 * nothing about should produce an honest brief rather than a fabricated
 * one." `sources` is always computed from the pages we actually fetched,
 * never trusted from the model's output, so it can't hallucinate a source URL.
 */
export async function generateCompanyBrief(input: CompanyBriefInput): Promise<CompanyBrief> {
  if (input.pages.length === 0) {
    return {
      summary: `We could not retrieve any information about ${input.companyName || input.companyUrl}. The company site may be unreachable, blocking automated access, or the URL may be incorrect.`,
      what_they_do: "",
      sources: [],
      origin: "ai",
      edited: false,
    };
  }

  const pageBlocks = input.pages
    .map((p, i) => wrapUntrusted(`PAGE ${i + 1}: ${p.url}`, truncate(`${p.title}\n${p.text}`, 4000)))
    .join("\n\n");

  const prompt = [
    `Company: ${input.companyName || input.companyUrl}`,
    "Write the brief from the following crawled pages.",
    pageBlocks,
  ].join("\n\n");

  const result = await generateStructured({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    geminiSchema: GEMINI_SCHEMA,
    zodSchema: BriefResultSchema,
  });

  return {
    summary: result.summary,
    what_they_do: result.what_they_do,
    sources: input.pages.map((p) => p.url),
    origin: "ai",
    edited: false,
  };
}
