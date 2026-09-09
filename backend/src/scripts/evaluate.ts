/**
 * The mandatory batch entry point (Section 9 / Appendix B):
 *
 *   npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Reads an array of {id, jd, company_url, days} cases and writes one
 * combined JSON file of results, running each case through the exact same
 * runPipeline() the live API's job queue uses — no parallel implementation.
 * Needs no database: this script never touches MongoDB, only the pipeline
 * and the filesystem, so it has nothing to set up beyond the .env values
 * documented in .env.example.
 */
import { readFile, writeFile } from "node:fs/promises";
import { BatchInputSchema, BatchOutputSchema, BatchOutput, BatchResultEntry } from "@prepkit/shared";
import { runPipeline } from "../pipeline/runPipeline";
import { toStructuredError } from "../lib/toStructuredError";
import { mapWithConcurrency } from "../lib/mapWithConcurrency";

// Cases run with limited concurrency rather than one at a time or fully
// parallel. LLM calls are still serialized globally by llm/rateLimiter.ts
// regardless of how many cases are "in flight," so this mainly overlaps one
// case's crawl/discussion-search I/O with another case's LLM calls, which
// measurably helps the "five cases in fifteen minutes" budget without
// bursting past the free-tier rate limit the rate limiter is protecting.
const CONCURRENCY = 2;

function parseArgs(argv: string[]): { input: string; output: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--output") args.output = argv[++i];
  }
  if (!args.input || !args.output) {
    console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
    process.exit(1);
  }
  return { input: args.input, output: args.output };
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  const raw = JSON.parse(await readFile(input, "utf-8"));
  const cases = BatchInputSchema.parse(raw); // a malformed input file is a fatal CLI usage error, not a per-case failure

  console.log(`Running ${cases.length} case(s) with concurrency ${CONCURRENCY}...`);

  const entries = await mapWithConcurrency<(typeof cases)[number], BatchResultEntry>(cases, CONCURRENCY, async (c) => {
    const caseStart = Date.now();
    console.log(`[${c.id}] starting...`);
    try {
      const kit = await runPipeline({ jd: c.jd, companyUrl: c.company_url, days: c.days });
      console.log(`[${c.id}] ok in ${Date.now() - caseStart}ms`);
      return { id: c.id, status: "ok", kit, error: null };
    } catch (err) {
      const structuredError = toStructuredError(err);
      console.log(`[${c.id}] failed in ${Date.now() - caseStart}ms: ${structuredError.code} — ${structuredError.message}`);
      return { id: c.id, status: "failed", kit: null, error: structuredError };
    }
  });

  const result: BatchOutput = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: entries,
  };
  BatchOutputSchema.parse(result); // never write a file that doesn't match Appendix B's shape

  await writeFile(output, JSON.stringify(result, null, 2), "utf-8");

  const okCount = entries.filter((e) => e.status === "ok").length;
  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done in ${totalSeconds}s: ${okCount}/${entries.length} ok, ${entries.length - okCount} failed. Wrote ${output}.`);
}

main().catch((err) => {
  console.error("evaluate failed:", err);
  process.exit(1);
});
