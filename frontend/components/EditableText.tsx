"use client";

import { useRef, useState } from "react";

export function EditableText({
  value,
  onSave,
  multiline = false,
  label,
  className = "",
  placeholder,
}: {
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  label: string;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const commit = () => {
    if (draft.trim() !== value.trim() && draft.trim().length > 0) {
      onSave(draft);
    } else {
      setDraft(value);
    }
  };

  const commonProps = {
    "aria-label": label,
    placeholder,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setDraft(e.target.value),
    onBlur: commit,
    className: `w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm hover:border-zinc-200 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:hover:border-zinc-700 dark:focus:border-zinc-500 ${className}`,
  };

  if (multiline) {
    return (
      <textarea
        {...commonProps}
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.ctrlKey) {
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
    );
  }

  return (
    <input
      {...commonProps}
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
