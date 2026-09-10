export function OriginBadge({ origin, edited }: { origin: "ai" | "user"; edited: boolean }) {
  const locked = origin === "user" || edited;
  if (!locked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        AI-generated
      </span>
    );
  }
  const label = origin === "user" ? "Your addition" : "Edited by you";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      title="Locked: this item survives category/section regeneration because you authored or edited it."
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 1a4 4 0 00-4 4v2H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 6V5a2 2 0 10-4 0v2h4z"
          clipRule="evenodd"
        />
      </svg>
      {label}
    </span>
  );
}
