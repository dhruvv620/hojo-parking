"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, MonitorX, ShieldAlert } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { deviceLabel } from "@/lib/device";

type State = "checking" | "ok" | "pending" | "removed";

/**
 * Shows the app only to approved staff on a device that hasn't been removed.
 * Registers this device when the app opens and checks again every minute, so
 * a device removed on the Staff page is signed out within about a minute.
 * The database enforces the same rules; this screen just explains them.
 */
export function StaffGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const removedRef = useRef(false);

  const check = useCallback(async () => {
    if (removedRef.current) return; // stay on the "removed" screen
    const sb = supabaseBrowser();
    const reg = await sb.rpc("register_device", { p_label: deviceLabel(), p_user_agent: navigator.userAgent.slice(0, 400) });
    if (!reg.error) {
      const r = reg.data as { ok: boolean; reason?: string };
      if (r.ok) return setState("ok");
      if (r.reason === "removed") {
        removedRef.current = true;
        setState("removed");
        await sb.auth.signOut();
        return;
      }
      if (r.reason === "not_staff") return setState("pending");
    }
    // before the device update is installed: fall back to the staff check only
    const { data, error } = await sb.rpc("is_staff");
    setState(error || data ? "ok" : "pending");
  }, []);

  useEffect(() => {
    check();
    supabaseBrowser().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? null));
    const t = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => { clearInterval(t); window.removeEventListener("focus", check); };
  }, [check]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (state === "ok") return <>{children}</>;
  if (state === "checking") return <div className="mx-auto max-w-7xl px-4 py-8"><div className="skeleton h-40 rounded-2xl" /></div>;

  const removed = state === "removed";
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="card max-w-md p-8 text-center">
        <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${removed ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
          {removed ? <MonitorX className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
        </span>
        <h1 className="mt-4 text-xl font-bold">{removed ? "This device was removed" : "Waiting for approval"}</h1>
        {removed ? (
          <p className="mt-2 text-slate-600">
            This phone or computer can no longer use the parking app. If that&apos;s a mistake, ask someone at the front desk to
            restore it under <b>account menu → Staff → Devices</b>.
          </p>
        ) : (
          <p className="mt-2 text-slate-600">
            Your account{email ? <> (<b>{email}</b>)</> : null} isn&apos;t approved yet. Ask the manager to approve it in the app under
            <b> account menu → Staff</b>.
          </p>
        )}
        <button className="btn-secondary mt-6" onClick={signOut}>
          <LogOut /> {removed ? "Back to sign in" : "Sign out"}
        </button>
      </div>
    </main>
  );
}
