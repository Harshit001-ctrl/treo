"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import { LoadingSpinner } from "./LoadingSpinner";


export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner label="Checking session…" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner label="Redirecting to login…" size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
