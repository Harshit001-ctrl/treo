import { KitModel } from "./db/models/Kit";
import { runPipeline } from "./pipeline/runPipeline";
import { toStructuredError } from "./lib/toStructuredError";

/**
 * Generation is slow (a crawl plus several sequential LLM calls) and
 * failure-prone, so it never runs inline on the request that creates a kit —
 * the route returns immediately with status "queued" and this in-memory
 * queue processes it in the background, persisting progress as it goes so
 * the frontend can poll and show real step-by-step status (Section 6:
 * "watch the kit being generated, with visible progress and clear failure
 * states"). A simple in-memory array is enough here: this is a single
 * long-lived Express process (not serverless), and if the process restarts,
 * an in-progress kit is left at whatever status it reached — acceptable for
 * this assessment's scope, called out as a known limitation in the README.
 */

const queue: string[] = [];
let draining = false;

export function enqueueKitGeneration(kitId: string): void {
  queue.push(kitId);
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const kitId = queue.shift()!;
      await processKit(kitId);
    }
  } finally {
    draining = false;
  }
}

async function processKit(kitId: string): Promise<void> {
  const kitDoc = await KitModel.findById(kitId);
  if (!kitDoc || !kitDoc.input) return;

  try {
    const kit = await runPipeline(
      { jd: kitDoc.input.jd, companyUrl: kitDoc.input.companyUrl, days: kitDoc.input.days },
      (progress) => {
        KitModel.updateOne(
          { _id: kitId },
          {
            $set: { status: progress.status },
            $push: { progressLog: { step: progress.status, message: progress.message, at: new Date() } },
          }
        ).catch((err) => console.error(`[jobQueue] progress update failed for ${kitId}:`, err));
      }
    );
    await KitModel.updateOne({ _id: kitId }, { $set: { status: "ready", kit, error: null } });
  } catch (err) {
    const structuredError = toStructuredError(err);
    console.error(`[jobQueue] kit ${kitId} failed:`, structuredError);
    await KitModel.updateOne({ _id: kitId }, { $set: { status: "failed", error: structuredError } });
  }
}
