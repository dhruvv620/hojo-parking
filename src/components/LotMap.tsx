"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Expand, ImageOff, Map as MapIcon, MapPin, MousePointerClick, X } from "lucide-react";
import { Modal } from "./ui/Modal";
import { LOTS, lotById, type LotId } from "@/lib/lots";

export type Pin = { map: LotId; x: number; y: number };
export type OtherPin = Pin & { id: string; label: string; sub?: string };

type Lot = (typeof LOTS)[number];

/** Saved picture of one lot (not a live map). Tap to drop a pin; pins are stored as percentages. */
export function MapCanvas({ lot, pin, onPick, others = [], big = false }: {
  lot: Lot;
  pin: Pin | null;
  onPick?: (p: Pin) => void;
  others?: OtherPin[];
  big?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const mine = pin && pin.map === lot.id ? pin : null;
  const dots = others.filter((o) => o.map === lot.id);

  if (!lot.src) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
        <ImageOff className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-semibold text-slate-600">No picture of {lot.name} yet</p>
        <p className="text-xs text-slate-400">The lot is still saved with the car. A map pin can be added once there&apos;s a picture.</p>
      </div>
    );
  }

  function pick(e: React.MouseEvent) {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    onPick({ map: lot.id, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  }

  return (
    <div ref={ref} onClick={pick} role={onPick ? "button" : "img"} aria-label={`${lot.name} map`}
      className={`fixed-colors relative w-full select-none overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 ${onPick ? "cursor-crosshair" : ""}`}
      style={{ aspectRatio: `${lot.w} / ${lot.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={lot.id} src={lot.src} alt={`Top-down view of ${lot.name}`} draggable={false}
        className="pointer-events-none map-image absolute inset-0 h-full w-full animate-fade object-cover" />

      {dots.map((o) => (
        <span key={o.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${o.x}%`, top: `${o.y}%` }}
          onMouseEnter={() => setHover(o.id)} onMouseLeave={() => setHover(null)}>
          <span className={`block rounded-full border-2 border-white bg-slate-900/70 shadow ${big ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`} />
          {hover === o.id && (
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
              {o.label}{o.sub && <span className="font-normal text-slate-300"> · {o.sub}</span>}
            </span>
          )}
        </span>
      ))}

      {mine && (
        <span key={`${mine.x}-${mine.y}`} className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full animate-pop"
          style={{ left: `${mine.x}%`, top: `${mine.y}%` }}>
          <MapPin className={`fill-brand-600 text-white drop-shadow-[0_3px_4px_rgb(0_0_0/0.45)] ${big ? "h-11 w-11" : "h-8 w-8"}`} strokeWidth={1.5} />
        </span>
      )}

      {onPick && !mine && (
        <span className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-slate-900/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            <MousePointerClick className="h-3.5 w-3.5" /> Tap where the car is parked
          </span>
        </span>
      )}
    </div>
  );
}

/** Tabs to look at the four lots. */
function LotTabs({ value, onChange, pin, current, others }: {
  value: LotId; onChange: (m: LotId) => void; pin: Pin | null; current: LotId | null; others: OtherPin[];
}) {
  return (
    <div role="tablist" aria-label="Lot" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
      {LOTS.map((l) => {
        const active = l.id === value;
        const count = others.filter((o) => o.map === l.id).length;
        return (
          <button key={l.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(l.id)} title={`${l.name}: ${l.rule}`}
            className={`relative flex h-8 items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold transition-all duration-200 ${
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            {(pin?.map === l.id || (!pin && current === l.id)) && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${l.dot}`} />}
            <span className="truncate">{l.id === "hotel" ? "Hotel" : l.name}</span>
            {count > 0 && <span className="hidden text-[10px] font-medium tabular-nums text-slate-400 xl:inline">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Small map card for the side of the Add / Edit car form. It follows the lot
 * chosen in the form; dropping a pin on another lot's picture moves the car there.
 */
export function LotMapCard({ pin, onChange, lot, others = [], plate }: {
  pin: Pin | null;
  onChange: (p: Pin | null) => void;
  /** Lot chosen in the form. */
  lot: LotId | null;
  others?: OtherPin[];
  plate?: string;
}) {
  const [big, setBig] = useState(false);
  const [openOnPhone, setOpenOnPhone] = useState(false);
  const [view, setView] = useState<LotId>(pin?.map ?? lot ?? "lot1");
  // follow the form's lot choice
  useEffect(() => { if (lot) setView(lot); }, [lot]);
  const shown = lotById(view)!;
  const pinLot = pin ? lotById(pin.map) : null;

  const tabs = <LotTabs value={view} onChange={setView} pin={pin} current={lot} others={others} />;
  const caption = (
    <p className="mb-2 mt-1.5 truncate text-[11px] text-slate-500">
      <b className="font-semibold text-slate-700">{shown.rule}</b> · {shown.place}
    </p>
  );

  return (
    <section className="card p-4">
      {/* phones: collapsed to one line until tapped */}
      <button type="button" onClick={() => setOpenOnPhone((o) => !o)} aria-expanded={openOnPhone}
        className={`flex w-full items-center gap-2 text-left lg:hidden ${openOnPhone ? "mb-3" : ""}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><MapIcon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">Spot on the map</span>
          <span className="block text-xs text-slate-500">{pinLot ? `Marked in ${pinLot.name}. Tap to change.` : "Optional. Tap to mark where it's parked."}</span>
        </span>
        {pin && <MapPin className="h-4 w-4 text-brand-600" />}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${openOnPhone ? "rotate-180" : ""}`} />
      </button>

      <div className={`${openOnPhone ? "block" : "hidden"} lg:block`}>
        <div className="mb-3 hidden items-center gap-2 lg:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><MapIcon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">Spot on the map</h2>
            <p className="text-xs text-slate-500">Optional. Tap to mark where it&apos;s parked.</p>
          </div>
          <button type="button" onClick={() => setBig(true)} aria-label="Open larger map" title="Larger map"
            className="btn-ghost btn-icon btn-sm"><Expand /></button>
        </div>

        {tabs}
        {caption}
        <MapCanvas lot={shown} pin={pin} onPick={onChange} others={others} />

        <div className="mt-3 flex items-center gap-2 text-xs">
          {pin && pinLot ? (
            <>
              <button type="button" onClick={() => setView(pin.map)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-semibold text-brand-700">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{pin.map === view ? `Marked${plate ? ` for ${plate}` : ""}` : `Marked in ${pinLot.name}`}</span>
              </button>
              <button type="button" className="btn-ghost btn-sm !h-7" onClick={() => onChange(null)}><X /> Clear</button>
            </>
          ) : (
            <span className="flex-1 text-slate-400">Not marked</span>
          )}
          <button type="button" onClick={() => setBig(true)} className="btn-ghost btn-sm !h-7 lg:hidden"><Expand /> Bigger</button>
        </div>
      </div>

      {big && (
        <Modal open onClose={() => setBig(false)} wide icon={<MapIcon />} title="Spot on the map"
          subtitle="Pick the lot, then tap where the car is parked. Dark dots are other cars."
          footer={
            <>
              {pin && <button type="button" className="btn-secondary sm:mr-auto" onClick={() => onChange(null)}><X /> Clear pin</button>}
              <button type="button" className="btn-primary" onClick={() => setBig(false)}>Done</button>
            </>
          }>
          <div className="mx-auto max-w-md">
            {tabs}
            {caption}
            <MapCanvas lot={shown} pin={pin} onPick={onChange} others={others} big />
          </div>
        </Modal>
      )}
    </section>
  );
}
