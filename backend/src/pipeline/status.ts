/** The pipeline's own stages, in order. The persistence layer (db/models/Kit.ts)
 * imports this rather than defining its own copy — the pipeline owns what its
 * stages are; the DB just stores whichever one a kit is currently in. */
export const KIT_STATUSES = [
  "queued",
  "extracting",
  "researching",
  "generating_questions",
  "checking_coverage",
  "scheduling",
  "ready",
  "failed",
] as const;
export type KitStatus = (typeof KIT_STATUSES)[number];

export interface PipelineProgress {
  status: KitStatus;
  message: string;
}

export type ProgressReporter = (progress: PipelineProgress) => void;
