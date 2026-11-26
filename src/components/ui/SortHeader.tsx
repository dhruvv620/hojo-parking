"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortKey } from "@/lib/sort";

/**
 * Clickable table heading. First click sorts by `first`, the next click by
 * `second` (the other direction).
 */
export function SortHeader({ label, sort, onSort, first, second, className = "" }: {
  label: string;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  first: SortKey;
  second?: SortKey;
  className?: string;
}) {
  const active = sort === first || sort === second;
  const isFirst = sort === first;
  const down = first.endsWith("_desc") ? isFirst : !isFirst;
  return (
    <th className={className} aria-sort={active ? (down ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(isFirst && second ? second : first)}
        className={`group inline-flex items-center gap-1 rounded-md py-0.5 uppercase tracking-wider transition hover:text-slate-900 ${active ? "text-slate-900" : ""}`}>
        {label}
        {active
          ? (down ? <ArrowDown className="h-3 w-3 text-brand-600" /> : <ArrowUp className="h-3 w-3 text-brand-600" />)
          : <ArrowUpDown className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />}
      </button>
    </th>
  );
}
