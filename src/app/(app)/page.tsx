"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParking } from "@/lib/useParking";
import { LOT_CAPACITY } from "@/lib/config";
import { carLabel, type ParkingRecord } from "@/lib/types";
import { DAY, fmtDateTime, fmtDay, fmtDuration, fmtTime, sameDay, startOfDay } from "@/lib/time";
import { checkOutNow, extend, markArrived, moveTo } from "@/lib/actions";
import { useRun } from "@/components/Toast";

export default function Dashboard() {
  const p = useParking();
  const runAction = useRun();
  // refresh right away after any button, without waiting for the live update
  const run: typeof runAction = async (action, msg) => {
    const ok = await runAction(action, msg);
    p.reload();
    return ok;
  };

  if (p.loading) {
    return <div className="py-20 text-center text-slate-500">Loading the lot...</div>;
  }

  return (
    <div className="space-y-6">
      {p.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load data: {p.error}
        </div>
      )}

      {p.isFull && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-red-600 px-5 py-4 text-white shadow">
          <span className="text-2xl font-extrabold tracking-wide">LOT FULL</span>
          <span className="text-red-100">
            All {LOT_CAPACITY} inside spots are taken. New cars will be logged as parking outside the fence.
          </span>
        </div>
      )}

      <Stats inside={p.inside.length} available={p.available} outside={p.outside.length} upcomingToday={
        p.upcoming.filter((r) => new Date(r.arrival_at).getTime() < startOfDay(p.now).getTime() + DAY).length
      } />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <LotGrid inside={p.inside} now={p.now} />
          <ParkedTable parked={p.parked} now={p.now} lotFull={p.isFull}
            onCheckOut={(r) => run(checkOutNow(r), `${r.guest_name} checked out. Spot is free.`)}
            onMove={(r, loc) => run(moveTo(r, loc), loc === "inside" ? "Moved inside the fence." : "Moved outside the fence.")}
          />
        </div>

        <aside className="space-y-6">
          <UpcomingPanel upcoming={p.upcoming} parked={p.parked} now={p.now}
            onArrived={(r) => run(markArrived(r, p.isFull), `${r.guest_name} checked in.`)} />
          <LeavingToday cars={p.leavingToday} now={p.now} />
          <RecentlyLeft cars={p.recentlyLeft}
            onExtend={(r) => run(extend(r, 1), `${r.guest_name} extended by 1 day.`)} />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stats({ inside, available, outside, upcomingToday }: {
  inside: number; available: number; outside: number; upcomingToday: number;
}) {
  const pct = Math.min(100, Math.round((inside / LOT_CAPACITY) * 100));
  const barColor = pct >= 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <section className="card p-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Inside the fence" value={`${inside}`} suffix={`/ ${LOT_CAPACITY}`} tone="text-slate-900" />
        <Stat label="Spots available" value={`${available}`} tone={available === 0 ? "text-red-600" : "text-emerald-600"} />
        <Stat label="Parked outside" value={`${outside}`} tone="text-sky-700" />
        <Stat label="Arriving today" value={`${upcomingToday}`} tone="text-violet-700" />
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-500">
          <span>Lot {pct}% full</span>
          <span>{LOT_CAPACITY} spots</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-4xl font-extrabold tabular-nums ${tone}`}>
        {value}
        {suffix && <span className="ml-1 text-xl font-bold text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LotGrid({ inside, now }: { inside: ParkingRecord[]; now: number }) {
  const spots = Array.from({ length: LOT_CAPACITY }, (_, i) => inside[i] ?? null);
  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Inside the fence</h2>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <Legend className="bg-brand-600" text="Parked" />
          <Legend className="bg-amber-500" text="Leaving today" />
          <Legend className="border-2 border-dashed border-slate-300 bg-white" text="Empty" />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-2">
        {spots.map((r, i) =>
          r ? (
            <Link key={r.id} href={`/cars/${r.id}`}
              title={`${r.guest_name} · ${carLabel(r)} · leaves ${fmtDateTime(r.checkout_at)}`}
              className={`flex h-14 flex-col items-center justify-center rounded-lg px-1 text-white shadow-sm transition hover:scale-105 ${
                sameDay(r.checkout_at, new Date(now)) ? "bg-amber-500" : "bg-brand-600"
              }`}>
              <span className="w-full truncate text-center text-[11px] font-bold leading-tight">{r.license_plate}</span>
              <span className="w-full truncate text-center text-[10px] leading-tight opacity-80">
                {r.guest_name.split(" ")[0]}
              </span>
            </Link>
          ) : (
            <div key={`empty-${i}`}
              className="flex h-14 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs font-semibold text-slate-300">
              {i + 1}
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function Legend({ className, text }: { className: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${className}`} />
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ */

function ParkedTable({ parked, now, lotFull, onCheckOut, onMove }: {
  parked: ParkingRecord[];
  now: number;
  lotFull: boolean;
  onCheckOut: (r: ParkingRecord) => void;
  onMove: (r: ParkingRecord, loc: "inside" | "outside") => void;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "inside" | "outside">("all");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return parked
      .filter((r) => tab === "all" || r.location === tab)
      .filter((r) =>
        !s ||
        [r.guest_name, r.license_plate, r.confirmation_number, r.make, r.model, r.color, r.room_number, r.phone]
          .some((v) => v?.toLowerCase().includes(s)),
      )
      .sort((a, b) => a.checkout_at.localeCompare(b.checkout_at));
  }, [parked, q, tab]);

  const count = (t: "inside" | "outside") => parked.filter((r) => r.location === t).length;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-5">
        <h2 className="text-lg font-bold">Cars here now</h2>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-semibold">
          {(["all", "inside", "outside"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 capitalize ${tab === t ? "bg-white shadow-sm" : "text-slate-500"}`}>
              {t} {t === "all" ? parked.length : count(t)}
            </button>
          ))}
        </div>
        <input className="input ml-auto max-w-xs py-2 text-sm" placeholder="Search name, plate, conf #, room..."
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-slate-500">{parked.length === 0 ? "The lot is empty." : "No cars match your search."}</p>
      ) : (
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Guest</th>
                <th className="px-3 py-3">Car</th>
                <th className="px-3 py-3">Where</th>
                <th className="px-3 py-3">Leaves</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const left = new Date(r.checkout_at).getTime() - now;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3">
                      <Link href={`/cars/${r.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{r.guest_name}</Link>
                      <div className="text-xs text-slate-500">
                        {r.source === "online" ? "Online" : "Walk-in"}
                        {r.room_number && ` · Room ${r.room_number}`}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="font-mono font-semibold">{r.license_plate}{r.plate_state && <span className="text-slate-400"> {r.plate_state}</span>}</div>
                      <div className="text-xs text-slate-500">{carLabel(r)}</div>
                    </td>
                    <td className="px-3 py-3">
                      {r.location === "inside"
                        ? <span className="chip bg-brand-50 text-brand-700">Inside</span>
                        : <span className="chip bg-sky-50 text-sky-700">Outside</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="font-medium">{fmtDateTime(r.checkout_at)}</div>
                      <div className={`text-xs ${left < 6 * 3600_000 ? "font-semibold text-amber-600" : "text-slate-500"}`}>
                        in {fmtDuration(left)} · {r.days} day{r.days > 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {r.location === "outside" && !lotFull && (
                          <button className="btn-secondary btn-sm" onClick={() => onMove(r, "inside")}>Move inside</button>
                        )}
                        <Link href={`/cars/${r.id}`} className="btn-secondary btn-sm">Edit</Link>
                        <button className="btn-secondary btn-sm"
                          onClick={() => confirm(`Check out ${r.guest_name} (${r.license_plate}) now?`) && onCheckOut(r)}>
                          Check out
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function UpcomingPanel({ upcoming, parked, now, onArrived }: {
  upcoming: ParkingRecord[];
  parked: ParkingRecord[];
  now: number;
  onArrived: (r: ParkingRecord) => void;
}) {
  const today = startOfDay(now).getTime();

  const groups = useMemo(() => {
    const map = new Map<number, ParkingRecord[]>();
    for (const r of upcoming) {
      // late reservations (date already passed) are shown under today
      const key = Math.max(today, startOfDay(new Date(r.arrival_at)).getTime());
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [upcoming, today]);

  /** Rough guess of how many cars will still be here when that day starts. */
  function forecast(day: number, arriving: number) {
    const dayStart = day === today ? now : day;
    const stillParked = parked.filter((r) => r.location === "inside" && new Date(r.checkout_at).getTime() > dayStart).length;
    const earlierRes = upcoming.filter((r) => {
      const a = Math.max(now, new Date(r.arrival_at).getTime());
      return startOfDay(a).getTime() < day && a + r.days * DAY > dayStart;
    }).length;
    const free = Math.max(0, LOT_CAPACITY - Math.min(LOT_CAPACITY, stillParked + earlierRes));
    return { free, overflow: Math.max(0, arriving - free) };
  }

  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Upcoming reservations</h2>
      <p className="mb-4 text-xs text-slate-500">These do not take a spot until you press Arrived.</p>
      {groups.length === 0 && <p className="text-sm text-slate-500">No future reservations.</p>}
      <div className="space-y-4">
        {groups.map(([day, list]) => {
          const f = forecast(day, list.length);
          return (
            <div key={day}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-semibold">
                  {day === today ? "Today" : day === today + DAY ? "Tomorrow" : fmtDay(new Date(day))}
                  <span className="ml-1.5 text-sm font-normal text-slate-500">({list.length})</span>
                </h3>
                <span className={`text-xs font-semibold ${f.overflow > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {f.overflow > 0 ? `~${f.overflow} may park outside` : `~${f.free} spot${f.free === 1 ? "" : "s"} free`}
                </span>
              </div>
              <ul className="space-y-2">
                {list.map((r) => {
                  const late = new Date(r.arrival_at).getTime() < now;
                  return (
                    <li key={r.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
                      <Link href={`/cars/${r.id}`} className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{r.guest_name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {r.confirmation_number && `#${r.confirmation_number} · `}{r.license_plate} · {r.days}d · {late ? <span className="text-amber-600">expected {fmtTime(r.arrival_at)}</span> : fmtTime(r.arrival_at)}
                        </div>
                      </Link>
                      {day === today && (
                        <button className="btn-primary btn-sm" onClick={() => onArrived(r)}>Arrived</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LeavingToday({ cars, now }: { cars: ParkingRecord[]; now: number }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-lg font-bold">Leaving today</h2>
      {cars.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody is due out today.</p>
      ) : (
        <ul className="space-y-2">
          {cars.map((r) => (
            <li key={r.id}>
              <Link href={`/cars/${r.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{r.guest_name}</span>
                  <span className="block truncate text-xs text-slate-500">{r.license_plate} · {r.location}</span>
                </span>
                <span className="text-right text-xs">
                  <span className="block font-semibold">{fmtTime(r.checkout_at)}</span>
                  <span className="block text-slate-500">in {fmtDuration(new Date(r.checkout_at).getTime() - now)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentlyLeft({ cars, onExtend }: { cars: ParkingRecord[]; onExtend: (r: ParkingRecord) => void }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Checked out (last 24 hrs)</h2>
      <p className="mb-3 text-xs text-slate-500">Car still in the lot? Press Extend to put it back.</p>
      {cars.length === 0 ? (
        <p className="text-sm text-slate-500">No recent check-outs.</p>
      ) : (
        <ul className="space-y-2">
          {cars.map((r) => {
            const auto = r.status === "parked";
            return (
              <li key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                <Link href={`/cars/${r.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.guest_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {r.license_plate} · {auto ? "auto" : "manual"} · {fmtDateTime(auto ? r.checkout_at : r.checked_out_at)}
                  </span>
                </Link>
                <button className="btn-secondary btn-sm" onClick={() => onExtend(r)}>Extend</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
