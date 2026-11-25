"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { carLabel, leftAt, liveStatus, type ParkingRecord } from "@/lib/types";
import { DAY, fmtDateTime } from "@/lib/time";

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 0 },
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
        `or(${["guest_name", "license_plate", "make", "model", "color", "room_number", "phone"].map((c) => `${c}.ilike.${like}`).join(",")})`,
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
    const head = ["Guest", "Phone", "Room", "Booked", "Plate", "State", "Make", "Model", "Color", "Where", "Status", "Arrived", "Days", "Leaves by", "Left", "Notes"];
    const now = Date.now();
    const lines = rows.map((r) => [
      r.guest_name, r.phone, r.room_number, r.source === "online" ? "Online" : "Walk-in", r.license_plate, r.plate_state,
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
          <h1 className="text-2xl font-bold">History</h1>
          <p className="text-sm text-slate-500">Every car that has come and gone.</p>
        </div>
        <button className="btn-secondary ml-auto" onClick={exportCsv} disabled={rows.length === 0}>Download CSV</button>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <input className="input max-w-sm py-2 text-sm" placeholder="Search name, plate, car, room, phone..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto py-2 text-sm" value={range} onChange={(e) => setRange(Number(e.target.value))}>
          {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4" />
          Include cars still here and upcoming
        </label>
        <span className="ml-auto text-sm text-slate-500">{loading ? "Loading..." : `${rows.length} records`}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Guest</th>
              <th className="px-3 py-3">Car</th>
              <th className="px-3 py-3">Where</th>
              <th className="px-3 py-3">Arrived</th>
              <th className="px-3 py-3">Left</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const s = liveStatus(r, now);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/cars/${r.id}`} className="font-semibold hover:text-brand-600">{r.guest_name}</Link>
                    <div className="text-xs text-slate-500">{r.source === "online" ? "Online" : "Walk-in"}{r.room_number && ` · Room ${r.room_number}`}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-mono font-semibold">{r.license_plate}</div>
                    <div className="text-xs text-slate-500">{carLabel(r)}</div>
                  </td>
                  <td className="px-3 py-3 capitalize">{r.location}</td>
                  <td className="whitespace-nowrap px-3 py-3">{fmtDateTime(r.arrival_at)}<div className="text-xs text-slate-500">{r.days} day{r.days > 1 ? "s" : ""}</div></td>
                  <td className="whitespace-nowrap px-3 py-3">{s === "parked" || s === "upcoming" ? "-" : fmtDateTime(leftAt(r))}</td>
                  <td className="px-3 py-3">
                    <span className={`chip ${
                      s === "parked" ? "bg-emerald-50 text-emerald-700"
                      : s === "upcoming" ? "bg-violet-50 text-violet-700"
                      : s === "cancelled" ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-700"}`}>
                      {{ parked: "Parked", upcoming: "Upcoming", auto_out: "Auto check-out", checked_out: "Checked out", cancelled: "Cancelled" }[s]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-slate-500">No records found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
