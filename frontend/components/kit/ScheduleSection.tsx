import type { Question, Schedule } from "@prepkit/shared";

export function ScheduleSection({
  schedule,
  questionsById,
  onRegenerate,
  regenerating,
}: {
  schedule: Schedule;
  questionsById: Map<string, Question>;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Schedule ({schedule.days_available} days)</h2>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {regenerating ? "Regenerating…" : "Regenerate schedule"}
        </button>
      </div>

      <ol className="mt-3 flex flex-col gap-3">
        {schedule.days.map((d) => (
          <li key={d.day} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-sm font-medium">
              Day {d.day}: {d.focus} <span className="text-zinc-500 dark:text-zinc-400">· {d.minutes} min</span>
            </p>
            {d.question_ids.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {d.question_ids.map((qid) => (
                  <li key={qid}>{questionsById.get(qid)?.prompt ?? `(question ${qid} not found)`}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
