"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { carLabel, liveStatus, type ParkingRecord } from "@/lib/types";
import { fmtDateTime, fmtDay } from "@/lib/time";

export type Customer = {
  guest_name: string;
  phone: string | null;
  license_plate: string;
  plate_state: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  visits: number;
  lastVisit: string;
};

type Props = {
  query: string;
  onPick: (c: Customer) => void;
};

/**
 * Drop-down under the name / plate / confirmation field on the Add Car form.
 * Shows reservations waiting for this person, cars already in the lot, and
 * returning customers whose details can be filled in with one click.
 */
export function CustomerSuggest({ query, onPick }: Props) {
  const [rows, setRows] = useState<ParkingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const term = query.trim().replace(/[,()%*\\"]/g, " ").trim();

  useEffect(() => {
    if (term.length < 2) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const like = `"%${term}%"`;
      const { data } = await supabaseBrowser()
        .from("parking_records")
        .select("*")
        .or(["guest_name", "license_plate", "confirmation_number", "phone"].map((c) => `${c}.ilike.${like}`).join(","))
        .neq("status", "cancelled")
        .order("arrival_at", { ascending: false })
        .limit(60);
      if (!cancelled) {
        setRows((data as ParkingRecord[]) ?? []);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  if (term.length < 2) return null;

  const now = Date.now();
  const reservations = rows.filter((r) => r.status === "reserved");
  const hereNow = rows.filter((r) => liveStatus(r, now) === "parked");

  // One entry per car (plate), using the most recent visit's details.
  const byPlate = new Map<string, Customer>();
  for (const r of rows) {
    if (r.status === "reserved") continue;
    const key = r.license_plate.replace(/\s/g, "");
    const existing = byPlate.get(key);
    if (existing) existing.visits += 1;
    else
      byPlate.set(key, {
        guest_name: r.guest_name, phone: r.phone, license_plate: r.license_plate, plate_state: r.plate_state,
        make: r.make, model: r.model, color: r.color, visits: 1, lastVisit: r.arrival_at,
      });
  }
  const customers = [...byPlate.values()].slice(0, 6);

  if (!loading && rows.length === 0) {
    return (
      <Panel>
        <p className="px-4 py-3 text-sm text-slate-500">New customer. No past visits found.</p>
      </Panel>
    );
  }
  if (rows.length === 0) return null;

  return (
    <Panel>
      {reservations.length > 0 && (
        <Group title="Reservation waiting" tone="text-violet-700">
          {reservations.slice(0, 4).map((r) => (
            <Link key={r.id} href={`/cars/${r.id}`} onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.guest_name}</div>
                <div className="truncate text-xs text-slate-500">
                  {fmtDay(r.arrival_at)} · {r.days} day{r.days > 1 ? "s" : ""}
                  {r.confirmation_number && ` · Conf# ${r.confirmation_number}`} · {r.license_plate}
                </div>
              </div>
              <span className="chip bg-violet-600 text-white">Open &amp; check in</span>
            </Link>
          ))}
        </Group>
      )}

      {hereNow.length > 0 && (
        <Group title="Already in the lot" tone="text-amber-700">
          {hereNow.slice(0, 3).map((r) => (
            <Link key={r.id} href={`/cars/${r.id}`} onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.guest_name} · <span className="font-mono">{r.license_plate}</span></div>
                <div className="truncate text-xs text-slate-500">Parked {r.location} · leaves {fmtDateTime(r.checkout_at)}</div>
              </div>
              <span className="chip bg-amber-100 text-amber-800">Open</span>
            </Link>
          ))}
        </Group>
      )}

      {customers.length > 0 && (
        <Group title="Returning customer: click to fill in" tone="text-brand-700">
          {customers.map((c) => (
            <button key={c.license_plate} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {c.guest_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {c.guest_name} <span className="font-mono text-sm font-medium text-slate-600">{c.license_plate}{c.plate_state && ` ${c.plate_state}`}</span>
                </div>
                <div className="truncate text-xs text-slate-500">
                  {carLabel(c)} · {c.visits} visit{c.visits > 1 ? "s" : ""} · last {fmtDay(c.lastVisit)}
                </div>
              </div>
              <span className="chip bg-brand-600 text-white">Use</span>
            </button>
          ))}
        </Group>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
      {children}
    </div>
  );
}

function Group({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className={`px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide ${tone}`}>{title}</div>
      {children}
    </div>
  );
}
