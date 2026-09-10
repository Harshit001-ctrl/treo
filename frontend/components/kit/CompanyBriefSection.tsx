"use client";

import type { CompanyBrief } from "@prepkit/shared";
import { EditableText } from "../EditableText";
import { OriginBadge } from "../OriginBadge";
import { LoadingSpinner } from "../LoadingSpinner";

export function CompanyBriefSection({
  brief,
  onEdit,
  onRegenerate,
  regenerating,
}: {
  brief: CompanyBrief;
  onEdit: (updates: { summary?: string; what_they_do?: string }) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Company brief</h2>
          <OriginBadge origin={brief.origin} edited={brief.edited} />
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Regenerate
        </button>
      </div>

      {regenerating ? (
        <div className="mt-3">
          <LoadingSpinner label="Regenerating company brief…" />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Summary</p>
            <EditableText
              value={brief.summary}
              onSave={(v) => onEdit({ summary: v })}
              label="Company summary"
              multiline
            />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">What they do</p>
            <EditableText
              value={brief.what_they_do}
              onSave={(v) => onEdit({ what_they_do: v })}
              label="What the company does"
              multiline
            />
          </div>
          {brief.sources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sources</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {brief.sources.map((s) => (
                  <li key={s} className="truncate">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
