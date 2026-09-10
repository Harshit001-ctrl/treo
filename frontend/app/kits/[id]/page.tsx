"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Kit, Question } from "@prepkit/shared";
import type { QuestionCategory } from "../../../lib/types";
import { AuthGate } from "../../../components/AuthGate";
import { TopNav } from "../../../components/TopNav";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { ProgressView } from "../../../components/kit/ProgressView";
import { CompanyBriefSection } from "../../../components/kit/CompanyBriefSection";
import { RoleSection } from "../../../components/kit/RoleSection";
import { QuestionsSection } from "../../../components/kit/QuestionsSection";
import { FlashcardsSection } from "../../../components/kit/FlashcardsSection";
import { CoverageSection } from "../../../components/kit/CoverageSection";
import { ScheduleSection } from "../../../components/kit/ScheduleSection";
import { ApiError, kitsApi, KitDetail } from "../../../lib/api";
import { useToast } from "../../../lib/toast-context";

const POLL_MS = 1800;
const TERMINAL = new Set(["ready", "failed"]);

type RegenTarget = "brief" | "schedule" | "flashcards" | QuestionCategory | null;

function KitDetailContent({ kitId }: { kitId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<KitDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [regenTarget, setRegenTarget] = useState<RegenTarget>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDetail = useCallback(
    async (isInitial = false) => {
      try {
        const d = await kitsApi.get(kitId);
        setDetail(d);
        setLoadError(null);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Could not load this kit.");
      } finally {
        if (isInitial) setInitialLoading(false);
      }
    },
    [kitId]
  );

  useEffect(() => {
    queueMicrotask(() => {
      fetchDetail(true);
    });
  }, [fetchDetail]);

  useEffect(() => {
    if (!detail) return;
    if (TERMINAL.has(detail.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => fetchDetail(false), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [detail, fetchDetail]);

  // ---- Optimistic mutation helper ----
  // Snapshot the current kit, apply the change locally right away, fire the
  // API call, and on failure revert to the snapshot + toast the error. This
  // keeps every edit feeling immediate instead of blocking on a round-trip.
  const mutate = useCallback(
    async (optimisticKit: Kit, apiCall: () => Promise<{ kit: Kit }>, errorMessage: string) => {
      setDetail((prev) => (prev ? { ...prev, kit: optimisticKit } : prev));
      try {
        const { kit } = await apiCall();
        setDetail((prev) => (prev ? { ...prev, kit } : prev));
      } catch (err) {
        setDetail((prev) => (prev ? { ...prev, kit: detail?.kit ?? prev.kit } : prev));
        showToast(err instanceof ApiError ? err.message : errorMessage);
        // Re-sync with server truth after a failed optimistic update.
        fetchDetail(false);
      }
    },
    [detail, showToast, fetchDetail]
  );

  const kit = detail?.kit;

  const questionsById = useMemo(() => {
    const map = new Map<string, Question>();
    kit?.questions.forEach((q) => map.set(q.id, q));
    return map;
  }, [kit]);

  if (initialLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner label="Loading kit…" size="lg" />
      </div>
    );
  }

  if (loadError && !detail) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <p>{loadError}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => fetchDetail(true)}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
            >
              Retry
            </button>
            <Link href="/" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  if (detail.status === "failed") {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center gap-2">
            <StatusBadge status="failed" />
            <h1 className="text-lg font-semibold text-red-800 dark:text-red-300">Kit generation failed</h1>
          </div>
          {detail.error ? (
            <div className="mt-3 text-sm text-red-700 dark:text-red-300">
              <p className="font-mono text-xs">{detail.error.code}</p>
              <p className="mt-1">{detail.error.message}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-red-700 dark:text-red-300">
              Generation failed for an unknown reason.
            </p>
          )}
          <Link
            href="/"
            className="mt-4 inline-block rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-white dark:border-zinc-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!TERMINAL.has(detail.status) || !kit) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <ProgressView status={detail.status} progressLog={detail.progressLog} />
      </div>
    );
  }

  // ---- Ready: full builder view ----

  const handleRegenerate = async (section: Exclude<RegenTarget, null>) => {
    setRegenTarget(section);
    try {
      const { kit: updated } = await kitsApi.regenerate(kitId, section);
      setDetail((prev) => (prev ? { ...prev, kit: updated } : prev));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Regeneration failed. Please try again.");
    } finally {
      setRegenTarget(null);
    }
  };

  const regeneratingCategory: QuestionCategory | null =
    regenTarget && ["technical", "behavioural", "system-design", "company-fit"].includes(regenTarget)
      ? (regenTarget as QuestionCategory)
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            {kit.role.title || kit.source.role} <span className="text-zinc-500 dark:text-zinc-400">· {kit.source.company}</span>
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{kit.source.location}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status="ready" />
          <Link
            href={`/kits/${kitId}/practice`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Practice mode
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <CompanyBriefSection
          brief={kit.company_brief}
          regenerating={regenTarget === "brief"}
          onRegenerate={() => handleRegenerate("brief")}
          onEdit={(updates) =>
            mutate(
              { ...kit, company_brief: { ...kit.company_brief, ...updates, edited: true } },
              () => kitsApi.editBrief(kitId, updates),
              "Could not save your changes to the brief."
            )
          }
        />

        <RoleSection role={kit.role} />

        <QuestionsSection
          questions={kit.questions}
          regeneratingCategory={regeneratingCategory}
          onRegenerate={(category) => handleRegenerate(category)}
          onEdit={(id, updates) =>
            mutate(
              {
                ...kit,
                questions: kit.questions.map((q) => (q.id === id ? { ...q, ...updates, edited: true } : q)),
              },
              () => kitsApi.editQuestion(kitId, id, updates),
              "Could not save your changes to that question."
            )
          }
          onMoveCategory={(id, category) =>
            mutate(
              { ...kit, questions: kit.questions.map((q) => (q.id === id ? { ...q, category, edited: true } : q)) },
              () => kitsApi.editQuestion(kitId, id, { category }),
              "Could not move that question."
            )
          }
          onDelete={(id) =>
            mutate(
              { ...kit, questions: kit.questions.filter((q) => q.id !== id) },
              () => kitsApi.deleteQuestion(kitId, id),
              "Could not delete that question."
            )
          }
          onReorder={(category, orderedIds) => {
            const order = new Map(orderedIds.map((id, i) => [id, i]));
            const reordered = [...kit.questions].sort((a, b) => {
              if (a.category !== category || b.category !== category) return 0;
              return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
            });
            mutate(
              { ...kit, questions: reordered },
              () => kitsApi.reorderQuestions(kitId, category, orderedIds),
              "Could not save the new order."
            );
          }}
          onAdd={(category, draft) =>
            mutate(
              {
                ...kit,
                questions: [
                  ...kit.questions,
                  {
                    id: `tmp-${Date.now()}`,
                    requirement_ids: [],
                    category,
                    prompt: draft.prompt,
                    answer_outline: draft.answer_outline,
                    difficulty: draft.difficulty as 1 | 2 | 3,
                    origin: "user",
                    edited: false,
                  },
                ],
              },
              () => kitsApi.addQuestion(kitId, { category, ...draft, requirement_ids: [] }),
              "Could not add that question."
            )
          }
        />

        <FlashcardsSection
          flashcards={kit.flashcards}
          regenerating={regenTarget === "flashcards"}
          onRegenerate={() => handleRegenerate("flashcards")}
          onEdit={(id, updates) =>
            mutate(
              {
                ...kit,
                flashcards: kit.flashcards.map((f) => (f.id === id ? { ...f, ...updates, edited: true } : f)),
              },
              () => kitsApi.editFlashcard(kitId, id, updates),
              "Could not save your changes to that flashcard."
            )
          }
          onDelete={(id) =>
            mutate(
              { ...kit, flashcards: kit.flashcards.filter((f) => f.id !== id) },
              () => kitsApi.deleteFlashcard(kitId, id),
              "Could not delete that flashcard."
            )
          }
          onAdd={(draft) =>
            mutate(
              {
                ...kit,
                flashcards: [
                  ...kit.flashcards,
                  { id: `tmp-${Date.now()}`, front: draft.front, back: draft.back, requirement_ids: [], origin: "user", edited: false },
                ],
              },
              () => kitsApi.addFlashcard(kitId, { ...draft, requirement_ids: [] }),
              "Could not add that flashcard."
            )
          }
        />

        <CoverageSection coverage={kit.coverage} />

        <ScheduleSection
          schedule={kit.schedule}
          questionsById={questionsById}
          regenerating={regenTarget === "schedule"}
          onRegenerate={() => handleRegenerate("schedule")}
        />
      </div>

      <div className="mt-6">
        <button onClick={() => router.push("/")} className="text-sm font-medium underline">
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

export default function KitDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <AuthGate>
      <TopNav />
      <KitDetailContent kitId={params.id} />
    </AuthGate>
  );
}
