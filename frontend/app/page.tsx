"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "../components/AuthGate";
import { TopNav } from "../components/TopNav";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ApiError, kitsApi, KitListItem } from "../lib/api";

function DashboardContent() {
  const [kits, setKits] = useState<KitListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { kits } = await kitsApi.list();
      setKits(kits);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your kits.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Your prep kits</h1>
        <div className="flex gap-2">
          <Link
            href="/kits/new/batch"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Batch upload
          </Link>
          <Link
            href="/kits/new"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            New kit
          </Link>
        </div>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Loading your kits…" size="lg" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            <p>{error}</p>
            <button
              onClick={load}
              className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && kits && kits.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">No kits yet. Create your first one to get started.</p>
            <Link
              href="/kits/new"
              className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              New kit
            </Link>
          </div>
        )}

        {!loading && !error && kits && kits.length > 0 && (
          <ul className="flex flex-col gap-3">
            {kits.map((kit) => (
              <li key={kit.id}>
                <Link
                  href={`/kits/${kit.id}`}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {kit.role ?? "Untitled role"}
                      {kit.company ? ` · ${kit.company}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {kit.days} day plan · created {new Date(kit.createdAt).toLocaleString()}
                    </p>
                    {kit.status === "failed" && kit.error && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{kit.error.message}</p>
                    )}
                  </div>
                  <StatusBadge status={kit.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <TopNav />
      <DashboardContent />
    </AuthGate>
  );
}
