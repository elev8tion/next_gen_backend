"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Providers {
  email?: boolean;
  google?: boolean;
  emailOTP?: boolean;
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    }>
      <SignUp />
    </Suspense>
  );
}

function SignUp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);

  useEffect(() => {
    fetch("/api/auth-providers")
      .then((r) => r.json())
      .then((data) => setProviders(data.providers || { email: true }))
      .catch(() => setProviders({ email: true }))
      .finally(() => setLoadingProviders(false));
  }, []);

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Sign up failed");
      }

      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to send code");
      }
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp: otpCode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Invalid code");
      }
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogleSignUp() {
    const callbackURL = encodeURIComponent("/auth/callback?redirect=" + encodeURIComponent(redirectTo));
    window.location.href = `/api/auth/sign-in/social?provider=google&callbackURL=${callbackURL}`;
  }

  if (loadingProviders) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-card-border bg-card p-8">
        <h1 className="text-xl font-semibold tracking-tight">Sign Up</h1>
        <p className="mt-1 text-sm text-muted">
          Create your Next Gen Backend account.
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          {providers?.google && (
            <button
              onClick={handleGoogleSignUp}
              className="w-full rounded-md border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 hover:border-accent/30"
            >
              Sign up with Google
            </button>
          )}

          {providers?.google && (providers?.email || providers?.emailOTP) && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-card-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted">or</span>
              </div>
            </div>
          )}

          {providers?.email && (
            <form onSubmit={handleEmailSignUp} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {submitting ? "Creating account…" : "Sign Up"}
              </button>
            </form>
          )}

          {providers?.emailOTP && !providers?.email && (
            !otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label htmlFor="otp-email" className="block text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="otp-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {submitting ? "Sending code…" : "Send Sign-Up Code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-sm text-muted">
                  Enter the code sent to <strong>{email}</strong>
                </p>
                <div>
                  <label htmlFor="otp-code" className="block text-sm font-medium">
                    Code
                  </label>
                  <input
                    id="otp-code"
                    type="text"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-accent tracking-widest text-center"
                    placeholder="000000"
                    autoComplete="one-time-code"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {submitting ? "Verifying…" : "Verify Code"}
                </button>
                <button
                  type="button"
                  onClick={() => { setOtpSent(false); setOtpCode(""); }}
                  className="w-full text-sm text-muted hover:text-foreground"
                >
                  Use a different email
                </button>
              </form>
            )
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <a href={`/sign-in${redirectTo !== "/" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`} className="text-accent hover:underline">
            Sign In
          </a>
        </p>
      </div>
    </div>
  );
}
