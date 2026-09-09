import { GoogleGenerativeAI, SchemaType, Schema as GeminiSchema } from "@google/generative-ai";
import { ZodSchema } from "zod";
import { env } from "../config/env";
import { enqueueLlmCall } from "./rateLimiter";

export { SchemaType };
export type { GeminiSchema };

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (!env.geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env and add a free-tier key from https://aistudio.google.com/apikey"
    );
  }
  if (!client) client = new GoogleGenerativeAI(env.geminiApiKey);
  return client;
}

export class LlmOutputError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
  }
}

interface GenerateStructuredOptions<T> {
  /** Short instruction fixing the model's role/tone for this call. */
  systemInstruction: string;
  /** The user-turn content, including any untrusted fetched/pasted text —
   * callers are responsible for wrapping untrusted spans (see
   * llm/prompts/untrusted.ts) before it reaches here. */
  prompt: string;
  /** Gemini's own JSON-schema dialect, used for responseSchema / strict JSON mode. */
  geminiSchema: GeminiSchema;
  /** Re-validated independently of Gemini's own schema enforcement — a model
   * can still return a structurally-valid-but-wrong-shaped JSON document. */
  zodSchema: ZodSchema<T>;
}

/**
 * Calls Gemini with JSON-mode structured output, validates the result against
 * `zodSchema`, and makes exactly one repair attempt (re-prompting the model
 * with its own broken output and the validation error) before giving up with
 * an LlmOutputError. This is the direct answer to the brief's "the model
 * returns invalid JSON or an incomplete kit" edge case.
 */
export async function generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<T> {
  const model = getClient().getGenerativeModel({
    model: env.geminiModel,
    systemInstruction: opts.systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: opts.geminiSchema,
      temperature: 0.4,
    },
  });

  const call = (promptText: string) =>
    enqueueLlmCall(async () => {
      const result = await model.generateContent(promptText);
      return result.response.text();
    });

  const raw = await call(opts.prompt);
  const parsed = tryParseJson(raw);
  if (parsed !== undefined) {
    const validated = opts.zodSchema.safeParse(parsed);
    if (validated.success) return validated.data;

    const repaired = await repair(call, opts.prompt, raw, validated.error.message);
    const reparsed = tryParseJson(repaired);
    const revalidated = reparsed !== undefined ? opts.zodSchema.safeParse(reparsed) : undefined;
    if (revalidated?.success) return revalidated.data;
    throw new LlmOutputError("Model output failed schema validation twice.", repaired ?? raw);
  }

  const repaired = await repair(call, opts.prompt, raw, "Response was not valid JSON.");
  const reparsed = tryParseJson(repaired);
  const revalidated = reparsed !== undefined ? opts.zodSchema.safeParse(reparsed) : undefined;
  if (revalidated?.success) return revalidated.data;
  throw new LlmOutputError("Model did not return valid JSON, even after a repair attempt.", repaired ?? raw);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function repair(
  call: (prompt: string) => Promise<string>,
  originalPrompt: string,
  brokenOutput: string,
  errorMessage: string
): Promise<string> {
  const repairPrompt = [
    "Your previous response did not match the required JSON schema.",
    `Validation error: ${errorMessage}`,
    "Your previous response was:",
    brokenOutput,
    "Return ONLY corrected JSON matching the schema. Do not include any explanation.",
    "Original request for context:",
    originalPrompt,
  ].join("\n\n");
  return call(repairPrompt);
}
