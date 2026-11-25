"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Floating panel: rendered on <body> so tables/cards never clip it.  */
/* ------------------------------------------------------------------ */

type Align = "start" | "end";

export function useFloatingPosition(open: boolean, trigger: React.RefObject<HTMLElement | null>, align: Align, matchWidth: boolean) {
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", top: -9999, left: -9999 });
  const panelRef = useRef<HTMLDivElement>(null);

  const update = useCallback(() => {
    const t = trigger.current;
    const p = panelRef.current;
    if (!t || !p) return;
    const r = t.getBoundingClientRect();
    const width = matchWidth ? r.width : p.offsetWidth;
    const height = p.offsetHeight;
    const gap = 6;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < height + gap + 8 && r.top > spaceBelow;
    let left = align === "end" ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setStyle({
      position: "fixed",
      top: openUp ? r.top - height - gap : r.bottom + gap,
      left,
      width: matchWidth ? r.width : undefined,
      zIndex: 60,
      transformOrigin: openUp ? "bottom" : "top",
    });
  }, [trigger, align, matchWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  return { style, panelRef };
}

export function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close, refs]);
}

// Menus only open after a click, so document always exists here.
export function Portal({ children }: { children: React.ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}

/* ------------------------------------------------------------------ */
/* Action menu (e.g. the "..." button on a row)                        */
/* ------------------------------------------------------------------ */

export type MenuItem = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hint?: string;
  hidden?: boolean;
  divider?: boolean;
};

export function Menu({
  children,
  triggerClassName = "btn-ghost btn-icon btn-sm",
  items,
  align = "end",
  label = "More actions",
  header,
}: {
  children: React.ReactNode;
  triggerClassName?: string;
  items: MenuItem[];
  align?: Align;
  label?: string;
  header?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { style, panelRef } = useFloatingPosition(open, btnRef, align, false);
  const visible = items.filter((i) => !i.hidden);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [btnRef, panelRef]);
  const id = useId();

  useEffect(() => {
    if (open) {
      setActive(0);
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [open, panelRef]);

  function choose(i: number) {
    const item = visible[i];
    if (!item) return;
    setOpen(false);
    btnRef.current?.focus();
    item.onSelect();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % visible.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + visible.length) % visible.length); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(visible.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); btnRef.current?.focus(); }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
        }}
        className={`${triggerClassName} ${open ? "!bg-slate-100" : ""}`}
      >
        {children}
      </button>
      {open && (
        <Portal>
          <div ref={panelRef} id={id} role="menu" tabIndex={-1} style={style} onKeyDown={onKeyDown}
            className="menu-panel min-w-52 outline-none">
            {header}
            {visible.map((item, i) => (
              <div key={item.label}>
                {item.divider && <div className="my-1 h-px bg-slate-100" />}
                <button type="button" role="menuitem" tabIndex={-1}
                  data-active={active === i} data-danger={item.danger ?? false}
                  onMouseEnter={() => setActive(i)} onClick={() => choose(i)} className="menu-item">
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.hint && <span className="text-xs text-slate-400">{item.hint}</span>}
                </button>
              </div>
            ))}
          </div>
        </Portal>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Select (a nicer replacement for <select>)                           */
/* ------------------------------------------------------------------ */

export type SelectOption<T extends string | number> = { value: T; label: string; description?: string };

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  icon,
  className = "",
  ariaLabel,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  icon?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { style, panelRef } = useFloatingPosition(open, btnRef, "start", true);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [btnRef, panelRef]);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [open, options, value, panelRef]);

  function choose(i: number) {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    btnRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); btnRef.current?.focus(); }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); }
        }}
        className={`btn-secondary justify-between ${className}`}
      >
        <span className="flex items-center gap-2 truncate">
          {icon && <span className="text-slate-400">{icon}</span>}
          {current?.label ?? "Select"}
        </span>
        <ChevronDown className={`text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <Portal>
          <div ref={panelRef} id={id} role="listbox" tabIndex={-1} style={{ ...style, minWidth: 200 }}
            onKeyDown={onKeyDown} className="menu-panel outline-none">
            {options.map((o, i) => {
              const selected = o.value === value;
              return (
                <button key={String(o.value)} type="button" role="option" aria-selected={selected} tabIndex={-1}
                  data-active={active === i} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
                  className="menu-item">
                  <span className="flex-1">
                    <span className={`block ${selected ? "font-semibold text-brand-700" : ""}`}>{o.label}</span>
                    {o.description && <span className="block text-xs text-slate-500">{o.description}</span>}
                  </span>
                  {selected && <Check className="!text-brand-600" />}
                </button>
              );
            })}
          </div>
        </Portal>
      )}
    </>
  );
}
