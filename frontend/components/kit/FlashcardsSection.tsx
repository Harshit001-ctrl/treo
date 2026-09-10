"use client";

import { FormEvent, useState } from "react";
import type { Flashcard } from "@prepkit/shared";
import { FlashcardItem } from "../FlashcardItem";
import { LoadingSpinner } from "../LoadingSpinner";

function AddFlashcardForm({
  onAdd,
  onClose,
}: {
  onAdd: (draft: { front: string; back: string }) => void;
  onClose: () => void;
}) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    onAdd({ front: front.trim(), back: back.trim() });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 rounded-md border border-dashed border-zinc-300 p-3 sm:grid-cols-2 dark:border-zinc-700">
      <textarea
        autoFocus
        required
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder="Front"
        aria-label="New flashcard front"
        rows={2}
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <textarea
        required
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="Back"
        aria-label="New flashcard back"
        rows={2}
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <div className="flex gap-2 sm:col-span-2">
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

export function FlashcardsSection({
  flashcards,
  onEdit,
  onDelete,
  onAdd,
  onRegenerate,
  regenerating,
}: {
  flashcards: Flashcard[];
  onEdit: (id: string, updates: Partial<Pick<Flashcard, "front" | "back">>) => void;
  onDelete: (id: string) => void;
  onAdd: (draft: { front: string; back: string }) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Flashcards ({flashcards.length})</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Add flashcard
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Regenerate
          </button>
        </div>
      </div>

      {regenerating && (
        <div className="mt-2">
          <LoadingSpinner label="Regenerating flashcards…" />
        </div>
      )}

      {adding && (
        <div className="mt-3">
          <AddFlashcardForm onAdd={onAdd} onClose={() => setAdding(false)} />
        </div>
      )}

      {flashcards.length === 0 && !adding ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No flashcards yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {flashcards.map((f) => (
            <FlashcardItem key={f.id} flashcard={f} onEdit={(updates) => onEdit(f.id, updates)} onDelete={() => onDelete(f.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
