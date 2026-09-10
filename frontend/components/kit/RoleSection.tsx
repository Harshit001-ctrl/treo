import type { Role } from "@prepkit/shared";

export function RoleSection({ role }: { role: Role }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Role</h2>
      <p className="mt-1 text-sm">
        <span className="font-medium">{role.title}</span>{" "}
        <span className="text-zinc-500 dark:text-zinc-400">· {role.seniority}</span>
      </p>

      {role.responsibilities.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Responsibilities</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {role.responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {role.requirements.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Requirements</p>
          <ul className="mt-1 flex flex-col gap-1">
            {role.requirements.map((req) => (
              <li key={req.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    req.priority === "must"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {req.priority}
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  {req.kind}
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">#{req.id}</span>
                <span>{req.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
