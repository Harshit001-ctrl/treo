export function LoadingSpinner({ label = "Loading…", size = "md" }: { label?: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-6 w-6";
  return (
    <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
      <span
        className={`${dims} animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300`}
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
