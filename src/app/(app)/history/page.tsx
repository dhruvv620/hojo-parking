"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { csvRow } from "@/lib/csv";
import { supabaseBrowser } from "@/lib/supabase/client";
import { carLabel, leftAt, liveStatus, sourceLabel, type ParkingRecord } from "@/lib/types";
import { lotName, recordLot, vehicleLabel } from "@/lib/lots";
import { ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, History, LoaderCircle, Search, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Select } from "@/components/ui/Dropdown";
import { SortHeader } from "@/components/ui/SortHeader";
import { SORT_LABELS, loadSort, saveSort, type SortKey } from "@/lib/sort";

const HISTORY_SORTS: SortKey[] = ["checkin_desc", "checkin_asc", "left_desc", "name_asc", "name_desc", "lot"];
import { Avatar, EmptyState, LotChip, Plate } from "@/components/ui/bits";
import { DAY, fmtDateTime } from "@/lib/time";

const RANGES = [
  { label: "Last 7 days", days: 7, description: "This past week" },
  { label: "Last 30 days", days: 30, description: "This past month" },
  { label: "Last 90 days", days: 90, description: "This past quarter" },
  { label: "All time", days: 0, description: "Every record" },
];
const PAGE_SIZES = [25, 50, 100];

/** How each sort is done by the database (id last, so pages never overlap or skip). */
const ORDER: Partial<Record<SortKey, { col: string; asc: boolean }[]>> = {
  checkin_desc: [{ col: "arrival_at", asc: false }],
  checkin_asc: [{ col: "arrival_at", asc: true }],
  left_desc: [{ col: "left_at", asc: false }],
  name_asc: [{ col: "guest_name", asc: true }, { col: "arrival_at", asc: false }],
  name_desc: [{ col: "guest_name", asc: false }, { col: "arrival_at", asc: false }],
  lot: [{ col: "lot", asc: true }, { col: "arrival_at", asc: false }],
};

type Filters = { q: string; range: number; showAll: boolean };

/** Builds the History query: filters + sort. Same for the table and the CSV download. */
function historyQuery(f: Filters, sort: SortKey, hasLeftAt: boolean, count: boolean) {
  const now = new Date().toISOString();
  let query = supabaseBrowser().from("parking_records").select("*", count ? { count: "exact" } : undefined);
  const parts: string[] = [];
  if (!f.showAll) {
    // only stays that are over: manual check-out, auto check-out, or cancelled
    parts.push(`or(status.eq.checked_out,status.eq.cancelled,and(status.eq.parked,checkout_at.lte.${now}))`);
  }
  const term = f.q.trim().replace(/[,()%*\\"]/g, " ").trim();
  if (term) {
    const like = `"%${term}%"`;
    parts.push(`or(${["guest_name", "license_plate", "confirmation_number", "make", "model", "color", "room_number", "phone"].map((c) => `${c}.ilike.${like}`).join(",")})`);
  }
  if (parts.length) query = query.or(`and(${parts.join(",")})`);
  if (f.range > 0) query = query.gte("arrival_at", new Date(Date.now() - f.range * DAY).toISOString());
  for (const o of ORDER[sort] ?? ORDER.checkin_desc!) {
    // before update 9 there is no left_at: sort by planned check-out instead
    const col = o.col === "left_at" && !hasLeftAt ? "checkout_at" : o.col;
    query = query.order(col, { ascending: o.asc, nullsFirst: false });
  }
  return query.order("id", { ascending: true });
}

export default function HistoryPage() {
  const [rows, setRows] = useState<ParkingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [range, setRange] = useState(30);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSortState] = useState<SortKey>("checkin_desc");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLeftAt = useRef(true);
  const latest = useRef(0); // ignore answers to older requests (fast clicking)
  const toast = useToast();

  useEffect(() => {
    setSortState(loadSort("hojo.history.sort", "checkin_desc", HISTORY_SORTS));
    try { const n = Number(localStorage.getItem("hojo.history.pageSize")); if (PAGE_SIZES.includes(n)) setPageSize(n); } catch { /* ignore */ }
  }, []);
  const setSort = (k: SortKey) => { setSortState(k); saveSort("hojo.history.sort", k); };
  const changePageSize = (n: number) => { setPageSize(n); try { localStorage.setItem("hojo.history.pageSize", String(n)); } catch { /* ignore */ } };

  // any change to search / filters / sort goes back to page 1
  useEffect(() => { setPage(1); }, [q, range, showAll, sort, pageSize]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    const id = ++latest.current;
    const from = (page - 1) * pageSize;
    const run = () => historyQuery({ q, range, showAll }, sort, hasLeftAt.current, true).range(from, from + pageSize - 1);
    let { data, error, count } = await run();
    if (error && /left_at/.test(error.message) && hasLeftAt.current) {
      hasLeftAt.current = false;
      ({ data, error, count } = await run());
    }
    if (id !== latest.current) return;
    if (error) {
      // asked for a page past the end (e.g. after records changed): go to the last page
      if (/range|offset/i.test(error.message) && page > 1) { setPage(1); return; }
      setError(error.message);
    } else {
      setError(null);
      setRows((data as ParkingRecord[]) ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [q, range, showAll, sort, page, pageSize]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);

  /** CSV of every matching record (all pages), in the chosen order. */
  async function exportCsv() {
    setExporting(true);
    try {
      const all: ParkingRecord[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await historyQuery({ q, range, showAll }, sort, hasLeftAt.current, false).range(from, from + 999);
        if (error) throw new Error(error.message);
        all.push(...((data as ParkingRecord[]) ?? []));
        if (!data || data.length < 1000) break;
      }
      const head = ["Guest", "Confirmation #", "Phone", "Room", "Booked", "Vehicle", "Plate", "State", "Make", "Model", "Color", "Lot", "Status", "Arrived", "Days", "Leaves by", "Left", "Notes"];
      const now = Date.now();
      const lines = all.map((r) => csvRow([
        r.guest_name, r.confirmation_number, r.phone, r.room_number, sourceLabel(r.source), vehicleLabel(r.vehicle_type), r.license_plate, r.plate_state,
        r.make, r.model, r.color, lotName(recordLot(r)), liveStatus(r, now), fmtDateTime(r.arrival_at), r.days,
        fmtDateTime(r.checkout_at), fmtDateTime(leftAt(r)), r.notes,
      ]));
      const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `parking-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(`Downloaded ${all.length.toLocaleString()} record${all.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setExporting(false);
  }

  const now = Date.now();
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">History</h1>
          <p className="mt-1 text-sm text-slate-500">Every car that has come and gone.</p>
        </div>
        <button className="btn-secondary ml-auto" onClick={exportCsv} disabled={total === 0 || exporting}>
          {exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
          {exporting ? "Preparing..." : `Download CSV${total > 0 ? ` (${total.toLocaleString()})` : ""}`}
        </button>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input h-10 pl-9 pr-9 text-sm" placeholder="Search name, plate, conf #, car, room..."
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search history" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={range} onChange={setRange} icon={<CalendarDays className="h-4 w-4" />} className="w-48" ariaLabel="Date range"
          options={RANGES.map((r) => ({ value: r.days, label: r.label, description: r.description }))} />
        <Select value={sort} onChange={setSort} icon={<ArrowUpDown className="h-4 w-4" />} className="w-60" ariaLabel="Sort"
          options={HISTORY_SORTS.map((k) => ({ value: k, ...SORT_LABELS[k] }))} />
        <Switch checked={showAll} onChange={setShowAll} label="Include cars still here" />
        <span className="ml-auto text-sm tabular-nums text-slate-500">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : `${total.toLocaleString()} record${total === 1 ? "" : "s"}`}
        </span>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load history: {error}</p>}

      <div className="card overflow-hidden">
        <div className={`overflow-x-auto transition-opacity ${loading && rows.length ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50/95 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <SortHeader className="px-5 py-3" label="Guest" sort={sort} onSort={setSort} first="name_asc" second="name_desc" />
                <th className="px-3 py-3">Car</th>
                <SortHeader className="px-3 py-3" label="Lot" sort={sort} onSort={setSort} first="lot" />
                <SortHeader className="px-3 py-3" label="Checked in" sort={sort} onSort={setSort} first="checkin_desc" second="checkin_asc" />
                <SortHeader className="px-3 py-3" label="Left" sort={sort} onSort={setSort} first="left_desc" />
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 &&
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3"><div className="skeleton h-9" /></td>
                  </tr>
                ))}
              {rows.map((r) => {
                const s = liveStatus(r, now);
                const st = STATUS[s];
                return (
                  <tr key={r.id} className="group transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-5 py-3">
                      <Link href={`/cars/${r.id}`} className="flex items-center gap-3">
                        <Avatar name={r.guest_name} tone="slate" />
                        <span>
                          <span className="block font-semibold group-hover:text-brand-700">{r.guest_name}</span>
                          <span className="block text-xs text-slate-500">
                            {sourceLabel(r.source)}
                            {r.confirmation_number && ` · #${r.confirmation_number}`}
                            {r.room_number && ` · Room ${r.room_number}`}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Plate plate={r.license_plate} state={r.plate_state} />
                      <div className="mt-1 text-xs text-slate-500">{carLabel(r)}</div>
                    </td>
                    <td className="px-3 py-3"><LotChip lot={recordLot(r)} /></td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {fmtDateTime(r.arrival_at)}
                      <div className="text-xs text-slate-500">{r.days} day{r.days > 1 ? "s" : ""}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{s === "parked" || s === "upcoming" ? <span className="text-slate-300">-</span> : fmtDateTime(leftAt(r))}</td>
                    <td className="px-5 py-3">
                      <span className={`chip ${st.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && (
          <EmptyState icon={<History />} title="No records found" text={q ? "Try a different name or plate number." : "Try a longer date range."} />
        )}
        {total > 0 && (
          <Pager page={page} pages={pages} first={first} last={last} total={total}
            pageSize={pageSize} onPageSize={changePageSize} onPage={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        )}
      </div>
    </div>
  );
}

const STATUS = {
  parked: { text: "Parked", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  upcoming: { text: "Upcoming", cls: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  auto_out: { text: "Auto check-out", cls: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  checked_out: { text: "Checked out", cls: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  cancelled: { text: "Cancelled", cls: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="group flex items-center gap-2.5 rounded-lg py-1 text-sm font-medium text-slate-600 outline-none focus-visible:ring-4 focus-visible:ring-brand-200">
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${checked ? "bg-brand-600" : "bg-slate-200 group-hover:bg-slate-300"}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(16_24_40/0.25)] transition-transform duration-200 ease-out ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

/** "Showing 51–100 of 1,234", rows per page, and page buttons. */
function Pager({ page, pages, first, last, total, pageSize, onPage, onPageSize }: {
  page: number; pages: number; first: number; last: number; total: number; pageSize: number;
  onPage: (n: number) => void; onPageSize: (n: number) => void;
}) {
  // page numbers around the current one: 1 … 4 5 [6] 7 8 … 20
  const nums: (number | "…")[] = [];
  const from = Math.max(1, page - 2), to = Math.min(pages, page + 2);
  if (from > 1) nums.push(1);
  if (from > 2) nums.push("…");
  for (let n = from; n <= to; n++) nums.push(n);
  if (to < pages - 1) nums.push("…");
  if (to < pages) nums.push(pages);

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
      <span className="text-sm tabular-nums text-slate-500">
        Showing <b className="text-slate-800">{first.toLocaleString()}–{last.toLocaleString()}</b> of <b className="text-slate-800">{total.toLocaleString()}</b>
      </span>
      <span className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
        Rows per page
        <Select value={pageSize} onChange={onPageSize} className="btn-sm h-8 w-20" ariaLabel="Rows per page"
          options={PAGE_SIZES.map((n) => ({ value: n, label: String(n) }))} />
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button className="btn-ghost btn-sm btn-icon" onClick={() => onPage(1)} disabled={page === 1} aria-label="First page"><ChevronsLeft /></button>
        <button className="btn-ghost btn-sm btn-icon" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page"><ChevronLeft /></button>
        <span className="hidden items-center gap-1 sm:flex">
          {nums.map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-slate-400">…</span>
            ) : (
              <button key={n} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
                className={`h-8 min-w-8 rounded-lg px-2 text-sm font-semibold tabular-nums transition ${
                  n === page ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
                {n}
              </button>
            ),
          )}
        </span>
        <span className="px-2 text-sm tabular-nums text-slate-600 sm:hidden">Page {page} of {pages}</span>
        <button className="btn-ghost btn-sm btn-icon" onClick={() => onPage(page + 1)} disabled={page === pages} aria-label="Next page"><ChevronRight /></button>
        <button className="btn-ghost btn-sm btn-icon" onClick={() => onPage(pages)} disabled={page === pages} aria-label="Last page"><ChevronsRight /></button>
      </div>
    </nav>
  );
}
