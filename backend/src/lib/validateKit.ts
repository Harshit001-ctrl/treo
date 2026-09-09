import { Kit, KitSchema } from "@prepkit/shared";
import { HttpError } from "./httpError";
import { ErrorCode } from "@prepkit/shared";

export interface KitValidationResult {
  success: boolean;
  kit?: Kit;
  message?: string;
}

export function validateKit(candidate: unknown): KitValidationResult {
  const parsed = KitSchema.safeParse(candidate);
  if (parsed.success) return { success: true, kit: parsed.data };
  const message = parsed.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { success: false, message };
}

/** Section 13: "validate a generated kit against the expected structure
 * before saving it." Every write path that persists `kit.kit` calls this
 * first rather than trusting the pipeline's output blindly. */
export function assertValidKit(candidate: unknown): Kit {
  const result = validateKit(candidate);
  if (!result.success) {
    throw new HttpError(422, ErrorCode.KIT_VALIDATION_FAILED, result.message ?? "Invalid kit structure.");
  }
  return result.kit!;
}
