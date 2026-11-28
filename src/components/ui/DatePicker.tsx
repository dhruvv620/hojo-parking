"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Portal, useDismiss, useFloatingPosition } from "./Dropdown";

const WEEKDAYS = { en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"], es: ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"] };
const MINUTES = [0, 15, 30, 45];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
const addDaysTo = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

type Props = {
  value: Date;
  onChange: (d: Date) => void;
  /** "datetime" lets you pick a time too; "date" keeps the current time of day. */
  mode?: "datetime" | "date";
  /** Days before this are greyed out. */
  minDate?: Date;
  /** Custom trigger look. Gets the open state. */
  renderTrigger?: (p: { open: boolean; label: string }) => React.ReactNode;
  triggerClassName?: string;
  ariaLabel?: string;
  /** Extra line at the bottom of the calendar, e.g. "3 days". */
  footer?: (d: Date) => React.ReactNode;
  /** Language for month and day names (the guest form can be in Spanish). */
  lang?: "en" | "es";
};

export function DatePicker({ value, onChange, mode = "datetime", minDate, renderTrigger, triggerClassName, ariaLabel, footer, lang = "en" }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const [focusDay, setFocusDay] = useState(value);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { style, panelRef } = useFloatingPosition(open, btnRef, "start", false);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [btnRef, panelRef]);

  useEffect(() => {
    if (open) {
      setView(new Date(value.getFullYear(), value.getMonth(), 1));
      setFocusDay(value);
      requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-focus=true]")?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = value.toLocaleString(lang === "es" ? "es-US" : "en-US", mode === "datetime"
    ? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { weekday: "short", month: "short", day: "numeric" });

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [view]);

  const minDay = minDate ? startOfDay(minDate) : null;
  const isDisabled = (d: Date) => !!minDay && startOfDay(d) < minDay;
  const today = new Date();

  function pickDay(d: Date) {
    if (isDisabled(d)) return;
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), value.getHours(), value.getMinutes());
    onChange(next);
    if (mode === "date") {
      setOpen(false);
      btnRef.current?.focus();
    }
  }

  function setTime(h24: number, m: number) {
    onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), h24, m));
  }

  function moveFocus(n: number) {
    const next = addDaysTo(focusDay, n);
    setFocusDay(next);
    if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear())
      setView(new Date(next.getFullYear(), next.getMonth(), 1));
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-focus=true]")?.focus());
  }

  function onGridKey(e: React.KeyboardEvent) {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in map) { e.preventDefault(); moveFocus(map[e.key]); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickDay(focusDay); }
  }

  const hour12 = value.getHours() % 12 || 12;
  const pm = value.getHours() >= 12;
  const to24 = (h12: number, isPm: boolean) => (h12 % 12) + (isPm ? 12 : 0);

  return (
    <>
      <button ref={btnRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName ?? `input flex items-center gap-2 text-left ${open ? "!border-brand-500 !shadow-[0_0_0_4px_rgb(59_110_245/0.14)]" : ""}`}>
        {renderTrigger ? renderTrigger({ open, label }) : (
          <>
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{label}</span>
          </>
        )}
      </button>

      {open && (
        <Portal>
          <div ref={panelRef} role="dialog" aria-label="Choose a date" style={style}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } }}
            className="menu-panel w-[19.5rem] !p-3">
            {/* month header */}
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="Previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-90">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-bold text-slate-900">
                {view.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", year: "numeric" })}
              </div>
              <button type="button" aria-label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-90">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* day grid */}
            <div className="grid grid-cols-7 gap-0.5 text-center" role="grid" onKeyDown={onGridKey}>
              {WEEKDAYS[lang].map((w) => (
                <div key={w} className="pb-1 text-[11px] font-semibold uppercase text-slate-400">{w}</div>
              ))}
              {days.map((d) => {
                const selected = sameDay(d, value);
                const outside = d.getMonth() !== view.getMonth();
                const disabled = isDisabled(d);
                const isToday = sameDay(d, today);
                const focus = sameDay(d, focusDay);
                return (
                  <button key={d.toISOString()} type="button" role="gridcell" aria-selected={selected} disabled={disabled}
                    tabIndex={focus ? 0 : -1} data-focus={focus}
                    onClick={() => { setFocusDay(d); pickDay(d); }}
                    className={`relative flex h-9 items-center justify-center rounded-lg text-sm tabular-nums outline-none transition duration-100
                      focus-visible:ring-2 focus-visible:ring-brand-300
                      ${selected
                        ? "bg-brand-600 font-bold text-white shadow-md shadow-brand-600/30"
                        : disabled
                          ? "cursor-not-allowed text-slate-300"
                          : outside
                            ? "text-slate-300 hover:bg-slate-50"
                            : "font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 active:scale-90"}`}>
                    {d.getDate()}
                    {isToday && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand-500" />}
                  </button>
                );
              })}
            </div>

            {/* time */}
            {mode === "datetime" && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Clock className="h-3.5 w-3.5" /> Time
                </div>
                <div className="flex items-center gap-2">
                  <select aria-label="Hour" value={hour12} onChange={(e) => setTime(to24(Number(e.target.value), pm), value.getMinutes())}
                    className="h-9 flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold tabular-nums outline-none transition hover:border-slate-300 focus:border-brand-500">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="font-bold text-slate-400">:</span>
                  <select aria-label="Minute" value={MINUTES.includes(value.getMinutes()) ? value.getMinutes() : value.getMinutes()}
                    onChange={(e) => setTime(value.getHours(), Number(e.target.value))}
                    className="h-9 flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold tabular-nums outline-none transition hover:border-slate-300 focus:border-brand-500">
                    {[...new Set([...MINUTES, value.getMinutes()])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                    ))}
                  </select>
                  <div className="flex rounded-lg bg-slate-100 p-0.5">
                    {(["AM", "PM"] as const).map((p) => {
                      const active = (p === "PM") === pm;
                      return (
                        <button key={p} type="button" onClick={() => setTime(to24(hour12, p === "PM"), value.getMinutes())}
                          className={`h-8 rounded-md px-2.5 text-xs font-bold transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* footer */}
            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
              {footer ? <div className="flex-1 text-xs text-slate-500">{footer(value)}</div> : (
                <button type="button" className="btn-ghost btn-sm"
                  onClick={() => { const n = new Date(); pickDay(isDisabled(n) ? (minDate ?? n) : n); setView(new Date(n.getFullYear(), n.getMonth(), 1)); }}>
                  Today
                </button>
              )}
              <button type="button" className="btn-primary btn-sm ml-auto" onClick={() => { setOpen(false); btnRef.current?.focus(); }}>
                {lang === "es" ? "Listo" : "Done"}
              </button>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
