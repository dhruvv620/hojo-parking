"use client";

import { useRef, useState } from "react";
import { ChevronDown, Expand, Map as MapIcon, MapPin, MousePointerClick, X } from "lucide-react";
import { Modal } from "./ui/Modal";

/** Saved top-down photo of the fenced lot (E Melvin St). Not a live map. */
export const LOT_MAP_SRC = "/lot-map.webp";
const LOT_MAP_RATIO = 1046 / 1312; // width / height of the picture

export type Pin = { x: number; y: number };
export type OtherPin = Pin & { id: string; label: string; sub?: string };

/**
 * Clickable picture of the lot. Click to drop a pin; pins are stored as
 * percentages so they stay in place at any size.
 */
function MapCanvas({ pin, onPick, others = [], big = false }: {
  pin: Pin | null;
  onPick?: (p: Pin) => void;
  others?: OtherPin[];
  big?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  function pick(e: React.MouseEvent) {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    onPick({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  }

  return (
    <div ref={ref} onClick={pick} role={onPick ? "button" : "img"} aria-label="Parking lot map"
      className={`relative w-full select-none overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 ${onPick ? "cursor-crosshair" : ""}`}
      style={{ aspectRatio: String(LOT_MAP_RATIO) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOT_MAP_SRC} alt="Top-down view of the fenced parking lot" draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover" />

      {/* other parked cars, faint */}
      {others.map((o) => (
        <span key={o.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${o.x}%`, top: `${o.y}%` }}
          onMouseEnter={() => setHover(o.id)} onMouseLeave={() => setHover(null)}>
          <span className={`block rounded-full border-2 border-white bg-slate-900/60 shadow ${big ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`} />
          {hover === o.id && (
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
              {o.label}{o.sub && <span className="font-normal text-slate-300"> · {o.sub}</span>}
            </span>
          )}
        </span>
      ))}

      {/* this car */}
      {pin && (
        <span key={`${pin.x}-${pin.y}`} className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full animate-pop"
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
          <MapPin className={`fill-brand-600 text-white drop-shadow-[0_3px_4px_rgb(0_0_0/0.45)] ${big ? "h-11 w-11" : "h-8 w-8"}`} strokeWidth={1.5} />
          <span className="absolute left-1/2 top-full h-1.5 w-3 -translate-x-1/2 -translate-y-1 rounded-full bg-black/30 blur-[1px]" />
        </span>
      )}

      {onPick && !pin && (
        <span className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-slate-900/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            <MousePointerClick className="h-3.5 w-3.5" /> Tap where the car is parked
          </span>
        </span>
      )}
    </div>
  );
}

/** Small card for the side of the Add / Edit car form. */
export function LotMapCard({ pin, onChange, others = [], plate }: {
  pin: Pin | null;
  onChange: (p: Pin | null) => void;
  others?: OtherPin[];
  plate?: string;
}) {
  const [big, setBig] = useState(false);
  const [openOnPhone, setOpenOnPhone] = useState(false);
  return (
    <section className="card p-4">
      {/* phones: collapsed to one line until tapped */}
      <button type="button" onClick={() => setOpenOnPhone((o) => !o)} aria-expanded={openOnPhone}
        className={`flex w-full items-center gap-2 text-left lg:hidden ${openOnPhone ? "mb-3" : ""}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><MapIcon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">Spot on the map</span>
          <span className="block text-xs text-slate-500">{pin ? "Marked. Tap to change." : "Optional. Tap to mark where it's parked."}</span>
        </span>
        {pin && <MapPin className="h-4 w-4 text-brand-600" />}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${openOnPhone ? "rotate-180" : ""}`} />
      </button>

      <div className={`${openOnPhone ? "block" : "hidden"} lg:block`}>
      <div className="mb-3 hidden items-center gap-2 lg:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><MapIcon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">Spot on the map</h2>
          <p className="text-xs text-slate-500">Optional. Tap to mark roughly where it&apos;s parked.</p>
        </div>
        <button type="button" onClick={() => setBig(true)} aria-label="Open larger map" title="Larger map"
          className="btn-ghost btn-icon btn-sm"><Expand /></button>
      </div>

      <MapCanvas pin={pin} onPick={onChange} others={others} />

      <div className="mt-3 flex items-center gap-2 text-xs">
        {pin ? (
          <>
            <span className="flex flex-1 items-center gap-1.5 font-semibold text-brand-700">
              <MapPin className="h-3.5 w-3.5" /> Marked{plate ? ` for ${plate}` : ""}
            </span>
            <button type="button" className="btn-ghost btn-sm !h-7" onClick={() => onChange(null)}><X /> Clear</button>
          </>
        ) : (
          <span className="flex-1 text-slate-400">Not marked</span>
        )}
        {others.length > 0 && (
          <span className="flex items-center gap-1 text-slate-400">
            <span className="h-2 w-2 rounded-full border border-white bg-slate-900/60" /> other cars
          </span>
        )}
      </div>

      </div>

      {big && (
        <Modal open onClose={() => setBig(false)} wide icon={<MapIcon />} title="Spot on the map"
          subtitle="Tap where the car is parked. Dark dots are other cars."
          footer={
            <>
              {pin && <button type="button" className="btn-secondary sm:mr-auto" onClick={() => onChange(null)}><X /> Clear pin</button>}
              <button type="button" className="btn-primary" onClick={() => setBig(false)}>Done</button>
            </>
          }>
          <div className="mx-auto max-w-md">
            <MapCanvas pin={pin} onPick={onChange} others={others} big />
          </div>
        </Modal>
      )}
    </section>
  );
}
