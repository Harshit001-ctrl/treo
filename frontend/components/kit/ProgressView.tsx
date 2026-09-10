import type { ProgressLogEntry } from "../../lib/api";

const STEPS = [
  "queued",
  "extracting",
  "researching",
  "generating_questions",
  "checking_coverage",
  "scheduling",
  "ready",
] as const;

const STEP_LABELS: Record<string, string> = {
  queued: "Queued",
  extracting: "Extracting requirements",
  researching: "Researching company",
  generating_questions: "Generating questions",
  checking_coverage: "Checking coverage",
  scheduling: "Building schedule",
  ready: "Ready",
};

export function ProgressView({ status, progressLog }: { status: string; progressLog: ProgressLogEntry[] }) {
  const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Generating your prep kit…</h2>
      <ol className="mt-4 flex flex-col gap-2">
        {STEPS.map((step, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  state === "done"
                    ? "bg-green-600 text-white"
                    : state === "active"
                    ? "animate-pulse bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className={state === "pending" ? "text-zinc-400 dark:text-zinc-600" : "font-medium"}>
                {STEP_LABELS[step]}
              </span>
            </li>
          );
        })}
      </ol>

      {progressLog.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Activity log</p>
          <ul className="mt-1 max-h-48 overflow-y-auto rounded-md bg-zinc-50 p-2 text-xs text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            {progressLog.map((entry, i) => (
              <li key={i} className="py-0.5">
                <span className="text-zinc-400 dark:text-zinc-600">{new Date(entry.at).toLocaleTimeString()}</span>{" "}
                {entry.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
