"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { carLabel, leftAt, liveStatus, type ParkingRecord } from "@/lib/types";
import { CalendarDays, Download, History, LoaderCircle, Search, X } from "lucide-react";
import { Select } from "@/components/ui/Dropdown";
import { Avatar, EmptyState, Plate } from "@/components/ui/bits";
import { DAY, fmtDateTime } from "@/lib/time";

const RANGES = [
  { label: "Last 7 days", days: 7, description: "This past week" },
  { label: "Last 30 days", days: 30, description: "This past month" },
  { label: "Last 90 days", days: 90, description: "This past quarter" },
  { label: "All time", days: 0, description: "Every record" },
];

export default function HistoryPage() {
  const [rows, setRows] = useState<ParkingRecord[]>([]);
  const [q, setQ] = useState("");
  const [range, setRange] = useState(30);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date().toISOString();
    let query = supabaseBrowser().from("parking_records").select("*").order("arrival_at", { ascending: false }).limit(1000);
    const filters: string[] = [];
    if (!showAll) {
      // only stays that are over: manual check-out, auto check-out, or cancelled
      filters.push(`or(status.eq.checked_out,status.eq.cancelled,and(status.eq.parked,checkout_at.lte.${now}))`);
    }
    const term = q.trim().replace(/[,()%*\\"]/g, " ").trim();
    if (term) {
      const like = `"%${term}%"`;
      filters.push(
        `or(${["guest_name", "license_plate", "confirmation_number", "make", "model", "color", "room_number", "phone"].map((c) => `${c}.ilike.${like}`).join(",")})`,
      );
    }
    if (filters.length) query = query.or(`and(${filters.join(",")})`);
    if (range > 0) query = query.gte("arrival_at", new Date(Date.now() - range * DAY).toISOString());
    const { data } = await query;
    setRows((data as ParkingRecord[]) ?? []);
    setLoading(false);
  }, [q, range, showAll]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function exportCsv() {
    const head = ["Guest", "Confirmation #", "Phone", "Room", "Booked", "Plate", "State", "Make", "Model", "Color", "Where", "Status", "Arrived", "Days", "Leaves by", "Left", "Notes"];
    const now = Date.now();
    const lines = rows.map((r) => [
      r.guest_name, r.confirmation_number, r.phone, r.room_number, r.source === "online" ? "Online" : "Walk-in", r.license_plate, r.plate_state,
      r.make, r.model, r.color, r.location, liveStatus(r, now), fmtDateTime(r.arrival_at), r.days,
      fmtDateTime(r.checkout_at), fmtDateTime(leftAt(r)), r.notes,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `parking-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const now = Date.now();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">History</h1>
          <p className="mt-1 text-sm text-slate-500">Every car that has come and gone.</p>
        </div>
        <button className="btn-secondary ml-auto" onClick={exportCsv} disabled={rows.length === 0}>
          <Download /> Download CSV
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
        <Switch checked={showAll} onChange={setShowAll} label="Include cars still here" />
        <span className="ml-auto text-sm tabular-nums text-slate-500">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50/95 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Guest</th>
                <th className="px-3 py-3">Car</th>
                <th className="px-3 py-3">Where</th>
                <th className="px-3 py-3">Arrived</th>
                <th className="px-3 py-3">Left</th>
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
                            {r.source === "online" ? "Online" : "Walk-in"}
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
                    <td className="px-3 py-3 capitalize text-slate-600">{r.location}</td>
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
