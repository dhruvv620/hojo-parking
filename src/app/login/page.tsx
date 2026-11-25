"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { APP_NAME, HOTEL_NAME, LOT_CAPACITY } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-extrabold text-white">
            P
          </div>
          <h1 className="text-2xl font-bold">{HOTEL_NAME}</h1>
          <p className="text-slate-500">
            {APP_NAME} &middot; {LOT_CAPACITY} spots
          </p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required className="input"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required className="input"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" className="btn-primary w-full py-3 text-base" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          Need an account? Ask the manager to add you.
        </p>
      </div>
    </main>
  );
}
