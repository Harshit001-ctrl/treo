import { createHash } from "node:crypto";

/** Section 10: "the same description and company are submitted twice."
 * Normalizes whitespace/case before hashing so trivial re-pasting differences
 * (trailing spaces, case) still count as the same submission. */
export function dedupeHash(jd: string, companyUrl: string): string {
  const normalizedJd = jd.trim().replace(/\s+/g, " ").toLowerCase();
  const normalizedUrl = companyUrl.trim().toLowerCase().replace(/\/+$/, "");
  return createHash("sha256").update(`${normalizedJd}::${normalizedUrl}`).digest("hex");
}
