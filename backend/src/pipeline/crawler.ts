import * as cheerio from "cheerio";
import { assertPublicHttpUrl, isSameSite } from "../security/urlGuard";
import { fetchLimited } from "./fetchLimited";
import { loadRobotsRules } from "./robots";

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
}

export interface SkippedSource {
  url: string;
  reason: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  skipped: SkippedSource[];
}

const MAX_PAGES = 6;
const CRAWL_DELAY_MS = 300; // politeness delay between our own requests to the same site
const MAX_PAGE_CHARS = 6000; // per-page cap before this ever reaches a prompt

/**
 * The path to a company's hiring page is never the same twice — "/careers",
 * "/jobs", a handbook, an engineering blog post are all real examples the
 * brief calls out — so this is a keyword+structure heuristic over whatever
 * links the homepage actually has, never a fixed path list.
 */
const KEYWORD_WEIGHTS: Record<string, number> = {
  interview: 6,
  interviewing: 6,
  hiring: 5,
  careers: 5,
  career: 5,
  jobs: 5,
  job: 3,
  "join-us": 4,
  joinus: 4,
  "work-with-us": 4,
  "life-at": 4,
  handbook: 4,
  culture: 3,
  engineering: 3,
  people: 2,
  team: 2,
  about: 2,
  "about-us": 2,
  company: 1,
  mission: 1,
  values: 1,
  blog: 1,
  process: 2,
};

function scoreLink(url: URL, linkText: string): number {
  const haystack = `${url.pathname} ${linkText}`.toLowerCase();
  let score = 0;
  for (const [keyword, weight] of Object.entries(KEYWORD_WEIGHTS)) {
    if (haystack.includes(keyword)) score += weight;
  }
  const depth = url.pathname.split("/").filter(Boolean).length;
  score += Math.max(0, 3 - depth) * 0.5; // mild bias toward shallower, more canonical pages
  return score;
}

function cleanPage(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, svg, iframe, form, [aria-hidden='true']").remove();
  const title = $("title").first().text().trim();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_CHARS);
  return { title, text };
}

function extractLinks(html: string, base: URL): { url: URL; text: string }[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const links: { url: URL; text: string }[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      return;
    }
    resolved.hash = "";
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
    if (!isSameSite(base, resolved)) return;
    const key = resolved.toString();
    if (key === base.toString() || seen.has(key)) return;
    seen.add(key);
    links.push({ url: resolved, text: $(el).text().trim() });
  });

  return links;
}

/**
 * Re-fetches a specific, already-known set of URLs (no link discovery/ranking)
 * — used to regenerate the company brief from its original sources without
 * re-running the full crawl. Best-effort: a page that fails this time round
 * is just dropped rather than failing the whole regeneration.
 */
export async function refetchKnownPages(urls: string[]): Promise<CrawledPage[]> {
  const pages: CrawledPage[] = [];
  for (const url of urls) {
    await sleep(CRAWL_DELAY_MS);
    const result = await fetchLimited(url);
    if (!result.ok) continue;
    const clean = cleanPage(result.text);
    pages.push({ url: result.finalUrl, title: clean.title, text: clean.text });
  }
  return pages;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Crawls a company's site starting from its homepage: fetches the homepage,
 * ranks its own links by relevance, and fetches the top few. Every fetch is
 * independently allowed to fail — a slow/unreachable secondary page is
 * recorded in `skipped` and the crawl continues, per Section 2's "skip and
 * report a source that cannot be retrieved, rather than failing the whole run."
 */
export async function crawlCompanySite(companyUrl: string): Promise<CrawlResult> {
  const skipped: SkippedSource[] = [];
  const base = await assertPublicHttpUrl(companyUrl);

  const robots = await loadRobotsRules(base.origin);
  if (!robots.isAllowed(base.toString())) {
    skipped.push({ url: base.toString(), reason: "Disallowed by robots.txt" });
    return { pages: [], skipped };
  }

  const homepage = await fetchLimited(base.toString());
  if (!homepage.ok) {
    skipped.push({ url: base.toString(), reason: homepage.reason });
    return { pages: [], skipped };
  }

  const pages: CrawledPage[] = [];
  const homeClean = cleanPage(homepage.text);
  pages.push({ url: homepage.finalUrl, title: homeClean.title, text: homeClean.text });

  const candidates = extractLinks(homepage.text, base)
    .map(({ url, text }) => ({ url, score: scoreLink(url, text) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PAGES - 1);

  for (const candidate of candidates) {
    await sleep(CRAWL_DELAY_MS);
    const candidateUrl = candidate.url.toString();

    if (!robots.isAllowed(candidateUrl)) {
      skipped.push({ url: candidateUrl, reason: "Disallowed by robots.txt" });
      continue;
    }
    const result = await fetchLimited(candidateUrl);
    if (!result.ok) {
      skipped.push({ url: candidateUrl, reason: result.reason });
      continue;
    }
    const clean = cleanPage(result.text);
    pages.push({ url: result.finalUrl, title: clean.title, text: clean.text });
  }

  return { pages, skipped };
}
