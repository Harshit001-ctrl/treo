import { ErrorCode, BatchError } from "@prepkit/shared";
import { HttpError } from "./httpError";
import { LlmOutputError } from "../llm/client";

/**
 * Turns any thrown error from a pipeline run into the {code, message} shape
 * Appendix B expects, and that the live API's kit.error field also uses — one
 * vocabulary for both, per the shared ErrorCode map. A case that fails this
 * way is recorded as `failed` and the run continues, per Section 9.
 */
export function toStructuredError(err: unknown): BatchError {
  if (err instanceof HttpError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof LlmOutputError) {
    return { code: ErrorCode.LLM_INVALID_OUTPUT, message: err.message };
  }
  if (err instanceof Error) {
    return { code: ErrorCode.UNKNOWN, message: err.message };
  }
  return { code: ErrorCode.UNKNOWN, message: String(err) };
}
