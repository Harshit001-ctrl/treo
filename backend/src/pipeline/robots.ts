import robotsParser from "robots-parser";
import { fetchLimited } from "./fetchLimited";

const USER_AGENT = "PrepKitBot";

export interface RobotsRules {
  isAllowed(url: string): boolean;
}

/** No robots.txt, or one we couldn't fetch, means "allow all" — the standard
 * convention, and also keeps a single unreachable /robots.txt from failing
 * an otherwise-crawlable site. */
export async function loadRobotsRules(origin: string): Promise<RobotsRules> {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const result = await fetchLimited(robotsUrl);
  if (!result.ok) {
    return { isAllowed: () => true };
  }
  const robots = robotsParser(robotsUrl, result.text);
  return {
    isAllowed: (url: string) => robots.isAllowed(url, USER_AGENT) ?? true,
  };
}
