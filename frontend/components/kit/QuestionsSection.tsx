"use client";

import { FormEvent, useState } from "react";
import type { Question } from "@prepkit/shared";
import type { QuestionCategory } from "../../lib/types";
import { QuestionCard } from "../QuestionCard";
import { LoadingSpinner } from "../LoadingSpinner";

const CATEGORIES: { value: QuestionCategory; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "behavioural", label: "Behavioural" },
  { value: "system-design", label: "System design" },
  { value: "company-fit", label: "Company fit" },
];

function AddQuestionForm({
  category,
  onAdd,
  onClose,
}: {
  category: QuestionCategory;
  onAdd: (draft: { prompt: string; answer_outline: string; difficulty: number }) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [answerOutline, setAnswerOutline] = useState("");
  const [difficulty, setDifficulty] = useState(2);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onAdd({ prompt: prompt.trim(), answer_outline: answerOutline.trim(), difficulty });
    onClose();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700"
    >
      <input
        autoFocus
        required
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={`New ${category} question prompt`}
        aria-label="New question prompt"
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <textarea
        value={answerOutline}
        onChange={(e) => setAnswerOutline(e.target.value)}
        placeholder="Answer outline (optional)"
        aria-label="New question answer outline"
        rows={2}
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs">
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          Add
        </button>
        <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function CategoryGroup({
  category,
  label,
  questions,
  onEdit,
  onMoveCategory,
  onDelete,
  onMove,
  onAdd,
  onRegenerate,
  regenerating,
}: {
  category: QuestionCategory;
  label: string;
  questions: Question[];
  onEdit: (id: string, updates: Partial<Pick<Question, "prompt" | "answer_outline" | "difficulty">>) => void;
  onMoveCategory: (id: string, category: QuestionCategory) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onAdd: (category: QuestionCategory, draft: { prompt: string; answer_outline: string; difficulty: number }) => void;
  onRegenerate: (category: QuestionCategory) => void;
  regenerating: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">
          {label} <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">({questions.length})</span>
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Add question
          </button>
          <button
            type="button"
            onClick={() => onRegenerate(category)}
            disabled={regenerating}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Regenerate
          </button>
        </div>
      </div>

      {regenerating && (
        <div className="mt-2">
          <LoadingSpinner label={`Regenerating ${label.toLowerCase()} questions…`} size="sm" />
        </div>
      )}

      {adding && (
        <div className="mt-2">
          <AddQuestionForm category={category} onAdd={(draft) => onAdd(category, draft)} onClose={() => setAdding(false)} />
        </div>
      )}

      {questions.length === 0 && !adding ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No questions in this category yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              isFirst={i === 0}
              isLast={i === questions.length - 1}
              onEdit={(updates) => onEdit(q.id, updates)}
              onMoveCategory={(cat) => onMoveCategory(q.id, cat)}
              onDelete={() => onDelete(q.id)}
              onMove={(dir) => onMove(q.id, dir)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuestionsSection({
  questions,
  onEdit,
  onMoveCategory,
  onDelete,
  onReorder,
  onAdd,
  onRegenerate,
  regeneratingCategory,
}: {
  questions: Question[];
  onEdit: (id: string, updates: Partial<Pick<Question, "prompt" | "answer_outline" | "difficulty">>) => void;
  onMoveCategory: (id: string, category: QuestionCategory) => void;
  onDelete: (id: string) => void;
  onReorder: (category: QuestionCategory, orderedIds: string[]) => void;
  onAdd: (category: QuestionCategory, draft: { prompt: string; answer_outline: string; difficulty: number }) => void;
  onRegenerate: (category: QuestionCategory) => void;
  regeneratingCategory: QuestionCategory | null;
}) {
  const handleMove = (category: QuestionCategory, id: string, direction: "up" | "down") => {
    const inCategory = questions.filter((q) => q.category === category);
    const idx = inCategory.findIndex((q) => q.id === id);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= inCategory.length) return;
    const ordered = [...inCategory];
    [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
    onReorder(category, ordered.map((q) => q.id));
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Questions</h2>
      <div className="mt-3 flex flex-col gap-4">
        {CATEGORIES.map((c) => (
          <CategoryGroup
            key={c.value}
            category={c.value}
            label={c.label}
            questions={questions.filter((q) => q.category === c.value)}
            onEdit={onEdit}
            onMoveCategory={onMoveCategory}
            onDelete={onDelete}
            onMove={(id, dir) => handleMove(c.value, id, dir)}
            onAdd={onAdd}
            onRegenerate={onRegenerate}
            regenerating={regeneratingCategory === c.value}
          />
        ))}
      </div>
    </section>
  );
}
