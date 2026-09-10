const STATUS_STYLES: Record<string, string> = {
  queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  extracting: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  researching: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  generating_questions: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  checking_coverage: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  scheduling: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  extracting: "Extracting",
  researching: "Researching",
  generating_questions: "Generating questions",
  checking_coverage: "Checking coverage",
  scheduling: "Scheduling",
  ready: "Ready",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
