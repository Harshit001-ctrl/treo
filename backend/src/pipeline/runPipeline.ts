import { Kit } from "@prepkit/shared";
import { extractRequirements } from "./extractRequirements";
import { crawlCompanySite } from "./crawler";
import { searchInterviewDiscussion } from "./discussionSearch";
import { generateCompanyBrief } from "./companyBrief";
import { generateAllCategories, generateGapFillQuestions } from "./generateQuestions";
import { generateFlashcards } from "./flashcards";
import { runCoverageLoop } from "../lib/coverage";
import { buildSchedule } from "../lib/scheduler";
import { assertValidKit } from "../lib/validateKit";
import { ProgressReporter } from "./status";

export interface PipelineCaseInput {
  jd: string;
  companyUrl: string;
  days: number;
}

function deriveCompanyName(homepageTitle: string | undefined, companyUrl: string): string {
  if (homepageTitle) {
    // Homepage <title> is often "Brand – Tagline" or "Brand | Tagline" — take the first segment.
    const firstSegment = homepageTitle.split(/[–—|:-]/)[0].trim();
    if (firstSegment.length >= 2 && firstSegment.length <= 40) return firstSegment;
  }
  try {
    const host = new URL(companyUrl).hostname.replace(/^www\./, "");
    return host.split(".")[0];
  } catch {
    return companyUrl;
  }
}

function deriveRoleTitle(jd: string): string {
  const firstLine = jd.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return firstLine?.slice(0, 120) ?? "Unspecified role";
}

/**
 * The single pipeline entry point, used identically by the live API's job
 * queue and by scripts/evaluate.ts — the brief requires the batch command run
 * "the same code your application uses, not a parallel implementation."
 * Every stage is deliberately sequenced (Section 3): requirements are
 * extracted before anything about the company is known; the crawl and
 * discussion search run before the brief and questions, so a hiring-process
 * page or a thin JD can actually change what gets generated next.
 */
export async function runPipeline(input: PipelineCaseInput, onProgress?: ProgressReporter): Promise<Kit> {
  const report = (status: Parameters<ProgressReporter>[0]["status"], message: string) =>
    onProgress?.({ status, message });

  report("extracting", "Extracting requirements from the job description...");
  const requirements = await extractRequirements(input.jd);

  report("researching", "Crawling the company site...");
  const crawl = await crawlCompanySite(input.companyUrl); // throws on invalid/SSRF-blocked URL — a hard case failure, not an honest-empty-result

  const companyName = deriveCompanyName(crawl.pages[0]?.title, input.companyUrl);

  report("researching", "Searching for public discussion of the interview process...");
  const discussion = await searchInterviewDiscussion(companyName);

  report("researching", "Writing the company brief...");
  const companyBrief = await generateCompanyBrief({ companyUrl: input.companyUrl, companyName, pages: crawl.pages });

  report("generating_questions", "Generating interview questions by category...");
  const initialQuestions = await generateAllCategories({
    requirements,
    companyBrief,
    companyName,
    pages: crawl.pages,
    discussion,
  });

  report("checking_coverage", "Checking requirement coverage and closing gaps...");
  let accumulatedIds = initialQuestions.map((q) => q.id);
  const { questions, coverage } = await runCoverageLoop(requirements, initialQuestions, async (gapIds) => {
    const newQuestions = await generateGapFillQuestions(requirements, gapIds, accumulatedIds);
    accumulatedIds = accumulatedIds.concat(newQuestions.map((q) => q.id));
    return newQuestions;
  });

  report("scheduling", "Generating flashcards and building the study schedule...");
  const flashcards = await generateFlashcards(requirements, companyBrief, companyName);
  const schedule = buildSchedule(requirements, questions, input.days);

  const candidate: Kit = {
    source: {
      company: companyName,
      company_url: input.companyUrl,
      role: deriveRoleTitle(input.jd),
      location: "",
      jd_chars: input.jd.length,
      researched_at: new Date().toISOString(),
      pages_used: crawl.pages.map((p) => p.url),
    },
    company_brief: companyBrief,
    role: {
      title: deriveRoleTitle(input.jd),
      seniority: "",
      responsibilities: [],
      requirements,
    },
    questions,
    flashcards,
    schedule,
    coverage,
  };

  return assertValidKit(candidate);
}
