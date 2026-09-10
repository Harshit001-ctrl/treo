"use client";

import type { Question } from "@prepkit/shared";
import type { QuestionCategory } from "../lib/types";
import { EditableText } from "./EditableText";
import { OriginBadge } from "./OriginBadge";

const CATEGORIES: { value: QuestionCategory; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "behavioural", label: "Behavioural" },
  { value: "system-design", label: "System design" },
  { value: "company-fit", label: "Company fit" },
];

export function QuestionCard({
  question,
  isFirst,
  isLast,
  onEdit,
  onMoveCategory,
  onDelete,
  onMove,
}: {
  question: Question;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (updates: Partial<Pick<Question, "prompt" | "answer_outline" | "difficulty">>) => void;
  onMoveCategory: (category: QuestionCategory) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <OriginBadge origin={question.origin} edited={question.edited} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={isFirst}
            aria-label="Move question up"
            className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={isLast}
            aria-label="Move question down"
            className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            ↓
          </button>
        </div>
      </div>

      <EditableText
        value={question.prompt}
        onSave={(v) => onEdit({ prompt: v })}
        label="Question prompt"
        className="mt-1 font-medium"
      />
      <EditableText
        value={question.answer_outline}
        onSave={(v) => onEdit({ answer_outline: v })}
        label="Answer outline"
        multiline
        placeholder="Answer outline…"
        className="mt-1 text-zinc-600 dark:text-zinc-400"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-zinc-500 dark:text-zinc-400">Difficulty</span>
          <select
            value={question.difficulty}
            onChange={(e) => onEdit({ difficulty: Number(e.target.value) })}
            className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value={1}>1 (easy)</option>
            <option value={2}>2</option>
            <option value={3}>3 (hard)</option>
          </select>
        </label>

        <label className="flex items-center gap-1">
          <span className="text-zinc-500 dark:text-zinc-400">Category</span>
          <select
            value={question.category}
            onChange={(e) => onMoveCategory(e.target.value as QuestionCategory)}
            className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {question.requirement_ids.length > 0 && (
          <span className="text-zinc-500 dark:text-zinc-400">
            Linked: {question.requirement_ids.join(", ")}
          </span>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="ml-auto rounded px-2 py-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
