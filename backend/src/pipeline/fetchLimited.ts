/**
 * The one place every outbound page fetch goes through. Section 11: "Restrict
 * handling to expected content types and sizes" — enforced here by streaming
 * the body and aborting the moment either limit is crossed, rather than
 * trusting a Content-Length header (which can lie or be absent).
 */

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain"];

export type FetchLimitedResult =
  | { ok: true; text: string; contentType: string; finalUrl: string }
  | { ok: false; reason: string };

export async function fetchLimited(url: string, headers?: Record<string, string>): Promise<FetchLimitedResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: headers ?? {
        "User-Agent": "PrepKitBot/1.0 (+https://github.com/; research crawler for an interview-prep tool)",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
      },
    });

    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
      return { ok: false, reason: `Unsupported content-type: ${contentType || "unknown"}` };
    }

    if (!res.body) return { ok: false, reason: "Empty response body" };

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        controller.abort();
        return { ok: false, reason: "Response exceeded size limit" };
      }
      chunks.push(value);
    }

    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return { ok: true, text, contentType, finalUrl: res.url || url };
  } catch (err) {
    const reason = controller.signal.aborted ? "Timed out or exceeded size limit" : String((err as Error)?.message ?? err);
    return { ok: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}
