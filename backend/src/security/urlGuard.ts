import dns from "node:dns/promises";
import { env } from "../config/env";
import { badRequest, forbidden } from "../lib/httpError";
import { ErrorCode } from "@prepkit/shared";

/**
 * The app fetches company URLs supplied by an untrusted user, which is a
 * textbook SSRF surface (Section 11: "reject private and loopback addresses
 * in production"). The guard is deliberately env-gated rather than a blanket
 * block: the batch command's own test fixtures are explicitly allowed to be
 * `http://localhost:...` (Appendix B's example case uses exactly that), so
 * rejecting private/loopback ranges only happens once NODE_ENV=production.
 * URL syntax/protocol validation, in contrast, always applies.
 */

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" || // loopback
    lower.startsWith("fc") || // fc00::/7 unique local
    lower.startsWith("fd") ||
    lower.startsWith("fe80") || // link-local
    lower.startsWith("::ffff:127.") // IPv4-mapped loopback
  );
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw badRequest(ErrorCode.COMPANY_URL_INVALID, "Company URL is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest(ErrorCode.COMPANY_URL_INVALID, "Company URL must use http or https.");
  }

  if (!env.isProduction) return url; // dev/test: batch fixtures may be localhost

  const hostname = url.hostname;
  if (hostname === "localhost" || hostname === "0.0.0.0") {
    throw forbidden("Local addresses are not permitted for company URLs.");
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw badRequest(ErrorCode.COMPANY_URL_INVALID, "Company URL host could not be resolved.");
  }

  for (const addr of addresses) {
    if (isPrivateIPv4(addr) || isPrivateIPv6(addr)) {
      throw forbidden("Company URL resolves to a private or loopback address, which is not permitted.");
    }
  }

  return url;
}

/** True if `candidate` is the same host as `base`, or a subdomain of it —
 * used to keep the crawler from wandering off-site. Deliberately simple
 * (no public-suffix-list lookup): exact match or subdomain only, so it never
 * mistakes two unrelated sites that merely share a two-label suffix for the
 * same site. */
export function isSameSite(base: URL, candidate: URL): boolean {
  if (candidate.hostname === base.hostname) return true;
  return candidate.hostname.endsWith(`.${base.hostname}`) || base.hostname.endsWith(`.${candidate.hostname}`);
}
