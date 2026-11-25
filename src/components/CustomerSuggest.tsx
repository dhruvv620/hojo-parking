"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, CornerDownLeft, LoaderCircle, SquareParking, UserRoundPlus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { carLabel, liveStatus, type ParkingRecord } from "@/lib/types";
import { fmtDateTime, fmtDay } from "@/lib/time";
import { Avatar, Plate } from "./ui/bits";

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
  onClose: () => void;
  /** The text box this list belongs to, for arrow keys / Enter / Esc. */
  inputRef: React.RefObject<HTMLInputElement | null>;
};

type Entry =
  | { kind: "reservation"; r: ParkingRecord }
  | { kind: "here"; r: ParkingRecord }
  | { kind: "customer"; c: Customer };

/**
 * Drop-down under the name / plate / confirmation field on the Add Car form.
 * Shows reservations waiting for this person, cars already in the lot, and
 * returning customers whose details can be filled in with one click.
 */
export function CustomerSuggest({ query, onPick, onClose, inputRef }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ParkingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
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
        setActive(0);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  const now = Date.now();
  const reservations = rows.filter((r) => r.status === "reserved").slice(0, 4);
  const hereNow = rows.filter((r) => liveStatus(r, now) === "parked").slice(0, 3);

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

  const entries: Entry[] = [
    ...reservations.map((r) => ({ kind: "reservation" as const, r })),
    ...hereNow.map((r) => ({ kind: "here" as const, r })),
    ...customers.map((c) => ({ kind: "customer" as const, c })),
  ];

  function choose(e: Entry | undefined) {
    if (!e) return;
    if (e.kind === "customer") onPick(e.c);
    else router.push(`/cars/${e.r.id}`);
  }

  // keyboard: arrows move, Enter picks, Esc closes
  const stateRef = useRef({ entries, active });
  stateRef.current = { entries, active };
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onKey = (ev: KeyboardEvent) => {
      const { entries, active } = stateRef.current;
      if (ev.key === "Escape") { onClose(); return; }
      if (!entries.length) return;
      if (ev.key === "ArrowDown") { ev.preventDefault(); setActive((a) => (a + 1) % entries.length); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive((a) => (a - 1 + entries.length) % entries.length); }
      else if (ev.key === "Enter") { ev.preventDefault(); choose(entries[active]); }
    };
    input.addEventListener("keydown", onKey);
    return () => input.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputRef, onClose]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (term.length < 2) return null;

  let index = -1;
  const itemProps = () => {
    index += 1;
    const i = index;
    return {
      "data-index": i,
      "data-active": active === i,
      role: "option",
      "aria-selected": active === i,
      onMouseEnter: () => setActive(i),
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onClick: () => choose(entries[i]),
    };
  };

  return (
    <div ref={listRef} role="listbox"
      className="menu-panel absolute left-0 right-0 top-full z-30 mt-1.5 max-h-[22rem] overflow-auto sm:min-w-[26rem]">
      {loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Looking up &ldquo;{term}&rdquo;...
        </div>
      ) : entries.length === 0 ? (
        <div className="flex items-center gap-3 px-3 py-3 text-sm text-slate-500">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"><UserRoundPlus className="h-4 w-4" /></span>
          <span><b className="text-slate-700">New customer.</b> No past visits found.</span>
        </div>
      ) : (
        <>
          {reservations.length > 0 && (
            <Group icon={<CalendarClock />} title="Reservation waiting" tone="text-violet-700">
              {reservations.map((r) => (
                <button key={r.id} type="button" {...itemProps()} className="menu-item data-[active=true]:!bg-violet-50">
                  <Avatar name={r.guest_name} tone="violet" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.guest_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {fmtDay(r.arrival_at)} · {r.days} day{r.days > 1 ? "s" : ""}
                      {r.confirmation_number && ` · #${r.confirmation_number}`}
                    </span>
                  </span>
                  <span className="chip bg-violet-600 text-white">Check in <ArrowRight className="!h-3 !w-3 !text-white" /></span>
                </button>
              ))}
            </Group>
          )}

          {hereNow.length > 0 && (
            <Group icon={<SquareParking />} title="Already in the lot" tone="text-amber-700">
              {hereNow.map((r) => (
                <button key={r.id} type="button" {...itemProps()} className="menu-item data-[active=true]:!bg-amber-50">
                  <Avatar name={r.guest_name} tone="amber" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 truncate font-semibold">{r.guest_name} <Plate plate={r.license_plate} /></span>
                    <span className="block truncate text-xs text-slate-500">Parked {r.location} · leaves {fmtDateTime(r.checkout_at)}</span>
                  </span>
                  <span className="chip bg-amber-100 text-amber-800">Open</span>
                </button>
              ))}
            </Group>
          )}

          {customers.length > 0 && (
            <Group icon={<UserRoundPlus />} title="Returning customer" tone="text-brand-700">
              {customers.map((c) => (
                <button key={c.license_plate} type="button" {...itemProps()} className="menu-item data-[active=true]:!bg-brand-50">
                  <Avatar name={c.guest_name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 truncate font-semibold">{c.guest_name} <Plate plate={c.license_plate} state={c.plate_state} /></span>
                    <span className="block truncate text-xs text-slate-500">
                      {carLabel(c)} · {c.visits} visit{c.visits > 1 ? "s" : ""} · last {fmtDay(c.lastVisit)}
                    </span>
                  </span>
                  <span className="chip bg-brand-600 text-white">Use</span>
                </button>
              ))}
            </Group>
          )}

          <div className="mt-1 hidden items-center gap-3 border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] text-slate-400 sm:flex">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
            <span className="flex items-center gap-1"><Kbd><CornerDownLeft className="!h-3 !w-3" /></Kbd> select</span>
            <span className="flex items-center gap-1"><Kbd>Esc</Kbd> close</span>
          </div>
        </>
      )}
    </div>
  );
}

function Group({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className={`flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider [&>svg]:h-3.5 [&>svg]:w-3.5 ${tone}`}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 font-sans text-[10px] font-semibold text-slate-500">
      {children}
    </kbd>
  );
}
