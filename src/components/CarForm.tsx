"use client";

import { useId, useRef, useState } from "react";
import {
  ArrowRightLeft, BedDouble, CalendarRange, ChevronDown, CalendarCheck, CalendarClock, CalendarDays, Check, CircleAlert, Clock, DoorOpen, Globe,
  Hash, Info, LoaderCircle, LogIn, MapPin, Minus, Phone, Plus, RectangleHorizontal, Sparkles, SquareParking,
  TriangleAlert, UserRound, X,
} from "lucide-react";
import { SectionTitle } from "./ui/bits";
import { DatePicker } from "./ui/DatePicker";
import { LotMapCard, type OtherPin, type Pin } from "./LotMap";
import { LOTS, VEHICLES, lotById, lotFits, normalizeLot, recordLot, suggestLot, type LotId, type VehicleType } from "@/lib/lots";
import { VehicleIcon } from "./ui/bits";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LOT_CAPACITY } from "@/lib/config";
import { isLotFullError, type ParkingRecord, type Source } from "@/lib/types";
import { addDays, fmtDateTime, fmtTime, fromLocalInput, toLocalInput } from "@/lib/time";
import { CustomerSuggest, type Customer } from "./CustomerSuggest";

type Props = {
  /** The record being edited. Leave out to add a new car. */
  record?: ParkingRecord;
  /** How many cars are inside the fence right now. */
  insideCount: number;
  onSaved: (r: ParkingRecord, note?: string) => void;
  /** Edit mode: opens the Update stay pop-up instead of editing days here. */
  onUpdateStay?: () => void;
  /** Other parked cars' map pins, shown as faint dots. */
  otherPins?: OtherPin[];
};

export function CarForm({ record, insideCount, onSaved, onUpdateStay, otherPins = [] }: Props) {
  const isNew = !record;
  const wasInside =
    !!record && record.status === "parked" && record.location === "inside" &&
    new Date(record.checkout_at).getTime() > Date.now();
  // Inside spots this car could take. A car already inside keeps its spot.
  const lotFull = insideCount >= LOT_CAPACITY && !wasInside;

  const [mode, setMode] = useState<"now" | "future">(record?.status === "reserved" ? "future" : "now");
  const [f, setF] = useState({
    guest_name: record?.guest_name ?? "",
    confirmation_number: record?.confirmation_number ?? "",
    phone: record?.phone ?? "",
    room_number: record?.room_number ?? "",
    source: (record?.source ?? "walk_in") as Source,
    license_plate: record?.license_plate ?? "",
    plate_state: record?.plate_state ?? "",
    make: record?.make ?? "",
    model: record?.model ?? "",
    color: record?.color ?? "",
    lot: (record ? recordLot(record) : suggestLot(null, lotFull)) as LotId | null,
    vehicle_type: (record?.vehicle_type ?? null) as VehicleType | null,
    arrival: toLocalInput(record?.arrival_at ?? new Date()),
    futureArrival: toLocalInput(record?.status === "reserved" ? record.arrival_at : nextMorning()),
    days: record?.days ?? 1,
    fence_told: record?.fence_told ?? false,
    notes: record?.notes ?? "",
    spot: (record?.spot_x != null && record?.spot_y != null
      ? { map: normalizeLot(record.spot_map) ?? recordLot(record) ?? "lot1", x: Number(record.spot_x), y: Number(record.spot_y) }
      : null) as Pin | null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullRetry, setFullRetry] = useState(false);
  // once staff pick a lot by hand, changing the vehicle type no longer moves it
  const [lotTouched, setLotTouched] = useState(!!record);
  // which field the look-up drop-down is showing under (Add Car only)
  const [lookup, setLookup] = useState<null | "guest_name" | "license_plate" | "confirmation_number">(null);
  const [picked, setPicked] = useState<string | null>(null);
  const lookupInput = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  function chooseVehicle(v: VehicleType) {
    setF((s) => ({ ...s, vehicle_type: v, ...(lotTouched ? {} : { lot: suggestLot(v, lotFull) }) }));
  }
  function chooseLot(l: LotId) {
    setLotTouched(true);
    // a pin on another lot's picture no longer makes sense
    setF((s) => ({ ...s, lot: l, spot: s.spot && s.spot.map !== l ? null : s.spot }));
  }
  function choosePin(p: Pin | null) {
    if (p && p.map !== f.lot) setLotTouched(true);
    setF((s) => ({ ...s, spot: p, ...(p ? { lot: p.map } : {}) }));
  }

  function pickCustomer(c: Customer) {
    if (c.vehicle_type) chooseVehicle(c.vehicle_type);
    setF((s) => ({
      ...s,
      guest_name: c.guest_name,
      phone: c.phone ?? s.phone,
      license_plate: c.license_plate,
      plate_state: c.plate_state ?? "",
      make: c.make ?? "",
      model: c.model ?? "",
      color: c.color ?? "",
    }));
    setPicked(`${c.guest_name} (${c.license_plate})`);
    setLookup(null);
  }

  /** Props that turn a field into a look-up box on the Add Car form. */
  const lookupProps = (k: "guest_name" | "license_plate" | "confirmation_number") =>
    isNew
      ? {
          onFocus: () => setLookup(k),
          onBlur: () => setTimeout(() => setLookup((cur) => (cur === k ? null : cur)), 150),
          inputRef: lookup === k ? lookupInput : undefined,
          suggest: lookup === k ? (
            <CustomerSuggest query={f[k]} onPick={pickCustomer} inputRef={lookupInput} onClose={() => setLookup(null)} />
          ) : null,
        }
      : {};

  const isFuture = isNew ? mode === "future" : record.status === "reserved";
  const arrivalIso = isFuture
    ? fromLocalInput(f.futureArrival)
    : isNew
      ? new Date().toISOString()
      : fromLocalInput(f.arrival);
  const days = Math.max(1, Math.min(365, Number(f.days) || 1));
  const checkout = addDays(arrivalIso, days);
  // If Lot 1 fills up while this form is open, move the car to Lot 3 automatically.
  const lot: LotId | null = f.lot === "lot1" && lotFull ? "lot3" : f.lot;
  const lotInfo = lotById(lot);
  const misfit = !lotFits(lot, f.vehicle_type);

  async function save(forceLot3 = false) {
    setBusy(true);
    setError(null);
    setFullRetry(false);

    const chosen: LotId | null = forceLot3 ? "lot3" : lot;
    const payload = {
      guest_name: f.guest_name.trim(),
      confirmation_number: f.confirmation_number.trim() || null,
      phone: f.phone.trim() || null,
      room_number: f.room_number.trim() || null,
      source: f.source,
      license_plate: f.license_plate.trim(),
      plate_state: f.plate_state.trim() || null,
      make: f.make.trim() || null,
      model: f.model.trim() || null,
      color: f.color.trim() || null,
      lot: chosen,
      location: chosen === "lot1" ? "inside" : "outside",
      vehicle_type: f.vehicle_type,
      arrival_at: arrivalIso,
      days,
      fence_told: chosen ? f.fence_told : false,
      notes: f.notes.trim() || null,
      spot_x: isFuture ? null : f.spot?.x ?? null,
      spot_y: isFuture ? null : f.spot?.y ?? null,
      spot_map: isFuture ? null : f.spot?.map ?? null,
      ...(isNew ? { status: isFuture ? "reserved" : "parked" } : {}),
    };

    const sb = supabaseBrowser().from("parking_records");
    const { data, error } = isNew
      ? await sb.insert(payload).select().single()
      : await sb.update(payload).eq("id", record.id).select().single();

    setBusy(false);
    if (error) {
      if (isLotFullError(error.message)) {
        setError(`Lot 1 just filled up (${LOT_CAPACITY} / ${LOT_CAPACITY}). Park this car in Lot 3 instead?`);
        setFullRetry(true);
      } else {
        setError(error.message);
      }
      return;
    }
    onSaved(data as ParkingRecord, forceLot3 ? "Lot 1 was full, so this car was saved in Lot 3." : undefined);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.guest_name.trim() || !f.license_plate.trim()) {
      setError("Guest name and plate number are required.");
      return;
    }
    save(false);
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-5 pb-24 sm:pb-0 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-5">
      {/* When */}
      <section className="card p-5 sm:p-6">
        <SectionTitle icon={<CalendarClock />} title="Stay" sub="How long the car is staying." />

        {isNew && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Choice active={mode === "now"} onClick={() => setMode("now")} icon={<LogIn />} title="Arriving now" sub="Car is here, parking it" />
            <Choice active={mode === "future"} onClick={() => setMode("future")} icon={<CalendarDays />} title="Future reservation" sub="Coming on a later date" />
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="order-1">
            <label className="label">{isFuture ? "Expected arrival" : "Arrived"}</label>
            {isNew && !isFuture ? (
              <div className="input-readonly gap-2"><Clock className="h-4 w-4 text-slate-400" /> Now, {fmtTime(new Date())}</div>
            ) : (
              <DatePicker ariaLabel={isFuture ? "Expected arrival" : "Arrived"}
                value={new Date(isFuture ? f.futureArrival : f.arrival)}
                minDate={isFuture ? new Date() : undefined}
                onChange={(d) => set(isFuture ? "futureArrival" : "arrival", toLocalInput(d))} />
            )}
          </div>
          {isNew || !onUpdateStay ? (
            <>
          <div className="order-3 sm:order-2">
            <label className="label">Leaves by</label>
            <DatePicker mode="date" ariaLabel="Leaves by" value={checkout}
              minDate={addDays(arrivalIso, 1)}
              onChange={(d) => set("days", daysBetween(new Date(arrivalIso), d))}
              footer={(d) => {
                const n = daysBetween(new Date(arrivalIso), d);
                return <><b className="text-slate-800">{n} day{n > 1 ? "s" : ""}</b> · leaves at {fmtTime(addDays(arrivalIso, n))}</>;
              }}
              triggerClassName="group flex h-11 w-full items-center gap-2 rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-emerald-100/60 px-3.5 text-left font-semibold text-emerald-800 outline-none transition hover:border-emerald-300 hover:shadow-sm focus-visible:ring-4 focus-visible:ring-emerald-100 active:scale-[0.99]"
              renderTrigger={({ open }) => (
                <>
                  <CalendarCheck className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{fmtDateTime(checkout)}</span>
                  <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold transition ${open ? "bg-emerald-200/70" : "text-emerald-600 group-hover:bg-emerald-200/50"}`}>
                    Change <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                  </span>
                </>
              )} />
            <p className="mt-1.5 text-xs text-slate-500">{days} x 24 hours. Pick a date or set days below.</p>
          </div>
          <div className="order-2 sm:order-3 sm:col-span-2">
            <label className="label" id="days-label">Days paid</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex h-11 items-center self-start rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgb(16_24_40/0.04)]" aria-labelledby="days-label">
                <button type="button" aria-label="One day less" disabled={days <= 1} onClick={() => set("days", Math.max(1, days - 1))}
                  className="flex h-full w-10 items-center justify-center rounded-l-xl text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:opacity-30">
                  <Minus className="h-4 w-4" />
                </button>
                <input type="number" min={1} max={365} value={f.days} aria-label="Days paid"
                  className="h-full w-12 border-x border-slate-200 text-center text-base font-bold tabular-nums outline-none [appearance:textfield] focus:bg-brand-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  onChange={(e) => set("days", e.target.value === "" ? ("" as unknown as number) : Number(e.target.value))} />
                <button type="button" aria-label="One day more" onClick={() => set("days", Math.min(365, days + 1))}
                  className="flex h-full w-10 items-center justify-center rounded-r-xl text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 active:scale-95">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="grid flex-1 grid-cols-4 gap-1.5">
                {[1, 2, 3, 7].map((d) => (
                  <button type="button" key={d} onClick={() => set("days", d)} data-active={days === d}
                    className="choice h-11 px-1 text-center text-sm font-semibold text-slate-600 data-[active=true]:text-brand-700">
                    {d === 7 ? "1 week" : `${d} day${d > 1 ? "s" : ""}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
            </>
          ) : (
            <>
          <div className="order-3 sm:order-2">
            <label className="label">Leaves by</label>
            <div className="flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-emerald-100/60 px-3.5 font-semibold text-emerald-800">
              <CalendarCheck className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{fmtDateTime(checkout)}</span>
              <span className="text-xs font-medium text-emerald-700">{days} day{days > 1 ? "s" : ""}</span>
            </div>
          </div>
          <div className="order-2 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 sm:order-3 sm:col-span-2">
            <CalendarRange className="h-5 w-5 shrink-0 text-slate-400" />
            <p className="min-w-0 flex-1 text-sm text-slate-600">
              To <b>extend or shorten</b> the stay, use <b>Update stay</b>. It records payment and a note in the Stay history.
            </p>
            <button type="button" className="btn-primary btn-sm" onClick={onUpdateStay}>
              <CalendarRange /> Update stay
            </button>
          </div>
            </>
          )}
        </div>

        {isFuture && (
          <div className="mt-5 flex gap-3 rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
            <p>
              Shows under <b>Upcoming reservations</b> and does not take a spot. When the guest shows up, press <b>Arrived</b>.
              The paid days start counting from that moment.
            </p>
          </div>
        )}
      </section>

      {/* Guest + car */}
      <section className="card p-5 sm:p-6">
        <SectionTitle icon={<UserRound />} title="Guest and car"
          sub={isNew ? "Type a name, plate or confirmation #. Returning guests and reservations pop up." : "Edit any detail and press Save changes."} />

        {picked && (
          <div className="mt-4 flex animate-rise items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" />
            <span className="flex-1">Filled in from <b>{picked}</b>&apos;s last visit. Check the details are still right.</span>
            <button type="button" aria-label="Dismiss" className="rounded-md p-1 transition hover:bg-emerald-100" onClick={() => setPicked(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Guest name" required value={f.guest_name} onChange={(v) => set("guest_name", v)} autoFocus={isNew}
            icon={<UserRound />} placeholder="Full name" {...lookupProps("guest_name")} />
          <div>
            <span className="label">Booked</span>
            <div className="grid grid-cols-2 gap-2">
              {(["walk_in", "online"] as const).map((s) => (
                <button type="button" key={s} onClick={() => set("source", s)} data-active={f.source === s}
                  className="choice flex h-11 items-center justify-center gap-2 text-sm font-semibold text-slate-600 data-[active=true]:text-brand-700">
                  {s === "walk_in" ? <DoorOpen className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                  {s === "walk_in" ? "Walk-in" : "Online"}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <span className="label">Vehicle type</span>
            <div className="grid grid-cols-3 gap-2">
              {VEHICLES.map((v) => (
                <button type="button" key={v.id} onClick={() => chooseVehicle(v.id)} data-active={f.vehicle_type === v.id}
                  aria-pressed={f.vehicle_type === v.id}
                  className="choice flex h-11 items-center justify-center gap-2 text-sm font-semibold text-slate-600 data-[active=true]:text-brand-700">
                  <VehicleIcon type={v.id} className="h-4 w-4" /> {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_84px] gap-2">
            <Field label="Plate number" required value={f.license_plate} onChange={(v) => set("license_plate", v.toUpperCase())} mono
              icon={<RectangleHorizontal />} placeholder="ABC 1234" {...lookupProps("license_plate")} />
            <Field label="State" value={f.plate_state} onChange={(v) => set("plate_state", v.toUpperCase().slice(0, 3))} placeholder="NJ" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Make" value={f.make} onChange={(v) => set("make", v)} placeholder="Toyota" />
            <Field label="Model" value={f.model} onChange={(v) => set("model", v)} placeholder="Camry" />
            <Field label="Color" value={f.color} onChange={(v) => set("color", v)} placeholder="Gray" />
          </div>
          <Field label="Confirmation #" value={f.confirmation_number} onChange={(v) => set("confirmation_number", v)}
            icon={<Hash />} placeholder="From the online booking" mono {...lookupProps("confirmation_number")} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone" value={f.phone} onChange={(v) => set("phone", v)} type="tel" icon={<Phone />} placeholder="Optional" />
            <Field label="Room #" value={f.room_number} onChange={(v) => set("room_number", v)} icon={<BedDouble />} placeholder="Optional" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Notes</label>
            <textarea id="notes" className="input min-h-20 resize-y" placeholder="Anything staff should know (optional)"
              value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Where: which lot */}
      {!isFuture && (
        <section className="card p-5 sm:p-6">
          <SectionTitle icon={<MapPin />} title="Which lot?"
            sub={`Lot 1: ${insideCount} of ${LOT_CAPACITY} spots taken${wasInside ? " (including this car)" : ""}.`} />
          {lotFull && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-4 py-3 text-sm text-white shadow-md shadow-red-600/20">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              <span><b>LOT 1 FULL.</b> Cars and SUVs go to <b>Lot 3</b>.</span>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {LOTS.map((l) => {
              const full = l.id === "lot1" && lotFull;
              const free = l.id === "lot1" ? Math.max(0, LOT_CAPACITY - insideCount) : null;
              const wrongType = !lotFits(l.id, f.vehicle_type);
              return (
                <button key={l.id} type="button" onClick={() => chooseLot(l.id)} disabled={full} data-active={lot === l.id} aria-pressed={lot === l.id}
                  className="choice relative flex flex-col items-start gap-1 p-3.5 sm:p-4">
                  <span className="flex w-full items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${l.dot}`} />
                    <span className={`font-bold ${lot === l.id ? "text-brand-900" : "text-slate-800"}`}>{l.name}</span>
                    {lot === l.id && <Check className="ml-auto h-4 w-4 text-brand-600" strokeWidth={3} />}
                  </span>
                  <span className={`text-xs font-semibold ${wrongType ? "text-amber-700" : "text-slate-600"}`}>{l.rule}</span>
                  <span className="text-[11px] text-slate-400">
                    {full ? "Full" : free !== null ? `${free} spot${free === 1 ? "" : "s"} free` : l.id === "hotel" ? "Behind the hotel" : "No limit"}
                  </span>
                </button>
              );
            })}
          </div>

          {misfit && lotInfo && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span>{lotInfo.name} is for <b>{lotInfo.rule.replace(" only", "").toLowerCase()}</b>. You can still save it here.</span>
            </div>
          )}

          {lotInfo && (
            <label className={`mt-4 flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
              f.fence_told ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50 hover:bg-amber-100/60"}`}>
              <span className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
                f.fence_told ? "border-emerald-500 bg-emerald-500 text-white" : "border-amber-400 bg-white"}`}>
                <input type="checkbox" className="absolute inset-0 cursor-pointer opacity-0" checked={f.fence_told}
                  onChange={(e) => set("fence_told", e.target.checked)} />
                {f.fence_told && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
              <span>
                <span className={`block font-bold ${f.fence_told ? "text-emerald-900" : "text-amber-900"}`}>
                  Tell the guest: park in {lotInfo.name}, {lotInfo.place}.
                </span>
                <span className={`text-sm ${f.fence_told ? "text-emerald-700" : "text-amber-800"}`}>
                  {f.fence_told ? "Done. Guest has been told." : "Tick when you have told them."}
                </span>
              </span>
            </label>
          )}
        </section>
      )}

      {error && (
        <div role="alert" className="flex animate-rise flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          {fullRetry && (
            <button type="button" className="btn-primary btn-sm" onClick={() => { chooseLot("lot3"); save(true); }}>
              Save in Lot 3
            </button>
          )}
        </div>
      )}

      {/* Save bar: sticks to the bottom on phones */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 p-3 backdrop-blur-xl sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="flex items-center justify-end gap-3">
          <span className="mr-auto hidden text-sm text-slate-500 sm:block">
            {isFuture ? "Saved as a future reservation." : `Leaves ${fmtDateTime(checkout)}.`}
          </span>
          <button type="submit" className="btn-primary btn-lg w-full sm:w-auto" disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : isNew ? (isFuture ? <CalendarCheck /> : <LogIn />) : <Check />}
            {busy ? "Saving..." : isNew ? (isFuture ? "Save reservation" : "Check in car") : "Save changes"}
          </button>
        </div>
      </div>
      </div>

      {/* Map: small card on the right (below the form on phones) */}
      {!isFuture && (
        <aside className="lg:sticky lg:top-24">
          <LotMapCard pin={f.spot} onChange={choosePin} lot={lot} others={otherPins.filter((o) => o.id !== record?.id)}
            plate={f.license_plate.trim() || undefined} />
        </aside>
      )}
    </form>
  );
}

/** Whole calendar days from one date to another (at least 1). */
function daysBetween(from: Date, to: Date) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(1, Math.min(365, Math.round((b - a) / 86_400_000)));
}

function nextMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function Choice({ active, onClick, icon, title, sub, disabled }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} data-active={active} disabled={disabled} aria-pressed={active}
      className="choice group relative flex flex-col items-start gap-2.5 p-3.5 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors [&>svg]:h-5 [&>svg]:w-5 ${
        active ? "bg-brand-600 text-white shadow-md shadow-brand-600/30" : "bg-slate-100 text-slate-500"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-bold ${active ? "text-brand-900" : "text-slate-800"}`}>{title}</span>
        <span className="block text-xs text-slate-500 sm:truncate">{sub}</span>
      </span>
      <span className={`absolute right-3 top-3 flex h-5 w-5 sm:static shrink-0 items-center justify-center rounded-full border-2 transition ${
        active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}>
        {active && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required, autoFocus, mono, icon, onFocus, onBlur, onKeyDown, inputRef, suggest }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
  placeholder?: string; required?: boolean; autoFocus?: boolean; mono?: boolean; icon?: React.ReactNode;
  onFocus?: () => void; onBlur?: () => void; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>; suggest?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="relative">
      <label className="label" htmlFor={id}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        )}
        <input id={id} ref={inputRef} type={type} value={value} placeholder={placeholder} required={required} autoFocus={autoFocus}
          autoComplete="off" onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} onChange={(e) => onChange(e.target.value)}
          className={`input ${icon ? "pl-9" : ""} ${mono ? "font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal" : ""}`} />
      </div>
      {suggest}
    </div>
  );
}
