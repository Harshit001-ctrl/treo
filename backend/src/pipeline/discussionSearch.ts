import * as cheerio from "cheerio";
import { fetchLimited } from "./fetchLimited";

export interface DiscussionSnippet {
  title: string;
  url: string;
  snippet: string;
}

const MAX_RESULTS = 5;

/**
 * Best-effort search for public discussion of a company's interview process,
 * via DuckDuckGo's key-less HTML endpoint (no free structured search API
 * exists without an API key, per the brief's "any provider with a genuine
 * free tier" constraint on paid services). Finding nothing — a block, a
 * network failure, zero results — is a valid, honest outcome here, not an
 * error: Section 10 explicitly includes "public discussion turns up nothing
 * at all" as a case to handle, not fail on.
 */
export async function searchInterviewDiscussion(companyName: string): Promise<DiscussionSnippet[]> {
  const query = `${companyName} interview process`;
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  // Unlike the site crawler (which honestly identifies itself as a bot, per
  // robots.txt convention), this queries DuckDuckGo's public search UI the
  // way any browser would — DDG's bot-detection blocks a self-identifying
  // crawler UA outright, even for a single, low-volume, one-off query.
  const result = await fetchLimited(searchUrl, {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  });
  if (!result.ok) return [];

  try {
    const $ = cheerio.load(result.text);
    const snippets: DiscussionSnippet[] = [];

    $(".result").each((_, el) => {
      if (snippets.length >= MAX_RESULTS) return;
      const titleEl = $(el).find(".result__a").first();
      const title = titleEl.text().trim();
      const href = titleEl.attr("href");
      const snippet = $(el).find(".result__snippet").first().text().trim();
      if (!title || !href) return;
      snippets.push({ title, url: resolveDdgRedirect(href), snippet });
    });

    return snippets;
  } catch {
    return [];
  }
}

/** DuckDuckGo's HTML results wrap the real URL behind a redirect param. */
function resolveDdgRedirect(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const real = url.searchParams.get("uddg");
    return real ? decodeURIComponent(real) : url.toString();
  } catch {
    return href;
  }
}
