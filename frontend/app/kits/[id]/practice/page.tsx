"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGate } from "../../../../components/AuthGate";
import { TopNav } from "../../../../components/TopNav";
import { LoadingSpinner } from "../../../../components/LoadingSpinner";
import { ApiError, kitsApi, KitDetail } from "../../../../lib/api";
import { useToast } from "../../../../lib/toast-context";

const CONFIDENCE_OPTIONS: { value: 1 | 2 | 3; label: string; className: string }[] = [
  { value: 1, label: "Not confident", className: "bg-red-600 hover:bg-red-700" },
  { value: 2, label: "Okay", className: "bg-amber-500 hover:bg-amber-600" },
  { value: 3, label: "Confident", className: "bg-green-600 hover:bg-green-700" },
];

function PracticeContent({ kitId }: { kitId: string }) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<KitDetail | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sessionResults, setSessionResults] = useState<Record<string, 1 | 2 | 3>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, session] = await Promise.all([kitsApi.get(kitId), kitsApi.practiceSession(kitId)]);
      setDetail(d);
      setOrderedIds(session.orderedFlashcardIds);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the practice session.");
    } finally {
      setLoading(false);
    }
  }, [kitId]);

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, [load]);

  const flashcardsById = useMemo(() => {
    const map = new Map<string, { front: string; back: string }>();
    detail?.kit?.flashcards.forEach((f) => map.set(f.id, f));
    return map;
  }, [detail]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner label="Loading practice session…" size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={load} className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-100 dark:border-red-700">
              Retry
            </button>
            <Link href={`/kits/${kitId}`} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700">
              Back to kit
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!detail?.kit || !orderedIds) return null;

  if (orderedIds.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6">
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">This kit has no flashcards to practice yet.</p>
          <Link href={`/kits/${kitId}`} className="mt-4 inline-block text-sm font-medium underline">
            Back to kit
          </Link>
        </div>
      </div>
    );
  }

  const totalCards = detail.kit.flashcards.length;
  const priorPractice = new Map(detail.practice.map((p) => [p.flashcardId, p]));

  if (index >= orderedIds.length) {
    // Completion / summary screen.
    const coveredIds = new Set([...priorPractice.keys(), ...Object.keys(sessionResults)]);
    const uncovered = detail.kit.flashcards.filter((f) => !coveredIds.has(f.id));

    return (
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold">Session complete</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You reviewed {orderedIds.length} of {totalCards} flashcards this session.
          </p>

          <div className="mt-4">
            <p className="text-sm font-medium">Covered overall: {totalCards - uncovered.length} / {totalCards}</p>
            {uncovered.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {uncovered.map((f) => (
                  <li key={f.id}>{f.front}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-green-700 dark:text-green-400">Every flashcard has been practiced at least once.</p>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => {
                setIndex(0);
                setRevealed(false);
                setSessionResults({});
                load();
              }}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Practice again
            </button>
            <Link href={`/kits/${kitId}`} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">
              Back to kit
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentId = orderedIds[index];
  const card = flashcardsById.get(currentId);

  const handleConfidence = async (confidence: 1 | 2 | 3) => {
    setRecording(true);
    try {
      await kitsApi.recordPractice(kitId, currentId, confidence);
      setSessionResults((prev) => ({ ...prev, [currentId]: confidence }));
      setIndex((i) => i + 1);
      setRevealed(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not record your answer. Please try again.");
    } finally {
      setRecording(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <Link href={`/kits/${kitId}`} className="underline">
          Exit practice
        </Link>
        <span>
          {index + 1} of {orderedIds.length}
        </span>
      </div>

      <div
        className="mt-4 min-h-[220px] cursor-pointer rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        onClick={() => setRevealed((r) => !r)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setRevealed((r) => !r);
          }
        }}
        aria-pressed={revealed}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{revealed ? "Answer" : "Question"}</p>
        <p className="mt-2 text-lg">{card ? (revealed ? card.back : card.front) : "Card not found."}</p>
        {!revealed && <p className="mt-4 text-xs text-zinc-400">Click or press Enter to reveal the answer.</p>}
      </div>

      {revealed && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {CONFIDENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={recording}
              onClick={() => handleConfidence(opt.value)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${opt.className}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PracticePage() {
  const params = useParams<{ id: string }>();
  return (
    <AuthGate>
      <TopNav />
      <PracticeContent kitId={params.id} />
    </AuthGate>
  );
}
