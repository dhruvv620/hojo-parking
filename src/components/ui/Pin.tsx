"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "../Toast";
import { Modal } from "./Modal";

/**
 * Asks for the manager PIN before a risky action.
 *   const askPin = usePin();
 *   const pin = await askPin("Remove this device");
 *   if (pin === null) return;            // cancelled or locked
 *   rpc("...", { ..., p_pin: pin })      // "" when no PIN has been set yet
 * The database checks the PIN; this only collects it.
 */
type Ask = (action: string) => Promise<string | null>;
const Ctx = createContext<Ask>(async () => "");
export const usePin = () => useContext(Ctx);

export function PinProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [pending, setPending] = useState<{ action: string; resolve: (v: string | null) => void } | null>(null);
  const [pin, setPin] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const ask = useCallback<Ask>(async (action) => {
    const { data, error } = await supabaseBrowser().rpc("pin_status");
    if (error) return ""; // PIN feature not installed yet: carry on as before
    const st = data as { set: boolean; locked: boolean };
    if (!st.set) return "";
    if (st.locked) {
      toast("Too many wrong PINs. Try again in 15 minutes.", "error");
      return null;
    }
    setPin("");
    return new Promise<string | null>((resolve) => setPending({ action, resolve }));
  }, [toast]);

  useEffect(() => { if (pending) requestAnimationFrame(() => input.current?.focus()); }, [pending]);

  const finish = (v: string | null) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      {pending && (
        <Modal open onClose={() => finish(null)} icon={<KeyRound />} title="Manager PIN" subtitle={pending.action}
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => finish(null)}>Cancel</button>
              <button type="submit" form="pin-form" className="btn-primary" disabled={!/^\d{4,6}$/.test(pin)}>Continue</button>
            </>
          }>
          <form id="pin-form" onSubmit={(e) => { e.preventDefault(); if (/^\d{4,6}$/.test(pin)) finish(pin); }}>
            <label htmlFor="manager-pin" className="label">Enter the manager PIN to continue</label>
            <input ref={input} id="manager-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6}
              className="input text-center font-mono text-2xl tracking-[0.5em]" value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <p className="mt-2 text-xs text-slate-500">4 to 6 digits. After 5 wrong tries, PIN actions lock for 15 minutes.</p>
          </form>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

/** Turns a {ok, error} answer from the database into a message (or null when OK). */
export function pinResultError(data: unknown, error: { message: string } | null): string | null {
  if (error) return error.message;
  const d = data as { ok?: boolean; error?: string } | null;
  if (d && d.ok === false) return d.error ?? "Something went wrong.";
  return null;
}
