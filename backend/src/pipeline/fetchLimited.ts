/**
 * The one place every outbound page fetch goes through. Section 11: "Restrict
 * handling to expected content types and sizes" — enforced here by streaming
 * the body and aborting the moment either limit is crossed, rather than
 * trusting a Content-Length header (which can lie or be absent).
 *
 * Section 2 also asks us to "rate-limit your requests and back off on
 * failure" for the site we're crawling, mirroring the spirit (short base
 * delay, doubling, jitter) of llm/rateLimiter.ts's backoff — scoped here to
 * outbound site fetches rather than the LLM path. A 429/5xx/timeout is
 * treated as transient and retried a couple of times; a plain 404 or other
 * 4xx is a real "this page doesn't exist" result and is returned immediately
 * so the caller can skip it and move on, per Section 2's "skip and report a
 * source that cannot be retrieved, rather than failing the whole run."
 */

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain"];
const MAX_RETRIES = 2; // up to 3 attempts total per URL
const BASE_DELAY_MS = 500;

export type FetchLimitedResult =
  | { ok: true; text: string; contentType: string; finalUrl: string }
  | { ok: false; reason: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 429 and 5xx are the target site telling us to slow down or having a
 * transient problem of its own; anything else 4xx (404, 403, ...) is a real
 * answer and must not be retried. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchOnce(url: string, headers?: Record<string, string>): Promise<FetchLimitedResult | { retryable: true; reason: string }> {
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

    if (!res.ok) {
      const reason = `HTTP ${res.status}`;
      if (isRetryableStatus(res.status)) return { retryable: true, reason };
      return { ok: false, reason };
    }

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
    // A timeout/abort and most network errors (DNS, reset, refused) are
    // transient from the target site's perspective just as much as a 429/5xx
    // is, so they get the same retry treatment.
    const reason = controller.signal.aborted ? "Timed out or exceeded size limit" : String((err as Error)?.message ?? err);
    return { retryable: true, reason };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLimited(url: string, headers?: Record<string, string>): Promise<FetchLimitedResult> {
  let lastReason = "Unknown error";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await fetchOnce(url, headers);
    if (!("retryable" in result)) return result;
    lastReason = result.reason;
    if (attempt < MAX_RETRIES) {
      const backoff = BASE_DELAY_MS * 2 ** attempt;
      const jitter = Math.random() * backoff * 0.3;
      await sleep(backoff + jitter);
    }
  }
  return { ok: false, reason: lastReason };
}
