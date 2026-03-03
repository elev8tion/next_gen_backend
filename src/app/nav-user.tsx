"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export function NavUser() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/get-session", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  if (!user) {
    return (
      <a
        href="/sign-in"
        className="rounded-md border border-card-border px-3 py-1 text-xs font-medium transition-colors hover:border-accent/30 hover:bg-accent/10"
      >
        Sign In
      </a>
    );
  }

  async function handleSignOut() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    });
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted">{user.name || user.email}</span>
      <button
        onClick={handleSignOut}
        className="rounded-md border border-card-border px-3 py-1 text-xs font-medium transition-colors hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
      >
        Sign Out
      </button>
    </div>
  );
}
