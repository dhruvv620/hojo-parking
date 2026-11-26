"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft, CalendarClock, CalendarRange, CalendarDays, CarFront, CircleCheck, Clock, Ellipsis, LogIn, LogOut,
  Pencil, Plus, Search, SquareParking, TriangleAlert, Undo2, X,
} from "lucide-react";
import { useParking } from "@/lib/useParking";
import { LOT_CAPACITY } from "@/lib/config";
import { carLabel, sourceLabel, type ParkingRecord } from "@/lib/types";
import { lotFits, vehicleLabel } from "@/lib/lots";
import { DAY, fmtDateTime, fmtDay, fmtDuration, fmtTime, sameDay, startOfDay } from "@/lib/time";
import { checkOutNow, markArrived, moveToLot } from "@/lib/actions";
import { LOTS, lotName, recordLot, type LotId } from "@/lib/lots";
import { UpdateStayDialog } from "@/components/UpdateStayDialog";
import { useRun, useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { Menu } from "@/components/ui/Dropdown";
import { Avatar, EmptyState, LotChip, Plate, SectionTitle, VehicleIcon } from "@/components/ui/bits";

export default function Dashboard() {
  const p = useParking();
  const runAction = useRun();
  const confirm = useConfirm();
  const [stay, setStay] = useState<{ r: ParkingRecord; add: number } | null>(null);
  const toast = useToast();

  // Pop up a notice when a guest checks themselves in with the QR form.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (p.loading) return;
    const ids = new Set(p.records.map((r) => r.id));
    if (seen.current) {
      for (const r of p.records) {
        if (!seen.current.has(r.id) && r.source === "guest_form") {
          toast(`New self check-in: ${r.guest_name} (${r.license_plate}) → ${lotName(recordLot(r))}`);
        }
      }
    }
    seen.current = ids;
  }, [p.records, p.loading, toast]);
  // refresh right away after any button, without waiting for the live update
  const run: typeof runAction = async (action, msg) => {
    const ok = await runAction(action, msg);
    p.reload();
    return ok;
  };

  async function checkOut(r: ParkingRecord) {
    const ok = await confirm({
      title: `Check out ${r.guest_name}?`,
      message: <>The car <b className="font-mono">{r.license_plate}</b> leaves now and its spot frees up right away.</>,
      confirmText: "Check out",
      icon: "checkout",
    });
    if (ok) run(checkOutNow(r), `${r.guest_name} checked out. Spot is free.`);
  }

  if (p.loading) return <DashboardSkeleton />;

  const arrivingToday = p.upcoming.filter((r) => new Date(r.arrival_at).getTime() < startOfDay(p.now).getTime() + DAY).length;

  return (
    <div className="space-y-6">
      <PageHeader now={p.now} />

      {p.error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <TriangleAlert className="h-4 w-4 shrink-0" /> Could not load data: {p.error}
        </div>
      )}

      {p.isFull && (
        <div className="flex animate-rise flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 px-5 py-4 text-white shadow-lg shadow-red-600/20">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xl font-extrabold tracking-wide">LOT 1 FULL</div>
            <div className="text-sm text-red-100">
              All {LOT_CAPACITY} spots in Lot 1 are taken. Cars and SUVs go to Lot 3.
            </div>
          </div>
        </div>
      )}

      <Overview byLot={p.byLot} total={p.parked.length} available={p.available} arrivingToday={arrivingToday} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <LotGrid inside={p.inside} now={p.now} />
          <ParkedTable parked={p.parked} now={p.now} lotFull={p.isFull}
            onCheckOut={checkOut}
            onUpdateStay={(r) => setStay({ r, add: 0 })}
            onMove={(r, lot) => run(moveToLot(r, lot), `Moved to ${lotName(lot)}.`)}
          />
        </div>

        <aside className="space-y-6">
          <UpcomingPanel upcoming={p.upcoming} parked={p.parked} now={p.now}
            onArrived={(r) => run(markArrived(r, p.isFull), `${r.guest_name} checked in.`)} />
          <LeavingToday cars={p.leavingToday} now={p.now} />
          <RecentlyLeft cars={p.recentlyLeft} onExtend={(r) => setStay({ r, add: 1 })} />
        </aside>
      </div>

      <UpdateStayDialog record={stay?.r ?? null} presetAdd={stay?.add ?? 0} onClose={() => setStay(null)} onSaved={p.reload} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PageHeader({ now }: { now: number }) {
  const h = new Date(now).getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{greeting}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>
      <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live
      </span>
    </div>
  );
}

function Overview({ byLot, total, available, arrivingToday }: {
  byLot: Record<LotId | "none", ParkingRecord[]>; total: number; available: number; arrivingToday: number;
}) {
  const lot1 = byLot.lot1.length;
  const pct = Math.min(100, Math.round((lot1 / LOT_CAPACITY) * 100));
  const tone = pct >= 100 ? "#dc2626" : pct >= 85 ? "#f59e0b" : "#10b981";
  const full = available === 0;
  const r = 44;
  const c = 2 * Math.PI * r;
  const parts = [...LOTS.map((l) => ({ id: l.id, name: l.name, dot: l.dot, n: byLot[l.id].length })), { id: "none", name: "No lot", dot: "bg-slate-300", n: byLot.none.length }]
    .filter((x) => x.n > 0 || x.id !== "none");

  return (
    <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[1.15fr_1.45fr_1fr_0.75fr]">
      {/* 1. Total parked, split by lot */}
      <div className="card col-span-2 flex flex-col p-5 lg:col-span-1">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><CarFront className="h-5 w-5" /></span>
          <div className="text-sm font-medium text-slate-500">Total parked</div>
        </div>
        <div className="mt-3 text-4xl font-extrabold tabular-nums tracking-tight">{total}</div>
        <div className="mt-auto pt-4">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            {parts.map((x) => (
              <div key={x.id} className={`h-full transition-all duration-700 ${x.dot}`} style={{ width: `${total ? (x.n / total) * 100 : 0}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            {parts.map((x) => (
              <span key={x.id} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${x.dot}`} /> {x.name} <b className="tabular-nums text-slate-900">{x.n}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Lot 1 (fenced): gauge + spots available */}
      <div className="card col-span-2 flex items-center gap-5 p-5 lg:col-span-1">
        <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2f7" strokeWidth="10" />
            <circle cx="50" cy="50" r={r} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
              style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1), stroke 300ms" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold tabular-nums leading-none">{pct}%</span>
            <span className="mt-1 text-[11px] font-medium text-slate-500">full</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-500">Lot 1 · fenced lot</div>
          <div className="mt-0.5 text-4xl font-extrabold tabular-nums tracking-tight">
            {lot1}<span className="ml-1 text-xl font-bold text-slate-300">/ {LOT_CAPACITY}</span>
          </div>
          <div className={`mt-2.5 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 ${
            full ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"}`}>
            {full ? <TriangleAlert className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
            <span className="text-sm font-semibold">
              {full ? "Lot full, 0 spots" : <><span className="text-lg font-extrabold tabular-nums">{available}</span> spot{available === 1 ? "" : "s"} available</>}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Other lots */}
      <div className="card p-4 sm:p-5">
        <div className="text-xs font-medium text-slate-500 sm:text-sm">Other lots</div>
        <ul className="mt-2 space-y-2">
          {LOTS.filter((l) => l.id !== "lot1").map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${l.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{l.name}</span>
                <span className="block truncate text-[11px] text-slate-400">{l.rule}</span>
              </span>
              <span className="text-xl font-extrabold tabular-nums">{byLot[l.id].length}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 4. Arriving today */}
      <StatTile icon={<CalendarClock />} label="Arriving today" value={arrivingToday}
        color="text-violet-700" badge="bg-violet-50 text-violet-600" note="Reservations due" />
    </section>
  );
}

function StatTile({ icon, label, value, color, badge, note }: {
  icon: React.ReactNode; label: string; value: number; color: string; badge: string; note: string;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5 ${badge}`}>{icon}</span>
      <div className="mt-2 sm:mt-3">
        <div className="text-xs font-medium leading-tight text-slate-500 sm:text-sm">{label}</div>
        <div className={`mt-0.5 text-2xl font-extrabold tabular-nums tracking-tight sm:text-3xl ${color}`}>{value}</div>
        <div className="text-xs text-slate-400">{note}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LotGrid({ inside, now }: { inside: ParkingRecord[]; now: number }) {
  const spots = Array.from({ length: LOT_CAPACITY }, (_, i) => inside[i] ?? null);
  return (
    <section className="card overflow-x-clip p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<SquareParking />} title="Lot 1 spots" sub={`${inside.length} parked · ${LOT_CAPACITY - Math.min(inside.length, LOT_CAPACITY)} empty`} />
        <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-600">
          <Legend className="bg-brand-600" text="Parked" />
          <Legend className="bg-amber-500" text="Leaving today" />
          <Legend className="border border-dashed border-slate-300 bg-white" text="Empty" />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(72px,1fr))] sm:gap-2">
        {spots.map((r, i) =>
          r ? (
            <Link key={r.id} href={`/cars/${r.id}`}
              className={`group relative flex h-16 flex-col items-center justify-center rounded-xl px-1 text-white shadow-sm ring-1 ring-inset ring-white/10 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                sameDay(r.checkout_at, new Date(now))
                  ? "bg-gradient-to-b from-amber-400 to-amber-500 hover:shadow-amber-500/30"
                  : "bg-gradient-to-b from-brand-500 to-brand-600 hover:shadow-brand-600/30"
              }`}>
              <span className="absolute left-1.5 top-1 text-[9px] font-semibold opacity-60">{i + 1}</span>
              <span className="w-full truncate text-center text-[11px] font-bold leading-tight tracking-wide">{r.license_plate}</span>
              <span className="w-full truncate text-center text-[10px] leading-tight opacity-80">{r.guest_name.split(" ")[0]}</span>
              {/* hover card */}
              <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-52 [@media(hover:hover)]:block -translate-x-1/2 translate-y-1 rounded-xl bg-slate-900 p-3 text-left text-xs opacity-0 shadow-xl transition duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                <span className="block font-semibold text-white">{r.guest_name}</span>
                <span className="block text-slate-300">{carLabel(r)}</span>
                <span className="mt-1.5 block text-slate-400">Leaves {fmtDateTime(r.checkout_at)}</span>
              </span>
            </Link>
          ) : (
            <div key={`empty-${i}`}
              className="flex h-16 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-300">
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

function ParkedTable({ parked, now, lotFull, onCheckOut, onUpdateStay, onMove }: {
  parked: ParkingRecord[];
  now: number;
  lotFull: boolean;
  onCheckOut: (r: ParkingRecord) => void;
  onUpdateStay: (r: ParkingRecord) => void;
  onMove: (r: ParkingRecord, lot: LotId) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | LotId>("all");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return parked
      .filter((r) => tab === "all" || recordLot(r) === tab)
      .filter((r) =>
        !s ||
        [r.guest_name, r.license_plate, r.confirmation_number, r.make, r.model, r.color, r.room_number, r.phone]
          .some((v) => v?.toLowerCase().includes(s)),
      )
      .sort((a, b) => a.checkout_at.localeCompare(b.checkout_at));
  }, [parked, q, tab]);

  const count = (l: LotId) => parked.filter((r) => recordLot(r) === l).length;


  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-5">
        <SectionTitle icon={<CarFront />} title="Cars here now" />
        <Segmented value={tab} onChange={setTab}
          options={[
            { value: "all", label: "All", count: parked.length },
            ...LOTS.map((l) => ({ value: l.id, label: l.id === "hotel" ? "Hotel" : l.name, count: count(l.id) })),
          ]} />
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input h-10 pl-9 pr-9 text-sm" placeholder="Search name, plate, conf #..."
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cars" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={parked.length === 0 ? <SquareParking /> : <Search />}
          title={parked.length === 0 ? "The lot is empty" : "No cars match your search"}
          text={parked.length === 0 ? "Cars you check in will show up here." : "Try a different name or plate number."}
          action={parked.length === 0 ? <Link href="/cars/new" className="btn-primary"><Plus /> Add a car</Link> : undefined} />
      ) : (
        <div className="max-h-[640px] overflow-auto border-t border-slate-100">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">
              <tr>
                <th className="px-5 py-3">Guest</th>
                <th className="px-3 py-3">Car</th>
                <th className="px-3 py-3">Where</th>
                <th className="px-3 py-3">Leaves</th>
                <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const left = new Date(r.checkout_at).getTime() - now;
                const soon = left < 6 * 3600_000;
                return (
                  <tr key={r.id} className="group transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-5 py-3">
                      <Link href={`/cars/${r.id}`} className="flex items-center gap-3">
                        <Avatar name={r.guest_name} />
                        <span>
                          <span className="block font-semibold text-slate-900 group-hover:text-brand-700">{r.guest_name}</span>
                          <span className="block text-xs text-slate-500">
                            {sourceLabel(r.source)}
                            {r.room_number && ` · Room ${r.room_number}`}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Plate plate={r.license_plate} state={r.plate_state} />
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        {r.vehicle_type && <VehicleIcon type={r.vehicle_type} className="h-3.5 w-3.5 text-slate-400" />}
                        {carLabel(r)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <LotChip lot={recordLot(r)} />
                      {!lotFits(recordLot(r), r.vehicle_type) && <div className="mt-1 text-[11px] font-semibold text-amber-600">Wrong lot for {vehicleLabel(r.vehicle_type)}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="font-medium text-slate-800">{fmtDateTime(r.checkout_at)}</div>
                      <span className={`mt-1 inline-flex items-center gap-1 text-xs ${soon ? "font-semibold text-amber-600" : "text-slate-500"}`}>
                        <Clock className="h-3 w-3" /> in {fmtDuration(left)} · {r.days} day{r.days > 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn-secondary btn-sm" onClick={() => onCheckOut(r)}>
                          <LogOut /> Check out
                        </button>
                        <Menu items={[
                          { label: "Edit details", icon: <Pencil />, onSelect: () => router.push(`/cars/${r.id}`) },
                          { label: "Update stay / extend", icon: <CalendarRange />, onSelect: () => onUpdateStay(r) },
                          ...LOTS.map((l) => ({
                            label: `Move to ${l.name}`, icon: <ArrowRightLeft />, onSelect: () => onMove(r, l.id),
                            hidden: recordLot(r) === l.id || (l.id === "lot1" && lotFull),
                          })),
                          { label: "Check out now", icon: <LogOut />, onSelect: () => onCheckOut(r), danger: true, divider: true },
                        ]}>
                          <Ellipsis className="h-4 w-4" />
                        </Menu>
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

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; count: number }[];
}) {
  return (
    <div role="tablist" className="flex rounded-xl bg-slate-100 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={active} onClick={() => onChange(o.value)}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-all duration-200 ${
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}>
            {o.label}
            <span className={`rounded-md px-1.5 text-xs tabular-nums transition-colors ${active ? "bg-brand-50 text-brand-700" : "bg-slate-200/70 text-slate-500"}`}>
              {o.count}
            </span>
          </button>
        );
      })}
    </div>
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

  /** Rough guess of how many inside spots will be free when that day starts. */
  function forecast(day: number, arriving: number) {
    const dayStart = day === today ? now : day;
    const stillParked = parked.filter((r) => recordLot(r) === "lot1" && new Date(r.checkout_at).getTime() > dayStart).length;
    const earlierRes = upcoming.filter((r) => {
      const a = Math.max(now, new Date(r.arrival_at).getTime());
      return startOfDay(a).getTime() < day && a + r.days * DAY > dayStart;
    }).length;
    const free = Math.max(0, LOT_CAPACITY - Math.min(LOT_CAPACITY, stillParked + earlierRes));
    return { free, overflow: Math.max(0, arriving - free) };
  }

  return (
    <section className="card p-5">
      <SectionTitle icon={<CalendarDays />} title="Upcoming reservations" sub="They take a spot only after you press Arrived." />
      {groups.length === 0 ? (
        <EmptyState compact icon={<CalendarDays />} title="No future reservations" />
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map(([day, list]) => {
            const f = forecast(day, list.length);
            return (
              <div key={day}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-800">
                    {day === today ? "Today" : day === today + DAY ? "Tomorrow" : fmtDay(new Date(day))}
                    <span className="ml-1.5 font-medium text-slate-400">{list.length}</span>
                  </h3>
                  <span className={`chip ${f.overflow > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {f.overflow > 0 ? `~${f.overflow} may go to Lot 3` : `~${f.free} spot${f.free === 1 ? "" : "s"} free`}
                  </span>
                </div>
                <ul className="space-y-2">
                  {list.map((r) => {
                    const late = new Date(r.arrival_at).getTime() < now;
                    return (
                      <li key={r.id} className="group flex items-center gap-3 rounded-xl border border-slate-200/80 p-2.5 transition hover:border-slate-300 hover:shadow-sm">
                        <Avatar name={r.guest_name} tone="violet" />
                        <Link href={`/cars/${r.id}`} className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold group-hover:text-brand-700">{r.guest_name}</div>
                          <div className="truncate text-xs text-slate-500">
                            {r.confirmation_number && `#${r.confirmation_number} · `}{r.license_plate} · {r.days}d ·{" "}
                            {late ? <span className="font-medium text-amber-600">expected {fmtTime(r.arrival_at)}</span> : fmtTime(r.arrival_at)}
                          </div>
                        </Link>
                        {day === today && (
                          <button className="btn-primary btn-sm" onClick={() => onArrived(r)}>
                            <LogIn /> Arrived
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LeavingToday({ cars, now }: { cars: ParkingRecord[]; now: number }) {
  return (
    <section className="card p-5">
      <SectionTitle icon={<Clock />} title="Leaving today" sub={cars.length ? `${cars.length} car${cars.length > 1 ? "s" : ""} due out` : undefined} />
      {cars.length === 0 ? (
        <EmptyState compact icon={<Clock />} title="Nobody is due out today" />
      ) : (
        <ul className="mt-3 space-y-1">
          {cars.map((r) => (
            <li key={r.id}>
              <Link href={`/cars/${r.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
                <Avatar name={r.guest_name} tone="amber" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.guest_name}</span>
                  <span className="block truncate text-xs text-slate-500">{r.license_plate} · {lotName(recordLot(r))}</span>
                </span>
                <span className="text-right text-xs">
                  <span className="block font-semibold text-slate-800">{fmtTime(r.checkout_at)}</span>
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
      <SectionTitle icon={<LogOut />} title="Checked out (last 24 hrs)" sub="Car still in the lot? Press Extend to put it back." />
      {cars.length === 0 ? (
        <EmptyState compact icon={<LogOut />} title="No recent check-outs" />
      ) : (
        <ul className="mt-3 space-y-1">
          {cars.map((r) => {
            const auto = r.status === "parked";
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
                <Avatar name={r.guest_name} tone="slate" />
                <Link href={`/cars/${r.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.guest_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {r.license_plate} · {auto ? "auto" : "manual"} · {fmtDateTime(auto ? r.checkout_at : r.checked_out_at)}
                  </span>
                </Link>
                <button className="btn-secondary btn-sm" onClick={() => onExtend(r)}>
                  <Undo2 /> Extend
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-9 w-56" />
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="skeleton h-36 rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="skeleton h-96 rounded-2xl" />
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    </div>
  );
}
