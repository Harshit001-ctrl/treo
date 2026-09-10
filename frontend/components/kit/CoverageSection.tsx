import type { Coverage } from "@prepkit/shared";

export function CoverageSection({ coverage }: { coverage: Coverage }) {
  const uncoveredCount = coverage.uncovered_requirement_ids.length;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Coverage</h2>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <span>
          Passes used: <span className="font-medium">{coverage.passes}</span>
        </span>
        <span>
          Status:{" "}
          <span className={`font-medium ${coverage.status === "incomplete" ? "text-amber-600 dark:text-amber-400" : ""}`}>
            {coverage.status}
          </span>
        </span>
        {coverage.must && (
          <span>
            Must-have: <span className="font-medium">{coverage.must.covered}/{coverage.must.total}</span> covered
          </span>
        )}
        {coverage.nice && (
          <span>
            Nice-to-have: <span className="font-medium">{coverage.nice.covered}/{coverage.nice.total}</span> covered
          </span>
        )}
      </div>

      {coverage.reason && (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Reason coverage stopped: <span className="font-medium">{coverage.reason.replace(/_/g, " ")}</span>
        </p>
      )}

      {uncoveredCount > 0 ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <p className="font-medium">
            {uncoveredCount} must-have requirement{uncoveredCount === 1 ? "" : "s"} not covered by any question:
          </p>
          <p className="mt-1">{coverage.uncovered_requirement_ids.join(", ")}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-green-700 dark:text-green-400">All must-have requirements are covered.</p>
      )}
    </section>
  );
}
