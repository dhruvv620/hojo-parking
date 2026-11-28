"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Portal } from "./Dropdown";

/** Centered pop-up window (slides up from the bottom on phones). */
export function Modal({ open, onClose, title, subtitle, icon, children, footer, wide }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
        <div className="fixed-colors absolute inset-0 animate-fade bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
        <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
          className={`relative flex max-h-[92vh] w-full animate-dialog flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
          <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            {icon && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
              {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="-mr-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:justify-end sm:rounded-b-2xl sm:px-6">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
