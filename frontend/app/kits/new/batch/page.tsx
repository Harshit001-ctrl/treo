"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import { AuthGate } from "../../../../components/AuthGate";
import { TopNav } from "../../../../components/TopNav";
import { ApiError, CreateKitInput, kitsApi } from "../../../../lib/api";


type Row = CreateKitInput & { _rowIndex: number };

interface RowResult {
  index: number;
  status: "ok" | "duplicate" | "error";
  message: string;
}

function parseItems(raw: string): { rows: Row[]; parseError: string | null } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { rows: [], parseError: "That file isn't valid JSON." };
  }
  if (!Array.isArray(data)) {
    return { rows: [], parseError: "Expected a JSON array of {jd, companyUrl, days} objects." };
  }
  if (data.length === 0) {
    return { rows: [], parseError: "The file has no entries." };
  }
  if (data.length > 50) {
    return { rows: [], parseError: `Found ${data.length} entries — the maximum per batch is 50.` };
  }

  const rows: Row[] = [];
  const problems: string[] = [];
  data.forEach((item, i) => {
    const rowNum = i + 1;
    if (typeof item !== "object" || item === null) {
      problems.push(`Row ${rowNum}: not an object.`);
      return;
    }
    const obj = item as Record<string, unknown>;
    const jd = typeof obj.jd === "string" ? obj.jd : "";
    const companyUrl = typeof obj.companyUrl === "string" ? obj.companyUrl : "";
    const days = typeof obj.days === "number" ? obj.days : Number(obj.days);

    if (jd.trim().length < 10) problems.push(`Row ${rowNum}: "jd" is missing or too short.`);
    if (!companyUrl.trim()) problems.push(`Row ${rowNum}: "companyUrl" is missing.`);
    if (!Number.isInteger(days) || days < 1 || days > 60) problems.push(`Row ${rowNum}: "days" must be an integer 1-60.`);

    rows.push({ jd, companyUrl, days: Number.isFinite(days) ? days : 0, _rowIndex: rowNum });
  });

  if (problems.length > 0) {
    return { rows: [], parseError: problems.join(" ") };
  }
  return { rows, parseError: null };
}

function BatchUploadForm() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResults(null);
    setSubmitError(null);
    if (!file) {
      setFileName(null);
      setRows(null);
      setParseError(null);
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    const { rows, parseError } = parseItems(text);
    setRows(rows.length > 0 ? rows : null);
    setParseError(parseError);
  };

  const handleSubmit = async () => {
    if (!rows || rows.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { kits } = await kitsApi.bulkCreate(rows.map((r) => ({ jd: r.jd, companyUrl: r.companyUrl, days: r.days })));
      const results: RowResult[] = kits.map((k, i) => ({
        index: rows[i]._rowIndex,
        status: k.duplicate ? "duplicate" : "ok",
        message: k.duplicate ? "Already exists — reused existing kit." : "Queued.",
      }));
      setResults(results);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Batch upload failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Batch upload</h1>
        <Link href="/kits/new" className="text-sm font-medium underline">
          Single kit instead
        </Link>
      </div>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Upload a JSON file containing an array of up to 50 entries, each shaped like{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
          {`{"jd": "...", "companyUrl": "https://...", "days": 7}`}
        </code>
        .
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Select file</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-white dark:border-zinc-700 dark:bg-zinc-950 dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
        </label>

        {fileName && !parseError && rows && (
          <p className="text-sm text-green-700 dark:text-green-400">
            {fileName}: {rows.length} valid entr{rows.length === 1 ? "y" : "ies"} found.
          </p>
        )}

        {parseError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {parseError}
          </p>
        )}

        {submitError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {submitError}
          </p>
        )}

        {rows && rows.length > 0 && !results && (
          <ul className="max-h-64 overflow-y-auto rounded-md border border-zinc-200 text-sm dark:border-zinc-800">
            {rows.map((r) => (
              <li key={r._rowIndex} className="border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-800">
                <span className="font-medium">Row {r._rowIndex}:</span> {r.companyUrl} · {r.days} days ·{" "}
                {r.jd.slice(0, 60)}
                {r.jd.length > 60 ? "…" : ""}
              </li>
            ))}
          </ul>
        )}

        {results && (
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
            <ul className="text-sm">
              {results.map((r) => (
                <li
                  key={r.index}
                  className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-800"
                >
                  <span>Row {r.index}</span>
                  <span className={r.status === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}>
                    {r.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          {!results ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!rows || rows.length === 0 || submitting}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {submitting ? "Uploading…" : `Create ${rows?.length ?? 0} kits`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              View dashboard
            </button>
          )}
          <Link
            href="/"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BatchUploadPage() {
  return (
    <AuthGate>
      <TopNav />
      <BatchUploadForm />
    </AuthGate>
  );
}
