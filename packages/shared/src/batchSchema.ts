/** Batch input/output shapes, per Appendix B of the assessment brief. */
import { z } from "zod";
import { KitSchema } from "./kitSchema";

export const BatchCaseSchema = z.object({
  id: z.string().min(1),
  jd: z.string(),
  company_url: z.string(),
  days: z.number().int().min(1),
});
export type BatchCase = z.infer<typeof BatchCaseSchema>;

export const BatchInputSchema = z.array(BatchCaseSchema);

export const BatchErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type BatchError = z.infer<typeof BatchErrorSchema>;

export const BatchResultEntrySchema = z.object({
  id: z.string(),
  status: z.enum(["ok", "failed"]),
  kit: KitSchema.nullable(),
  error: BatchErrorSchema.nullable(),
});
export type BatchResultEntry = z.infer<typeof BatchResultEntrySchema>;

export const BatchOutputSchema = z.object({
  version: z.literal("1.0"),
  generated_at: z.string(),
  kits: z.array(BatchResultEntrySchema),
});
export type BatchOutput = z.infer<typeof BatchOutputSchema>;

/** Structured error codes used throughout the pipeline, so a batch failure and
 * an API failure report the same vocabulary. Keep this list the single source
 * of truth rather than inventing ad-hoc strings at each call site. */
export const ErrorCode = {
  COMPANY_UNREACHABLE: "COMPANY_UNREACHABLE",
  COMPANY_URL_INVALID: "COMPANY_URL_INVALID",
  COMPANY_URL_BLOCKED: "COMPANY_URL_BLOCKED",
  JD_TOO_SHORT: "JD_TOO_SHORT",
  LLM_RATE_LIMITED: "LLM_RATE_LIMITED",
  LLM_INVALID_OUTPUT: "LLM_INVALID_OUTPUT",
  KIT_VALIDATION_FAILED: "KIT_VALIDATION_FAILED",
  UNKNOWN: "UNKNOWN",
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
