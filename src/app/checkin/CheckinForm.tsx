"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight, CalendarCheck, CircleAlert, CircleCheck, Hash, LoaderCircle, MapPin, Phone, RectangleHorizontal,
  SquareParking, TriangleAlert, UserRound,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HOTEL_NAME } from "@/lib/config";
import { LOTS, VEHICLES, lotById, lotFits, suggestLot, type LotId, type VehicleType } from "@/lib/lots";
import { DatePicker } from "@/components/ui/DatePicker";
import { VehicleIcon } from "@/components/ui/bits";
import { DirectionsButtons } from "@/components/DirectionsButtons";
import { LANG_KEY, WORDS, startingLang, translateError, type Lang, type Words } from "./i18n";

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
  // whether Lot 1 has room (guests only learn yes/no, never the number of spots)
  const [lot1Open, setLot1Open] = useState(true);
  const [lotsFull, setLotsFull] = useState<LotId[]>([]);
  const [pick, setPick] = useState<LotId | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [f, setF] = useState({ name: "", phone: "", plate: "", state: "AZ", make: "", model: "", color: "", confirmation: "", website: "" });
  const [checkout, setCheckout] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [lang, setLangState] = useState<Lang>("en");
  const t = WORDS[lang];

  useEffect(() => { setLangState(startingLang()); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* private window */ }
  };
  const shell = { lang, onLang: setLang, t };

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    supabaseBrowser().rpc("guest_lot_info", { p_token: token }).then(({ data, error }: { data: { ok: boolean; lot1_open?: boolean; lot1_available?: number; lots_full?: LotId[] } | null; error: unknown }) => {
      if (error || !data?.ok) setStatus("invalid");
      else {
        setLot1Open(data.lot1_open ?? (data.lot1_available ?? 1) > 0);
        setLotsFull(data.lots_full ?? []);
        setStatus("ready");
      }
    });
  }, [token]);

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const days = daysFromToday(checkout);
  // lots this guest may use: allowed for their vehicle, not marked Full by staff,
  // and (Lot 1) not out of spots. Cars & SUVs: Lot 1 / Lot 3; trucks: Lot 2 / Lot 3.
  const options: LotId[] = vehicle
    ? (["lot1", "lot2", "lot3"] as LotId[]).filter((id) => lotFits(id, vehicle) && !lotsFull.includes(id) && !(id === "lot1" && !lot1Open))
    : [];
  const lot = lotById(pick && options.includes(pick) ? pick : options[0]);
  // the lot they'd normally get, for the "ask the front desk" message when nothing is open
  const usual = vehicle ? lotById(suggestLot(vehicle, !lot1Open)) : null;
  const askDesk = !!vehicle && options.length === 0;
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
    const args = {
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
    };
    let { data, error } = await supabaseBrowser().rpc("guest_check_in", { ...args, p_lot: lot?.id ?? null });
    // before update 11 the database doesn't know p_lot: send without it
    if (error && /p_lot|function|schema cache/i.test(error.message)) {
      ({ data, error } = await supabaseBrowser().rpc("guest_check_in", args));
    }
    setBusy(false);
    if (error) {
      setError(translateError(niceError(error.message), lang));
      return;
    }
    const d = data as { ok: boolean; error?: string; ref: string; lot: LotId | null; full_lot?: LotId | null; checkout_at: string; matched_reservation: boolean; already?: boolean };
    if (!d?.ok) {
      setError(d?.error ? translateError(d.error, lang) : t.wrong);
      return;
    }
    setDone({ ref: d.ref, lot: d.lot, fullLot: d.full_lot ?? null, checkout_at: d.checkout_at, name: f.name.trim(), plate: f.plate.trim().toUpperCase(), matched: d.matched_reservation, already: !!d.already });
    window.scrollTo({ top: 0 });
  }

  /* ---------------- screens ---------------- */

  if (status === "loading") {
    return <Shell {...shell}><div className="flex justify-center py-24"><LoaderCircle className="h-6 w-6 animate-spin text-slate-400" /></div></Shell>;
  }

  if (status === "invalid") {
    return (
      <Shell {...shell}>
        <div className="card mt-6 p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><CircleAlert className="h-6 w-6" /></span>
          <h1 className="mt-4 text-xl font-bold">{t.linkBroken}</h1>
          <p className="mt-2 text-slate-600">{t.linkBrokenText}</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    const l = lotById(done.lot);
    const fl = lotById(done.fullLot);
    return (
      <Shell {...shell}>
        <div className="card mt-6 animate-rise overflow-hidden">
          <div className="bg-gradient-to-b from-emerald-50 to-white px-6 pb-4 pt-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
              <CircleCheck className="h-8 w-8" />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{t.allSet(done.name.split(" ")[0])}</h1>
            <p className="mt-1 text-slate-600">{(() => { const [a, b, c] = t.registered(done.plate); return <>{a}<b className="font-mono">{b}</b>{c}</>; })()}</p>
          </div>
          <div className="space-y-4 px-6 pb-6">
            {l ? (
            <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-brand-700">{t.parkIn}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${l.dot}`} />
                <span className="text-2xl font-extrabold text-slate-900">{t.lotName[l.id]}</span>
              </div>
              <div className="text-sm text-slate-600">{t.lotPlace[l.id]} · {t.lotRule[l.id]}</div>
              {l.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.src} alt={t.fromAbove(t.lotName[l.id])} className="mt-3 w-full rounded-xl object-cover" style={{ aspectRatio: `${l.w} / ${l.h}`, maxHeight: 260 }} />
              )}
              <div className="mt-3"><DirectionsButtons lot={l.id} size="lg" words={t} /></div>
            </div>
            ) : (
              <AskDesk t={t} lotName={fl ? t.lotName[fl.id] : undefined} big />
            )}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t.checkout}</dt>
                <dd className="font-semibold">{new Date(done.checkout_at).toLocaleDateString(t.locale, { weekday: "short", month: "short", day: "numeric" })}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t.reference}</dt>
                <dd className="font-mono text-lg font-bold tracking-wider">#{done.ref}</dd>
              </div>
            </dl>
            {done.matched && <p className="text-sm text-emerald-700">{t.matched}</p>}
            {done.already && <p className="text-sm text-emerald-700">{t.already}</p>}
            <p className="text-center text-sm text-slate-500">{t.showDesk}</p>
          </div>
        </div>
        <button type="button" className="btn-ghost mx-auto mt-4 flex" onClick={() => { setDone(null); setVehicle(null); setTried(false); setF({ name: "", phone: "", plate: "", state: "AZ", make: "", model: "", color: "", confirmation: "", website: "" }); }}>
          {t.another}
        </button>
      </Shell>
    );
  }

  return (
    <Shell {...shell}>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4 pb-28">
        {/* 1. vehicle type */}
        <Card n={1} title={t.whatParking} missing={tried && missing.vehicle}>
          <div className="grid grid-cols-3 gap-2">
            {VEHICLES.map((v) => (
              <button key={v.id} type="button" onClick={() => setVehicle(v.id)} data-active={vehicle === v.id} aria-pressed={vehicle === v.id}
                className="choice flex flex-col items-center gap-1.5 py-4 text-sm font-bold text-slate-700 data-[active=true]:text-brand-700">
                <VehicleIcon type={v.id} className="h-7 w-7" />
                {t.vehicle[v.id]}
              </button>
            ))}
          </div>
          {tried && missing.vehicle && <Hint>{t.chooseOne}</Hint>}
        </Card>

        {/* where to park */}
        <section className="card overflow-hidden">
          {askDesk ? (
            <div className="animate-rise border-b border-slate-100 p-4"><AskDesk t={t} lotName={usual ? t.lotName[usual.id] : undefined} /></div>
          ) : lot ? (
            <div className="animate-rise border-b border-slate-100 bg-gradient-to-b from-brand-50/80 to-white p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">
                <MapPin className="h-3.5 w-3.5" /> {options.length > 1 ? t.chooseWhere : t.parkHere}
              </div>
              {options.length > 1 ? (
                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.chooseLot}>
                  {options.map((id) => {
                    const o = lotById(id)!;
                    const active = id === lot.id;
                    return (
                      <button key={id} type="button" role="radio" aria-checked={active} onClick={() => setPick(id)}
                        className={`relative overflow-hidden rounded-xl border-2 bg-white text-left transition active:scale-[0.98] ${
                          active ? "border-brand-500 shadow-md shadow-brand-600/10" : "border-slate-200 hover:border-slate-300"}`}>
                        {o.src && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.src} alt="" className="h-20 w-full object-cover" />
                        )}
                        <span className="block p-2.5">
                          <span className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${o.dot}`} />
                            <span className="font-extrabold">{t.lotName[o.id]}</span>
                          </span>
                          <span className="block text-xs text-slate-500">
                            {t.lotRule[o.id]}
                          </span>
                        </span>
                        {active && (
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow">
                            <CircleCheck className="h-4 w-4" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${lot.dot}`} />
                    <span className="text-xl font-extrabold">{t.lotName[lot.id]}</span>
                    <span className="text-sm text-slate-500">· {t.lotRule[lot.id]}</span>
                  </div>
                  {lot.src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lot.src} alt={t.fromAbove(t.lotName[lot.id])} className="mt-3 w-full rounded-xl object-cover" style={{ maxHeight: 220 }} />
                  )}
                </>
              )}
              <div className="mt-3 text-sm text-slate-600"><b className="text-slate-800">{t.lotName[lot.id]}</b> · {t.lotPlace[lot.id]}</div>
              <div className="mt-3"><DirectionsButtons lot={lot.id} words={t} /></div>
            </div>
          ) : null}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <SquareParking className="h-4 w-4 text-slate-400" /> {t.rules}
            </div>
            <ul className="space-y-1.5">
              {LOTS.filter((l) => l.id !== "hotel").map((l) => (
                <li key={l.id} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${!askDesk && lot?.id === l.id ? "bg-brand-50 ring-1 ring-brand-200" : ""}`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${l.dot}`} />
                  <b className="w-14 shrink-0">{t.lotName[l.id]}</b>
                  <span className="flex-1 text-slate-600">{t.lotRule[l.id]}</span>
                  {lotsFull.includes(l.id) && <span className="chip bg-red-100 text-red-700">{t.full}</span>}
                  {!askDesk && lot?.id === l.id && <ArrowRight className="h-4 w-4 text-brand-600" />}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 2. guest */}
        <Card n={2} title={t.yourDetails} missing={tried && missing.name}>
          <Input id="full-name" label={t.fullName} required icon={<UserRound />} value={f.name} onChange={(v) => set("name", v)} autoComplete="name"
            error={tried && missing.name ? t.enterName : undefined} />
          <Input id="phone" label={t.phone} icon={<Phone />} value={f.phone} onChange={(v) => set("phone", v)} type="tel" autoComplete="tel" placeholder={t.optional} />
        </Card>

        {/* 3. car */}
        <Card n={3} title={t.yourCar} missing={tried && (missing.plate || missing.make || missing.model)}>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <Input id="license-plate" label={t.plate} required icon={<RectangleHorizontal />} value={f.plate} mono
              onChange={(v) => set("plate", v.toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 12))} autoComplete="off" placeholder="ABC 1234"
              error={tried && missing.plate ? t.enterPlate : undefined} />
            <Input id="state" label={t.state} value={f.state} onChange={(v) => set("state", v.toUpperCase().slice(0, 3))} autoComplete="off" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input id="make" label={t.make} required value={f.make} onChange={(v) => set("make", v)} placeholder="Toyota"
              error={tried && missing.make ? t.required : undefined} />
            <Input id="model" label={t.model} required value={f.model} onChange={(v) => set("model", v)} placeholder="Camry"
              error={tried && missing.model ? t.required : undefined} />
          </div>
          <Input id="color" label={t.color} value={f.color} onChange={(v) => set("color", v)} placeholder={t.optional} />
        </Card>

        {/* 4. stay */}
        <Card n={4} title={t.yourStay}>
          <div>
            <span className="label">{t.checkoutDate} <span className="text-red-500">*</span></span>
            <DatePicker mode="date" ariaLabel={t.checkoutDate} value={checkout} lang={lang}
              minDate={(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; })()}
              onChange={setCheckout}
              footer={(d) => { const n = daysFromToday(d); return <><b className="text-slate-800">{t.days(n)}</b> {t.ofParking}</>; }}
              triggerClassName="input flex items-center gap-2 text-left"
              renderTrigger={() => (
                <>
                  <CalendarCheck className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1 font-semibold">{checkout.toLocaleDateString(t.locale, { weekday: "long", month: "short", day: "numeric" })}</span>
                  <span className="text-xs font-semibold text-slate-500">{t.days(days)}</span>
                </>
              )} />
          </div>
          <Input id="booked-online-confirmation-" label={t.confirmation} icon={<Hash />} value={f.confirmation} mono
            onChange={(v) => set("confirmation", v)} autoComplete="off" placeholder={t.optional} />
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
              {busy ? t.submitting : t.submit}
            </button>
          </div>
        </div>
      </form>
    </Shell>
  );
}

/* ---------------- pieces ---------------- */

function Shell({ children, lang, onLang, t }: { children: React.ReactNode; lang: Lang; onLang: (l: Lang) => void; t: Words }) {
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 pb-8 pt-6">
      <header className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-96.png" alt={HOTEL_NAME} width={112} height={44} className="logo-pill h-11 w-auto" />
        <div className="border-l border-slate-200 pl-3 text-sm font-semibold leading-tight text-slate-500">
          {t.checkIn.split("\n").map((line, i) => <span key={i} className="block">{line}</span>)}
        </div>
        <div role="radiogroup" aria-label="Language / Idioma" className="ml-auto flex rounded-lg bg-slate-100 p-0.5">
          {(["en", "es"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => onLang(l)}
              title={l === "en" ? "English" : "Español"}
              className={`h-8 rounded-md px-3 text-xs font-bold transition ${lang === l ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {l.toUpperCase()}
            </button>
          ))}
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
        <span className="flex h-6 w-6 items-center justify-center fixed-colors rounded-full bg-slate-900 text-xs font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-red-600">{children}</p>;
}

function Input({ id: idPart, label, value, onChange, required, icon, type = "text", placeholder, autoComplete, mono, error }: {
  id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean; icon?: React.ReactNode;
  type?: string; placeholder?: string; autoComplete?: string; mono?: boolean; error?: string;
}) {
  const id = `f-${idPart}`;
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
function AskDesk({ t, lotName, big }: { t: Words; lotName?: string; big?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 border-amber-300 bg-amber-50 ${big ? "p-5" : "p-4"}`}>
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
        <TriangleAlert className="h-3.5 w-3.5" /> {lotName ? t.isFull(lotName) : t.parkingFull}
      </div>
      <p className={`mt-1 font-bold text-slate-900 ${big ? "text-xl" : "text-lg"}`}>{t.askDesk}</p>
      <p className="mt-1 text-sm text-slate-600">{t.dontPark}</p>
    </div>
  );
}
