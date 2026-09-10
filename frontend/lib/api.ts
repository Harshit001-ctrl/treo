import type { Kit, Question, Flashcard } from "@prepkit/shared";
import type { QuestionCategory } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...options,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const errObj = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      errObj?.code ?? "UNKNOWN",
      errObj?.message ?? "Something went wrong. Please try again."
    );
  }

  return body as T;
}

// ---- Auth ----

export interface AuthUser {
  id: string;
  email: string;
}

export const authApi = {
  register: (email: string, password: string) =>
    request<AuthUser>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<AuthUser>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<AuthUser>("/api/auth/me"),
};

// ---- Kits ----

export interface KitListItem {
  id: string;
  status: string;
  company: string | null;
  role: string | null;
  days: number;
  createdAt: string;
  updatedAt: string;
  error: { code: string; message: string } | null;
}

export interface ProgressLogEntry {
  step: string;
  message: string;
  at: string;
}

export interface KitDetail {
  id: string;
  status: string;
  progressLog: ProgressLogEntry[];
  error: { code: string; message: string } | null;
  kit: Kit | null;
  practice: PracticeEntry[];
}

export interface PracticeEntry {
  flashcardId: string;
  lastConfidence: number;
  timesReviewed: number;
  lastReviewedAt: string;
}

export interface CreateKitInput {
  jd: string;
  companyUrl: string;
  days: number;
}

export interface CreateKitResult {
  id: string;
  status: string;
  duplicate: boolean;
}

export const kitsApi = {
  list: () => request<{ kits: KitListItem[] }>("/api/kits"),
  get: (id: string) => request<KitDetail>(`/api/kits/${id}`),
  create: (input: CreateKitInput) =>
    request<CreateKitResult>("/api/kits", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  bulkCreate: (items: CreateKitInput[]) =>
    request<{ kits: CreateKitResult[] }>("/api/kits/bulk", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),

  editQuestion: (
    kitId: string,
    questionId: string,
    updates: Partial<Pick<Question, "prompt" | "answer_outline" | "difficulty" | "category">>
  ) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/questions/${questionId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  addQuestion: (
    kitId: string,
    draft: {
      category: QuestionCategory;
      prompt: string;
      answer_outline: string;
      difficulty: number;
      requirement_ids?: string[];
    }
  ) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/questions`, {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  deleteQuestion: (kitId: string, questionId: string) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/questions/${questionId}`, {
      method: "DELETE",
    }),
  reorderQuestions: (kitId: string, category: QuestionCategory, orderedIds: string[]) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/questions/reorder`, {
      method: "POST",
      body: JSON.stringify({ category, orderedIds }),
    }),

  editFlashcard: (kitId: string, flashcardId: string, updates: Partial<Pick<Flashcard, "front" | "back">>) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/flashcards/${flashcardId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  addFlashcard: (kitId: string, draft: { front: string; back: string; requirement_ids?: string[] }) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/flashcards`, {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  deleteFlashcard: (kitId: string, flashcardId: string) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/flashcards/${flashcardId}`, {
      method: "DELETE",
    }),

  editBrief: (kitId: string, updates: { summary?: string; what_they_do?: string }) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/brief`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  regenerate: (
    kitId: string,
    section: "brief" | "schedule" | "flashcards" | "technical" | "behavioural" | "system-design" | "company-fit"
  ) =>
    request<{ kit: Kit }>(`/api/kits/${kitId}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ section }),
    }),

  recordPractice: (kitId: string, flashcardId: string, confidence: 1 | 2 | 3) =>
    request<{ practice: PracticeEntry[] }>(`/api/kits/${kitId}/practice`, {
      method: "POST",
      body: JSON.stringify({ flashcardId, confidence }),
    }),
  practiceSession: (kitId: string) =>
    request<{ orderedFlashcardIds: string[] }>(`/api/kits/${kitId}/practice/session`),
};
