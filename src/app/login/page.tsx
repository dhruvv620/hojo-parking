"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CircleAlert, Eye, EyeOff, LoaderCircle, Lock, Mail, ShieldCheck, SquareParking, Zap } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { APP_NAME, HOTEL_NAME, LOT_CAPACITY } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
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
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
            <SquareParking className="h-6 w-6" />
          </span>
          <div className="leading-tight">
            <div className="font-bold">{HOTEL_NAME}</div>
            <div className="text-sm text-brand-100">{APP_NAME}</div>
          </div>
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Every car in the lot, at a glance.</h2>
          <ul className="mt-8 space-y-4 text-brand-50">
            <Feature icon={<SquareParking />} text={`Live count of all ${LOT_CAPACITY} spots inside the fence`} />
            <Feature icon={<Zap />} text="Spots free up automatically when paid time ends" />
            <Feature icon={<CalendarClock />} text="Upcoming reservations and returning guests" />
          </ul>
        </div>
      </div>

      {/* form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
              <SquareParking className="h-6 w-6" />
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome back</h1>
          <p className="mt-1.5 text-slate-500">Sign in to manage {HOTEL_NAME} parking.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="email" type="email" autoComplete="username" required className="input pl-9" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="password" type={show ? "text" : "password"} autoComplete="current-password" required className="input pl-9 pr-11"
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="flex animate-rise items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <CircleAlert className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            <button type="submit" className="btn-primary btn-lg w-full" disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" />}
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Staff only. Ask the manager for an account.
          </p>
        </div>
      </div>
    </main>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {text}
    </li>
  );
}
