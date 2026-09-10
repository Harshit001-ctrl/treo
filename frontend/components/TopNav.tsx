"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";

export function TopNav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } catch {
      showToast("Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          AI Interview Prep Kit
        </Link>
        {user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-500 sm:inline dark:text-zinc-400">{user.email}</span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
