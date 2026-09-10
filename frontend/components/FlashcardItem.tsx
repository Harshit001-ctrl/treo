"use client";

import type { Flashcard } from "@prepkit/shared";
import { EditableText } from "./EditableText";
import { OriginBadge } from "./OriginBadge";

export function FlashcardItem({
  flashcard,
  onEdit,
  onDelete,
}: {
  flashcard: Flashcard;
  onEdit: (updates: Partial<Pick<Flashcard, "front" | "back">>) => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <OriginBadge origin={flashcard.origin} edited={flashcard.edited} />
        <button
          type="button"
          onClick={onDelete}
          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete
        </button>
      </div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Front</p>
          <EditableText value={flashcard.front} onSave={(v) => onEdit({ front: v })} label="Flashcard front" multiline />
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Back</p>
          <EditableText value={flashcard.back} onSave={(v) => onEdit({ back: v })} label="Flashcard back" multiline />
        </div>
      </div>
    </li>
  );
}
