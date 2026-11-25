"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CircleCheck, CircleX, TriangleAlert, X } from "lucide-react";

type Kind = "ok" | "warn" | "error";
type Toast = { id: number; text: string; kind: Kind };
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});

const STYLE: Record<Kind, { icon: React.ReactNode; bar: string }> = {
  ok: { icon: <CircleCheck className="h-5 w-5 text-emerald-500" />, bar: "bg-emerald-500" },
  warn: { icon: <TriangleAlert className="h-5 w-5 text-amber-500" />, bar: "bg-amber-500" },
  error: { icon: <CircleX className="h-5 w-5 text-red-500" />, bar: "bg-red-500" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (text: string, kind: Kind = "ok") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, text, kind }]);
      setTimeout(() => dismiss(id), kind === "ok" ? 3500 : 7000);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className="pointer-events-auto relative flex w-full max-w-sm animate-rise items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-3 shadow-xl">
            <span className={`absolute inset-y-0 left-0 w-1 ${STYLE[t.kind].bar}`} />
            {STYLE[t.kind].icon}
            <p className="flex-1 pt-0.5 text-sm font-medium text-slate-800">{t.text}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss"
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/** Runs an action and shows the result as a toast. */
export function useRun() {
  const toast = useToast();
  return useCallback(
    async (p: Promise<{ ok: true; note?: string } | { ok: false; error: string }>, success: string) => {
      const res = await p;
      if (!res.ok) toast(res.error, "error");
      else if (res.note) toast(res.note, "warn");
      else toast(success);
      return res.ok;
    },
    [toast],
  );
}
