"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CircleCheck, CircleX, TriangleAlert, Undo2, X } from "lucide-react";

type Kind = "ok" | "warn" | "error";
type Action = { label: string; run: () => void };
type Toast = { id: number; text: string; kind: Kind; action?: Action; ms: number };
type Push = (text: string, kind?: Kind, action?: Action) => void;
const Ctx = createContext<Push>(() => {});

/** How long an Undo button stays on screen. */
export const UNDO_MS = 10_000;

const STYLE: Record<Kind, { icon: React.ReactNode; bar: string }> = {
  ok: { icon: <CircleCheck className="h-5 w-5 text-emerald-500" />, bar: "bg-emerald-500" },
  warn: { icon: <TriangleAlert className="h-5 w-5 text-amber-500" />, bar: "bg-amber-500" },
  error: { icon: <CircleX className="h-5 w-5 text-red-500" />, bar: "bg-red-500" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<Push>(
    (text, kind = "ok", action) => {
      const id = Date.now() + Math.random();
      const ms = action ? UNDO_MS : kind === "ok" ? 3500 : 7000;
      setToasts((t) => [...t.slice(-3), { id, text, kind, action, ms }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end print:hidden">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className="toast pointer-events-auto relative flex w-full max-w-sm animate-rise items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-3 shadow-xl">
            <span className={`absolute inset-y-0 left-0 w-1 ${STYLE[t.kind].bar}`} />
            {STYLE[t.kind].icon}
            <p className="flex-1 pt-0.5 text-sm font-medium text-slate-800">{t.text}</p>
            {t.action && (
              <button onClick={() => { dismiss(t.id); t.action!.run(); }}
                className="-my-0.5 inline-flex h-7 shrink-0 items-center gap-1 fixed-colors rounded-lg bg-slate-900 px-2.5 text-xs font-bold text-white transition hover:bg-slate-700 active:scale-95 [&>svg]:h-3.5 [&>svg]:w-3.5">
                <Undo2 /> {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss"
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
            {t.action && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-slate-300 undo-timer"
                style={{ animationDuration: `${t.ms}ms` }} />
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

type Result = { ok: true; note?: string } | { ok: false; error: string };

/**
 * Runs an action and shows the result as a toast. Pass `undo` to put an Undo
 * button on the toast for 10 seconds; `after` runs once the undo is done.
 */
export function useRun() {
  const toast = useToast();
  return useCallback(
    async (p: Promise<Result>, success: string, opts?: { undo?: () => Promise<Result>; after?: () => void }) => {
      const res = await p;
      const undo = opts?.undo
        ? {
            label: "Undo",
            run: async () => {
              const u = await opts.undo!();
              toast(u.ok ? "Undone." : u.error, u.ok ? "ok" : "error");
              opts.after?.();
            },
          }
        : undefined;
      if (!res.ok) toast(res.error, "error");
      else if (res.note) toast(res.note, "warn", undo);
      else toast(success, "ok", undo);
      return res.ok;
    },
    [toast],
  );
}
