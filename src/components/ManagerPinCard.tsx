"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "./Toast";
import { SectionTitle } from "./ui/bits";

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/** Staff page: set or change the manager PIN. */
export function ManagerPinCard() {
  const toast = useToast();
  const [status, setStatus] = useState<{ set: boolean; locked: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ old: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc("pin_status");
    if (error) setUnavailable(true); else setStatus(data as { set: boolean; locked: boolean });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (unavailable) return null; // update 14 not installed yet

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(f.next)) return toast("The PIN must be 4 to 6 digits.", "error");
    if (f.next !== f.again) return toast("The two new PINs don't match.", "error");
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("set_manager_pin", { p_old: status?.set ? f.old : null, p_new: f.next });
    setBusy(false);
    const d = data as { ok: boolean; error?: string } | null;
    if (error || !d?.ok) return toast(error?.message ?? d?.error ?? "Could not save the PIN.", "error");
    toast(status?.set ? "Manager PIN changed." : "Manager PIN set.");
    setF({ old: "", next: "", again: "" });
    setOpen(false);
    load();
  }

  const pinInput = (k: keyof typeof f, label: string) => (
    <div>
      <label className="label" htmlFor={`pin-${k}`}>{label}</label>
      <input id={`pin-${k}`} type="password" inputMode="numeric" autoComplete="off" maxLength={6}
        className="input font-mono tracking-[0.3em]" value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: digits(e.target.value) }))} />
    </div>
  );

  return (
    <section className={`card p-5 sm:p-6 ${status && !status.set ? "ring-1 ring-amber-200" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle icon={<KeyRound />} title="Manager PIN"
          sub="Needed to delete a record, remove or restore a device, make a new QR code, remove staff, change the backup or the hotel network." />
        {status && !open && (
          <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
            <KeyRound /> {status.set ? "Change PIN" : "Set PIN"}
          </button>
        )}
      </div>

      {status && !open && (
        <p className={`mt-3 flex items-center gap-2 text-sm ${status.set ? "text-emerald-700" : "text-amber-800"}`}>
          {status.set ? <ShieldCheck className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
          {status.locked
            ? "Locked for 15 minutes after too many wrong PINs."
            : status.set ? "A manager PIN is set." : "No PIN set yet: anyone with the login can do these actions. Set one now."}
        </p>
      )}

      {open && (
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-3">
          {status?.set && pinInput("old", "Current PIN")}
          {pinInput("next", "New PIN (4–6 digits)")}
          {pinInput("again", "New PIN again")}
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />} Save PIN</button>
            <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setF({ old: "", next: "", again: "" }); }}>Cancel</button>
          </div>
          <p className="text-xs text-slate-500 sm:col-span-3">Forgot it? See &ldquo;Manager PIN&rdquo; in the README for the one-line reset in Supabase.</p>
        </form>
      )}
    </section>
  );
}
