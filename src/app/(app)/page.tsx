"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft, CalendarClock, CalendarDays, CarFront, CircleCheck, Clock, Ellipsis, LogIn, LogOut,
  Pencil, Plus, Search, SquareParking, TimerReset, TriangleAlert, Undo2, X,
} from "lucide-react";
import { useParking } from "@/lib/useParking";
import { LOT_CAPACITY } from "@/lib/config";
import { carLabel, type ParkingRecord } from "@/lib/types";
import { DAY, fmtDateTime, fmtDay, fmtDuration, fmtTime, sameDay, startOfDay } from "@/lib/time";
import { checkOutNow, extend, markArrived, moveTo } from "@/lib/actions";
import { useRun } from "@/components/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { Menu } from "@/components/ui/Dropdown";
import { Avatar, EmptyState, Plate, SectionTitle } from "@/components/ui/bits";

export default function Dashboard() {
  const p = useParking();
  const runAction = useRun();
  const confirm = useConfirm();
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
            <div className="text-xl font-extrabold tracking-wide">LOT FULL</div>
            <div className="text-sm text-red-100">
              All {LOT_CAPACITY} inside spots are taken. New cars will be logged as parking outside the fence.
            </div>
          </div>
        </div>
      )}

      <Overview inside={p.inside.length} available={p.available} outside={p.outside.length} arrivingToday={arrivingToday} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <LotGrid inside={p.inside} now={p.now} />
          <ParkedTable parked={p.parked} now={p.now} lotFull={p.isFull}
            onCheckOut={checkOut}
            onExtend={(r) => run(extend(r, 1), `${r.guest_name} extended by 1 day.`)}
            onMove={(r, loc) => run(moveTo(r, loc), loc === "inside" ? "Moved inside the fence." : "Moved outside the fence.")}
          />
        </div>

        <aside className="space-y-6">
          <UpcomingPanel upcoming={p.upcoming} parked={p.parked} now={p.now}
            onArrived={(r) => run(markArrived(r, p.isFull), `${r.guest_name} checked in.`)} />
          <LeavingToday cars={p.leavingToday} now={p.now} />
          <RecentlyLeft cars={p.recentlyLeft}
            onExtend={(r) => run(extend(r, 1), `${r.guest_name} is back in the lot (+1 day).`)} />
        </aside>
      </div>
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

function Overview({ inside, available, outside, arrivingToday }: {
  inside: number; available: number; outside: number; arrivingToday: number;
}) {
  const pct = Math.min(100, Math.round((inside / LOT_CAPACITY) * 100));
  const tone = pct >= 100 ? "#dc2626" : pct >= 85 ? "#f59e0b" : "#10b981";
  const r = 44;
  const c = 2 * Math.PI * r;

  return (
    <section className="grid gap-4 md:grid-cols-[auto_1fr]">
      <div className="card flex items-center gap-5 p-5">
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
        <div>
          <div className="text-sm font-medium text-slate-500">Inside the fence</div>
          <div className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight">
            {inside}<span className="ml-1 text-xl font-bold text-slate-300">/ {LOT_CAPACITY}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Only inside cars count</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatTile icon={<CircleCheck />} label="Spots available" value={available}
          color={available === 0 ? "text-red-600" : "text-emerald-600"} badge={available === 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}
          note={available === 0 ? "Lot is full" : `${available} of ${LOT_CAPACITY} open`} />
        <StatTile icon={<ArrowRightLeft />} label="Parked outside" value={outside}
          color="text-sky-700" badge="bg-sky-50 text-sky-600" note="Outside the fence" />
        <StatTile icon={<CalendarClock />} label="Arriving today" value={arrivingToday}
          color="text-violet-700" badge="bg-violet-50 text-violet-600" note="Reservations due" />
      </div>
    </section>
  );
}

function StatTile({ icon, label, value, color, badge, note }: {
  icon: React.ReactNode; label: string; value: number; color: string; badge: string; note: string;
}) {
  return (
    <div className="card p-3.5 sm:p-5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5 ${badge}`}>{icon}</span>
      <div className="mt-2 sm:mt-3">
        <div className="text-xs font-medium leading-tight text-slate-500 sm:text-sm">{label}</div>
        <div className={`mt-0.5 text-2xl font-extrabold tabular-nums tracking-tight sm:text-3xl ${color}`}>{value}</div>
        <div className="hidden text-xs text-slate-400 sm:block">{note}</div>
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
        <SectionTitle icon={<SquareParking />} title="Lot map" sub={`${inside.length} parked · ${LOT_CAPACITY - Math.min(inside.length, LOT_CAPACITY)} empty`} />
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

function ParkedTable({ parked, now, lotFull, onCheckOut, onExtend, onMove }: {
  parked: ParkingRecord[];
  now: number;
  lotFull: boolean;
  onCheckOut: (r: ParkingRecord) => void;
  onExtend: (r: ParkingRecord) => void;
  onMove: (r: ParkingRecord, loc: "inside" | "outside") => void;
}) {
  const router = useRouter();
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

  const counts = {
    all: parked.length,
    inside: parked.filter((r) => r.location === "inside").length,
    outside: parked.filter((r) => r.location === "outside").length,
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-5">
        <SectionTitle icon={<CarFront />} title="Cars here now" />
        <Segmented value={tab} onChange={setTab}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "inside", label: "Inside", count: counts.inside },
            { value: "outside", label: "Outside", count: counts.outside },
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
                            {r.source === "online" ? "Online" : "Walk-in"}
                            {r.room_number && ` · Room ${r.room_number}`}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Plate plate={r.license_plate} state={r.plate_state} />
                      <div className="mt-1 text-xs text-slate-500">{carLabel(r)}</div>
                    </td>
                    <td className="px-3 py-3"><WhereChip location={r.location} /></td>
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
                          { label: "Add 1 day", icon: <TimerReset />, onSelect: () => onExtend(r) },
                          { label: "Move inside fence", icon: <ArrowRightLeft />, onSelect: () => onMove(r, "inside"), hidden: r.location === "inside" || lotFull },
                          { label: "Move outside fence", icon: <ArrowRightLeft />, onSelect: () => onMove(r, "outside"), hidden: r.location === "outside" },
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

function WhereChip({ location }: { location: "inside" | "outside" }) {
  return location === "inside" ? (
    <span className="chip bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Inside
    </span>
  ) : (
    <span className="chip bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100">
      <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Outside
    </span>
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
                    {f.overflow > 0 ? `~${f.overflow} may park outside` : `~${f.free} spot${f.free === 1 ? "" : "s"} free`}
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
                  <span className="block truncate text-xs text-slate-500">{r.license_plate} · {r.location}</span>
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
