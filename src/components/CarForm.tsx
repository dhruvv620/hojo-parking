"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LOT_CAPACITY } from "@/lib/config";
import { isLotFullError, type Location, type ParkingRecord, type Source } from "@/lib/types";
import { addDays, fmtDateTime, fromLocalInput, toLocalInput } from "@/lib/time";

type Props = {
  /** The record being edited. Leave out to add a new car. */
  record?: ParkingRecord;
  /** How many cars are inside the fence right now. */
  insideCount: number;
  onSaved: (r: ParkingRecord, note?: string) => void;
};

export function CarForm({ record, insideCount, onSaved }: Props) {
  const isNew = !record;
  const wasInside =
    !!record && record.status === "parked" && record.location === "inside" &&
    new Date(record.checkout_at).getTime() > Date.now();
  // Inside spots this car could take. A car already inside keeps its spot.
  const lotFull = insideCount >= LOT_CAPACITY && !wasInside;

  const [mode, setMode] = useState<"now" | "future">(record?.status === "reserved" ? "future" : "now");
  const [f, setF] = useState({
    guest_name: record?.guest_name ?? "",
    phone: record?.phone ?? "",
    room_number: record?.room_number ?? "",
    source: (record?.source ?? "walk_in") as Source,
    license_plate: record?.license_plate ?? "",
    plate_state: record?.plate_state ?? "",
    make: record?.make ?? "",
    model: record?.model ?? "",
    color: record?.color ?? "",
    location: (record?.location ?? (lotFull ? "outside" : "inside")) as Location,
    arrival: toLocalInput(record?.arrival_at ?? new Date()),
    futureArrival: toLocalInput(record?.status === "reserved" ? record.arrival_at : nextMorning()),
    days: record?.days ?? 1,
    fence_told: record?.fence_told ?? false,
    notes: record?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullRetry, setFullRetry] = useState(false);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const isFuture = isNew ? mode === "future" : record.status === "reserved";
  const arrivalIso = isFuture
    ? fromLocalInput(f.futureArrival)
    : isNew
      ? new Date().toISOString()
      : fromLocalInput(f.arrival);
  const days = Math.max(1, Math.min(365, Number(f.days) || 1));
  const checkout = addDays(arrivalIso, days);
  // If the lot fills up while this form is open, switch to outside automatically.
  const loc: Location = lotFull ? "outside" : f.location;
  const showInside = !isFuture && loc === "inside";

  async function save(forceOutside = false) {
    setBusy(true);
    setError(null);
    setFullRetry(false);

    const location: Location = forceOutside ? "outside" : loc;
    const payload = {
      guest_name: f.guest_name.trim(),
      phone: f.phone.trim() || null,
      room_number: f.room_number.trim() || null,
      source: f.source,
      license_plate: f.license_plate.trim(),
      plate_state: f.plate_state.trim() || null,
      make: f.make.trim() || null,
      model: f.model.trim() || null,
      color: f.color.trim() || null,
      location,
      arrival_at: arrivalIso,
      days,
      fence_told: location === "inside" ? f.fence_told : false,
      notes: f.notes.trim() || null,
      ...(isNew ? { status: isFuture ? "reserved" : "parked" } : {}),
    };

    const sb = supabaseBrowser().from("parking_records");
    const { data, error } = isNew
      ? await sb.insert(payload).select().single()
      : await sb.update(payload).eq("id", record.id).select().single();

    setBusy(false);
    if (error) {
      if (isLotFullError(error.message)) {
        setError(`The lot just filled up (${LOT_CAPACITY} / ${LOT_CAPACITY}). Park this car outside the fence?`);
        setFullRetry(true);
      } else {
        setError(error.message);
      }
      return;
    }
    onSaved(data as ParkingRecord, forceOutside ? "Saved as parked OUTSIDE the fence." : undefined);
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
    <form onSubmit={onSubmit} className="space-y-6">
      {/* When */}
      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">Stay</h2>

        {isNew && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <ModeButton active={mode === "now"} onClick={() => setMode("now")} title="Arriving now" sub="Car is here, parking it" />
            <ModeButton active={mode === "future"} onClick={() => setMode("future")} title="Future reservation" sub="Coming on a later date" />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">{isFuture ? "Expected arrival" : "Arrived"}</label>
            {isNew && !isFuture ? (
              <div className="input bg-slate-50 text-slate-600">Now ({fmtDateTime(new Date())})</div>
            ) : (
              <input type="datetime-local" className="input" required
                value={isFuture ? f.futureArrival : f.arrival}
                onChange={(e) => set(isFuture ? "futureArrival" : "arrival", e.target.value)} />
            )}
          </div>
          <div>
            <label className="label">Days paid</label>
            <div className="flex gap-1.5">
              <input type="number" min={1} max={365} className="input w-20 text-center" value={f.days}
                onChange={(e) => set("days", e.target.value === "" ? ("" as unknown as number) : Number(e.target.value))} />
              {[1, 2, 3, 7].map((d) => (
                <button type="button" key={d} onClick={() => set("days", d)}
                  className={`flex-1 rounded-xl border text-sm font-semibold ${days === d ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Leaves by (automatic)</label>
            <div className="input bg-emerald-50 font-semibold text-emerald-800">{fmtDateTime(checkout)}</div>
            <p className="mt-1 text-xs text-slate-500">{days} x 24 hours. Spot frees up on its own.</p>
          </div>
        </div>

        {isFuture && (
          <p className="mt-4 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
            This will show under <b>Upcoming reservations</b> and will not take a spot. When the guest shows up, press{" "}
            <b>Arrived</b>: the paid days start counting from that moment.
          </p>
        )}
      </section>

      {/* Guest + car */}
      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">Guest and car</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guest name *" value={f.guest_name} onChange={(v) => set("guest_name", v)} autoFocus={isNew} required />
          <div>
            <label className="label">Booked</label>
            <div className="grid grid-cols-2 gap-2">
              {(["walk_in", "online"] as const).map((s) => (
                <button type="button" key={s} onClick={() => set("source", s)}
                  className={`rounded-xl border py-2.5 text-sm font-semibold ${f.source === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                  {s === "walk_in" ? "Walk-in" : "Online"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <Field label="Plate number *" value={f.license_plate} onChange={(v) => set("license_plate", v.toUpperCase())} required mono />
            <Field label="State" value={f.plate_state} onChange={(v) => set("plate_state", v.toUpperCase())} placeholder="NJ" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Make" value={f.make} onChange={(v) => set("make", v)} placeholder="Toyota" />
            <Field label="Model" value={f.model} onChange={(v) => set("model", v)} placeholder="Camry" />
            <Field label="Color" value={f.color} onChange={(v) => set("color", v)} placeholder="Gray" />
          </div>
          <Field label="Phone" value={f.phone} onChange={(v) => set("phone", v)} type="tel" />
          <Field label="Room #" value={f.room_number} onChange={(v) => set("room_number", v)} />
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input min-h-20" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Where */}
      {!isFuture && (
        <section className="card p-5">
          <h2 className="mb-1 text-lg font-bold">Where is it parked?</h2>
          <p className="mb-4 text-sm text-slate-500">
            {insideCount} of {LOT_CAPACITY} inside spots are taken{wasInside ? " (including this car)" : ""}.
          </p>
          {lotFull && (
            <div className="mb-4 rounded-xl bg-red-600 px-4 py-3 text-white">
              <b>LOT FULL.</b> No inside spots left. This car will be logged as parking <b>outside the fence</b>.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={lotFull} onClick={() => set("location", "inside")}
              className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-40 ${loc === "inside" ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-300 hover:bg-slate-50"}`}>
              <div className="font-bold">Inside the fence</div>
              <div className="text-xs text-slate-500">Counts toward the {LOT_CAPACITY}</div>
            </button>
            <button type="button" onClick={() => set("location", "outside")}
              className={`rounded-xl border p-4 text-left ${loc === "outside" ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-300 hover:bg-slate-50"}`}>
              <div className="font-bold">Outside the fence</div>
              <div className="text-xs text-slate-500">Lot full or overflow</div>
            </button>
          </div>

          {showInside && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-amber-600" checked={f.fence_told}
                onChange={(e) => set("fence_told", e.target.checked)} />
              <span>
                <span className="block font-bold text-amber-900">Tell the guest: park INSIDE the fence only.</span>
                <span className="text-sm text-amber-800">Tick when you have told them.</span>
              </span>
            </label>
          )}
        </section>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          {fullRetry && (
            <button type="button" className="btn-primary btn-sm" onClick={() => { set("location", "outside"); save(true); }}>
              Save as outside
            </button>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="submit" className="btn-primary px-8 py-3 text-base" disabled={busy}>
          {busy ? "Saving..." : isNew ? (isFuture ? "Save reservation" : "Check in car") : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function nextMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function ModeButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl border p-3 text-left ${active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-300 hover:bg-slate-50"}`}>
      <div className="font-bold">{title}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </button>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required, autoFocus, mono }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
  placeholder?: string; required?: boolean; autoFocus?: boolean; mono?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className={`input ${mono ? "font-mono uppercase" : ""}`} value={value} placeholder={placeholder}
        required={required} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
