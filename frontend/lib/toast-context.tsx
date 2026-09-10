"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

interface Toast {
  id: number;
  message: string;
  kind: "error" | "success" | "info";
}

interface ToastContextValue {
  showToast: (message: string, kind?: Toast["kind"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const showToast = useCallback((message: string, kind: Toast["kind"] = "error") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(90vw,360px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.kind === "error"
                ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
                : t.kind === "success"
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
                : "bg-zinc-50 border-zinc-200 text-zinc-800 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span>{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="text-xs opacity-60 hover:opacity-100"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
