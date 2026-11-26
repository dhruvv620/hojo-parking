"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Shows the app only to approved staff. A new account that hasn't been
 * approved yet (account menu > Staff) sees a "waiting for approval" screen.
 * The database enforces the same rule, so this is only for a clear message.
 */
export function StaffGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "pending">("checking");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.rpc("is_staff").then(({ data, error }: { data: boolean | null; error: unknown }) => {
      // before the security update is installed there is no is_staff(): allow, as before
      setState(error || data ? "ok" : "pending");
    });
    sb.auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? null));
  }, []);

  if (state === "ok") return <>{children}</>;
  if (state === "checking") return <div className="mx-auto max-w-7xl px-4 py-8"><div className="skeleton h-40 rounded-2xl" /></div>;

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><ShieldAlert className="h-6 w-6" /></span>
        <h1 className="mt-4 text-xl font-bold">Waiting for approval</h1>
        <p className="mt-2 text-slate-600">
          Your account{email ? <> (<b>{email}</b>)</> : null} isn&apos;t approved yet. Ask the manager to approve it in the app under
          <b> account menu → Staff</b>.
        </p>
        <button className="btn-secondary mt-6" onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace("/login"); router.refresh(); }}>
          <LogOut /> Sign out
        </button>
      </div>
    </main>
  );
}
