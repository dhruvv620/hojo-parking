"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; text: string; kind: "ok" | "warn" | "error" };
const Ctx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "ok" ? 3500 : 7000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id}
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === "ok" ? "bg-slate-900 text-white" : t.kind === "warn" ? "bg-amber-500 text-white" : "bg-red-600 text-white"
            }`}>
            {t.text}
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
