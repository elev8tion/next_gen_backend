"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    }>
      <AuthCallback />
    </Suspense>
  );
}

function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verifyAndRedirect() {
      try {
        const res = await fetch("/api/auth/get-session", {
          credentials: "include",
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          if (data.session) {
            router.replace(redirectTo);
            return;
          }
        }

        // No valid session — retry once after a short delay (cookie propagation)
        await new Promise((r) => setTimeout(r, 1000));
        if (cancelled) return;

        const retry = await fetch("/api/auth/get-session", {
          credentials: "include",
        });

        if (cancelled) return;

        if (retry.ok) {
          const data = await retry.json();
          if (data.session) {
            router.replace(redirectTo);
            return;
          }
        }

        setError("Session verification failed. Please sign in again.");
      } catch {
        if (!cancelled) {
          setError("Authentication error. Please try again.");
        }
      }
    }

    verifyAndRedirect();
    return () => { cancelled = true; };
  }, [router, redirectTo]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-lg border border-card-border bg-card p-8 text-center">
          <p className="text-sm text-danger">{error}</p>
          <a
            href="/sign-in"
            className="mt-4 inline-block text-sm text-accent hover:underline"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="mt-4 text-sm text-muted">Authenticating...</p>
      </div>
    </div>
  );
}
