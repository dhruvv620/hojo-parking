"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight, CalendarCheck, Car, CircleAlert, CircleCheck, Hash, LoaderCircle, MapPin, Phone, RectangleHorizontal,
  SquareParking, TriangleAlert, UserRound,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HOTEL_NAME } from "@/lib/config";
import { LOTS, VEHICLES, lotById, suggestLot, type LotId, type VehicleType } from "@/lib/lots";
import { DatePicker } from "@/components/ui/DatePicker";
import { VehicleIcon } from "@/components/ui/bits";
import { DirectionsButtons } from "@/components/DirectionsButtons";

type Done = { ref: string; lot: LotId | null; fullLot: LotId | null; checkout_at: string; name: string; plate: string; matched: boolean; already: boolean };

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysFromToday = (d: Date) => Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
const niceError = (m: string) => m.replace(/^[A-Z_]+:\s*/, "");

/** Public form guests open by scanning the QR sign at the front desk. */
export function CheckinForm() {
  const token = useSearchParams().get("k") ?? "";
  const [status, setStatus] = useState<"loading" | "invalid" | "ready">("loading");
  const [lot1Free, setLot1Free] = useState<number | null>(null);
  const [lotsFull, setLotsFull] = useState<LotId[]>([]);
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [f, setF] = useState({ name: "", phone: "", plate: "", state: "AZ", make: "", model: "", color: "", confirmation: "", website: "" });
  const [checkout, setCheckout] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    supabaseBrowser().rpc("guest_lot_info", { p_token: token }).then(({ data, error }: { data: { ok: boolean; lot1_available?: number; lots_full?: LotId[] } | null; error: unknown }) => {
      if (error || !data?.ok) setStatus("invalid");
      else { setLot1Free(data.lot1_available ?? null); setLotsFull(data.lots_full ?? []); setStatus("ready"); }
    });
  }, [token]);

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const days = daysFromToday(checkout);
  const lot = vehicle ? lotById(suggestLot(vehicle, lot1Free === 0)) : null;
  // staff marked this lot Full: the guest asks the front desk instead
  const lotIsFull = !!lot && lotsFull.includes(lot.id);
  const missing = {
    vehicle: !vehicle,
    name: f.name.trim().length < 2,
    plate: f.plate.trim().length < 2,
    make: !f.make.trim(),
    model: !f.model.trim(),
  };
  const invalid = Object.values(missing).some(Boolean) || days < 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (invalid) {
      document.querySelector("[data-missing=true]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("guest_check_in", {
      p_token: token,
      p_name: f.name.trim(),
      p_phone: f.phone.trim(),
      p_vehicle_type: vehicle,
      p_plate: f.plate.trim(),
      p_state: f.state.trim(),
      p_make: f.make.trim(),
      p_model: f.model.trim(),
      p_color: f.color.trim(),
      p_confirmation: f.confirmation.trim(),
      p_checkout_date: ymd(checkout),
      p_website: f.website,
    });
    setBusy(false);
    if (error) {
      setError(niceError(error.message));
      return;
    }
    const d = data as { ok: boolean; error?: string; ref: string; lot: LotId | null; full_lot?: LotId | null; checkout_at: string; matched_reservation: boolean; already?: boolean };
    if (!d?.ok) {
      setError(d?.error ?? "Something went wrong. Please ask the front desk.");
      return;
    }
    setDone({ ref: d.ref, lot: d.lot, fullLot: d.full_lot ?? null, checkout_at: d.checkout_at, name: f.name.trim(), plate: f.plate.trim().toUpperCase(), matched: d.matched_reservation, already: !!d.already });
    window.scrollTo({ top: 0 });
  }

  /* ---------------- screens ---------------- */

  if (status === "loading") {
    return <Shell><div className="flex justify-center py-24"><LoaderCircle className="h-6 w-6 animate-spin text-slate-400" /></div></Shell>;
  }

  if (status === "invalid") {
    return (
      <Shell>
        <div className="card mt-6 p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><CircleAlert className="h-6 w-6" /></span>
          <h1 className="mt-4 text-xl font-bold">This link isn&apos;t working</h1>
          <p className="mt-2 text-slate-600">Please scan the QR code at the front desk again, or ask the front desk to check you in.</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    const l = lotById(done.lot);
    const fl = lotById(done.fullLot);
    return (
      <Shell>
        <div className="card mt-6 animate-rise overflow-hidden">
          <div className="bg-gradient-to-b from-emerald-50 to-white px-6 pb-4 pt-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
              <CircleCheck className="h-8 w-8" />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">You&apos;re all set, {done.name.split(" ")[0]}!</h1>
            <p className="mt-1 text-slate-600">Your car <b className="font-mono">{done.plate}</b> is registered.</p>
          </div>
          <div className="space-y-4 px-6 pb-6">
            {l ? (
            <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-brand-700">Please park in</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${l.dot}`} />
                <span className="text-2xl font-extrabold text-slate-900">{l.name}</span>
              </div>
              <div className="text-sm text-slate-600">{l.place} · {l.rule}</div>
              {l.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.src} alt={`${l.name} from above`} className="mt-3 w-full rounded-xl object-cover" style={{ aspectRatio: `${l.w} / ${l.h}`, maxHeight: 260 }} />
              )}
              <div className="mt-3"><DirectionsButtons lot={l.id} size="lg" /></div>
            </div>
            ) : (
              <AskDesk lotName={fl?.name} big />
            )}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Checkout</dt>
                <dd className="font-semibold">{new Date(done.checkout_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Reference</dt>
                <dd className="font-mono text-lg font-bold tracking-wider">#{done.ref}</dd>
              </div>
            </dl>
            {done.matched && <p className="text-sm text-emerald-700">We found your online booking and linked it.</p>}
            {done.already && <p className="text-sm text-emerald-700">This car was already checked in, so nothing new was added.</p>}
            <p className="text-center text-sm text-slate-500">Show this screen to the front desk if they ask.</p>
          </div>
        </div>
        <button type="button" className="btn-ghost mx-auto mt-4 flex" onClick={() => { setDone(null); setVehicle(null); setTried(false); setF({ name: "", phone: "", plate: "", state: "AZ", make: "", model: "", color: "", confirmation: "", website: "" }); }}>
          Register another car
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4 pb-28">
        {/* 1. vehicle type */}
        <Card n={1} title="What are you parking?" missing={tried && missing.vehicle}>
          <div className="grid grid-cols-3 gap-2">
            {VEHICLES.map((v) => (
              <button key={v.id} type="button" onClick={() => setVehicle(v.id)} data-active={vehicle === v.id} aria-pressed={vehicle === v.id}
                className="choice flex flex-col items-center gap-1.5 py-4 text-sm font-bold text-slate-700 data-[active=true]:text-brand-700">
                <VehicleIcon type={v.id} className="h-7 w-7" />
                {v.label}
              </button>
            ))}
          </div>
          {tried && missing.vehicle && <Hint>Please choose one.</Hint>}
        </Card>

        {/* where to park */}
        <section className="card overflow-hidden">
          {lot && lotIsFull ? (
            <div className="animate-rise border-b border-slate-100 p-4"><AskDesk lotName={lot.name} /></div>
          ) : lot ? (
            <div className="animate-rise border-b border-slate-100 bg-gradient-to-b from-brand-50/80 to-white p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">
                <MapPin className="h-3.5 w-3.5" /> Park here
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${lot.dot}`} />
                <span className="text-xl font-extrabold">{lot.name}</span>
                <span className="text-sm text-slate-500">· {lot.rule}</span>
              </div>
              <div className="text-sm text-slate-600">{lot.place}</div>
              {vehicle !== "truck" && lot1Free === 0 && (
                <p className="mt-1 text-xs font-medium text-amber-700">Lot 1 is full right now, so please use Lot 3.</p>
              )}
              {lot.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lot.src} alt={`${lot.name} from above`} className="mt-3 w-full rounded-xl object-cover" style={{ maxHeight: 220 }} />
              )}
              <div className="mt-3"><DirectionsButtons lot={lot.id} /></div>
            </div>
          ) : null}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <SquareParking className="h-4 w-4 text-slate-400" /> Parking rules
            </div>
            <ul className="space-y-1.5">
              {LOTS.filter((l) => l.id !== "hotel").map((l) => (
                <li key={l.id} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${lot?.id === l.id ? "bg-brand-50 ring-1 ring-brand-200" : ""}`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${l.dot}`} />
                  <b className="w-12 shrink-0">{l.name}</b>
                  <span className="flex-1 text-slate-600">{l.rule}</span>
                  {lotsFull.includes(l.id) && <span className="chip bg-red-100 text-red-700">Full</span>}
                  {lot?.id === l.id && !lotsFull.includes(l.id) && <ArrowRight className="h-4 w-4 text-brand-600" />}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 2. guest */}
        <Card n={2} title="Your details" missing={tried && missing.name}>
          <Input label="Full name" required icon={<UserRound />} value={f.name} onChange={(v) => set("name", v)} autoComplete="name"
            error={tried && missing.name ? "Please enter your name." : undefined} />
          <Input label="Phone" icon={<Phone />} value={f.phone} onChange={(v) => set("phone", v)} type="tel" autoComplete="tel" placeholder="Optional" />
        </Card>

        {/* 3. car */}
        <Card n={3} title="Your car" missing={tried && (missing.plate || missing.make || missing.model)}>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <Input label="License plate" required icon={<RectangleHorizontal />} value={f.plate} mono
              onChange={(v) => set("plate", v.toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 12))} autoComplete="off" placeholder="ABC 1234"
              error={tried && missing.plate ? "Please enter your plate." : undefined} />
            <Input label="State" value={f.state} onChange={(v) => set("state", v.toUpperCase().slice(0, 3))} autoComplete="off" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Make" required value={f.make} onChange={(v) => set("make", v)} placeholder="Toyota"
              error={tried && missing.make ? "Required" : undefined} />
            <Input label="Model" required value={f.model} onChange={(v) => set("model", v)} placeholder="Camry"
              error={tried && missing.model ? "Required" : undefined} />
          </div>
          <Input label="Color" value={f.color} onChange={(v) => set("color", v)} placeholder="Optional" />
        </Card>

        {/* 4. stay */}
        <Card n={4} title="Your stay">
          <div>
            <span className="label">Check-out date <span className="text-red-500">*</span></span>
            <DatePicker mode="date" ariaLabel="Check-out date" value={checkout}
              minDate={(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; })()}
              onChange={setCheckout}
              footer={(d) => { const n = daysFromToday(d); return <><b className="text-slate-800">{n} day{n === 1 ? "" : "s"}</b> of parking</>; }}
              triggerClassName="input flex items-center gap-2 text-left"
              renderTrigger={() => (
                <>
                  <CalendarCheck className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1 font-semibold">{checkout.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
                  <span className="text-xs font-semibold text-slate-500">{days} day{days === 1 ? "" : "s"}</span>
                </>
              )} />
          </div>
          <Input label="Booked online? Confirmation #" icon={<Hash />} value={f.confirmation} mono
            onChange={(v) => set("confirmation", v)} autoComplete="off" placeholder="Optional" />
          {/* spam trap: hidden from people */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)}
            className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
        </Card>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur-xl">
          <div className="mx-auto max-w-lg">
            <button type="submit" disabled={busy} className="btn-primary btn-lg w-full">
              {busy ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
              {busy ? "Submitting..." : "Submit check-in"}
            </button>
          </div>
        </div>
      </form>
    </Shell>
  );
}

/* ---------------- pieces ---------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 pb-8 pt-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/30">
          <Car className="h-6 w-6" />
        </span>
        <div className="leading-tight">
          <div className="font-bold">{HOTEL_NAME}</div>
          <div className="text-sm text-slate-500">Parking check-in</div>
        </div>
      </header>
      {children}
    </main>
  );
}

function Card({ n, title, children, missing }: { n: number; title: string; children: React.ReactNode; missing?: boolean }) {
  return (
    <section data-missing={missing || undefined} className={`card space-y-3 p-4 transition ${missing ? "ring-2 ring-red-200" : ""}`}>
      <h2 className="flex items-center gap-2 font-bold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-red-600">{children}</p>;
}

function Input({ label, value, onChange, required, icon, type = "text", placeholder, autoComplete, mono, error }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; icon?: React.ReactNode;
  type?: string; placeholder?: string; autoComplete?: string; mono?: boolean; error?: string;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label} {required && <span className="text-red-500">*</span>}</label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className={`input ${icon ? "pl-9" : ""} ${mono ? "font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal" : ""} ${error ? "!border-red-400" : ""}`} />
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

/** "Lot X is full. Please check with the front desk where to park." */
function AskDesk({ lotName, big }: { lotName?: string; big?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 border-amber-300 bg-amber-50 ${big ? "p-5" : "p-4"}`}>
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
        <TriangleAlert className="h-3.5 w-3.5" /> {lotName ? `${lotName} is full` : "Parking is full"}
      </div>
      <p className={`mt-1 font-bold text-slate-900 ${big ? "text-xl" : "text-lg"}`}>Please check with the front desk where to park.</p>
      <p className="mt-1 text-sm text-slate-600">Please don&apos;t park yet. The front desk will tell you which lot to use.</p>
    </div>
  );
}
