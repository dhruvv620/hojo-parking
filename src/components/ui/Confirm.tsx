"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CircleAlert, LogOut, TriangleAlert } from "lucide-react";

type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
  icon?: "warning" | "danger" | "checkout";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** const confirm = useConfirm(); if (await confirm({ title: "..." })) { ... } */
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })),
    [],
  );

  const close = useCallback((ok: boolean) => {
    setPending((p) => {
      p?.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  const danger = pending?.tone === "danger";
  const Icon = pending?.icon === "checkout" ? LogOut : danger ? TriangleAlert : CircleAlert;

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="presentation">
          <div className="absolute inset-0 animate-fade bg-slate-900/40 backdrop-blur-[2px]" onClick={() => close(false)} />
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
            className="relative w-full max-w-md animate-dialog rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-100 text-red-600" : "bg-brand-100 text-brand-600"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 id="confirm-title" className="text-lg font-bold text-slate-900">{pending.title}</h2>
                {pending.message && <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{pending.message}</div>}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => close(false)}>
                {pending.cancelText ?? "Cancel"}
              </button>
              <button ref={confirmBtn} type="button" className={danger ? "btn-danger-solid" : "btn-primary"} onClick={() => close(true)}>
                {pending.confirmText ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
