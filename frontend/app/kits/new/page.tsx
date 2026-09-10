"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthGate } from "../../../components/AuthGate";
import { TopNav } from "../../../components/TopNav";
import { ApiError, kitsApi } from "../../../lib/api";
import { useToast } from "../../../lib/toast-context";

function NewKitForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (jd.trim().length < 10) {
      setError("Job description is too short.");
      return;
    }
    if (!companyUrl.trim()) {
      setError("Company URL is required.");
      return;
    }
    if (days < 1 || days > 60) {
      setError("Days must be between 1 and 60.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await kitsApi.create({ jd, companyUrl, days });
      if (result.duplicate) {
        showToast("You already have a kit for this job description and company — showing the existing one.", "info");
      }
      router.push(`/kits/${result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create kit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">New prep kit</h1>
        <Link href="/kits/new/batch" className="text-sm font-medium underline">
          Batch upload instead
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="jd" className="text-sm font-medium">
            Job description
          </label>
          <textarea
            id="jd"
            required
            rows={10}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full job description here…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="companyUrl" className="text-sm font-medium">
            Company URL
          </label>
          <input
            id="companyUrl"
            type="url"
            required
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
            placeholder="https://example.com"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="days" className="text-sm font-medium">
            Days to prepare
          </label>
          <input
            id="days"
            type="number"
            min={1}
            max={60}
            required
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {submitting ? "Creating…" : "Create kit"}
          </button>
          <Link
            href="/"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function NewKitPage() {
  return (
    <AuthGate>
      <TopNav />
      <NewKitForm />
    </AuthGate>
  );
}
