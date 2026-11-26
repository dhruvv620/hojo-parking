"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Expand, Map as MapIcon, MapPin, MousePointerClick, X } from "lucide-react";
import { Modal } from "./ui/Modal";

/**
 * Saved top-down pictures of each parking area (not live maps).
 * To swap a picture, replace the file in public/maps/ with the same framing
 * and update its width/height here.
 */
export const LOT_MAPS = [
  { id: "fenced", name: "Fenced lot", place: "402/406 E Melvin St", src: "/maps/fenced-lot.webp", w: 1046, h: 1312 },
  { id: "lot401", name: "401 lot", place: "401 E Melvin St (N 41st St corner)", src: "/maps/lot-401.webp", w: 784, h: 710 },
  { id: "hotel", name: "Hotel lot", place: "Behind the hotel, 4120 E Van Buren St", src: "/maps/hotel-lot.webp", w: 852, h: 1222 },
] as const;

export type MapId = (typeof LOT_MAPS)[number]["id"];
export type Pin = { map: MapId; x: number; y: number };
export type OtherPin = Pin & { id: string; label: string; sub?: string };

export const mapById = (id: string | null | undefined) => LOT_MAPS.find((m) => m.id === id) ?? LOT_MAPS[0];

/** Clickable picture of one parking area. Pins are stored as percentages. */
function MapCanvas({ map, pin, onPick, others = [], big = false }: {
  map: (typeof LOT_MAPS)[number];
  pin: Pin | null;
  onPick?: (p: Pin) => void;
  others?: OtherPin[];
  big?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const mine = pin && pin.map === map.id ? pin : null;
  const dots = others.filter((o) => o.map === map.id);

  function pick(e: React.MouseEvent) {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    onPick({ map: map.id, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  }

  return (
    <div ref={ref} onClick={pick} role={onPick ? "button" : "img"} aria-label={`${map.name} map`}
      className={`relative w-full select-none overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 ${onPick ? "cursor-crosshair" : ""}`}
      style={{ aspectRatio: `${map.w} / ${map.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={map.id} src={map.src} alt={`Top-down view of the ${map.name}`} draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full animate-fade object-cover" />

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

/** Tabs to switch between the three parking areas. */
function AreaTabs({ value, onChange, pin, others }: { value: MapId; onChange: (m: MapId) => void; pin: Pin | null; others: OtherPin[] }) {
  return (
    <div role="tablist" aria-label="Parking area" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
      {LOT_MAPS.map((m) => {
        const active = m.id === value;
        const count = others.filter((o) => o.map === m.id).length;
        return (
          <button key={m.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(m.id)} title={m.place}
            className={`relative flex h-8 items-center justify-center gap-1 rounded-lg px-1.5 text-xs font-semibold transition-all duration-200 ${
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            {pin?.map === m.id && <MapPin className="h-3 w-3 shrink-0 fill-brand-600 text-white" />}
            <span className="truncate">{m.name}</span>
            {count > 0 && <span className="text-[10px] font-medium tabular-nums text-slate-400">{count}</span>}
          </button>
        );
      })}
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
  const [area, setArea] = useState<MapId>(pin?.map ?? "fenced");
  useEffect(() => { if (pin) setArea(pin.map); }, [pin]);
  const map = mapById(area);
  const pinMap = pin ? mapById(pin.map) : null;

  return (
    <section className="card p-4">
      {/* phones: collapsed to one line until tapped */}
      <button type="button" onClick={() => setOpenOnPhone((o) => !o)} aria-expanded={openOnPhone}
        className={`flex w-full items-center gap-2 text-left lg:hidden ${openOnPhone ? "mb-3" : ""}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><MapIcon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">Spot on the map</span>
          <span className="block text-xs text-slate-500">{pinMap ? `Marked in ${pinMap.name}. Tap to change.` : "Optional. Tap to mark where it's parked."}</span>
        </span>
        {pin && <MapPin className="h-4 w-4 text-brand-600" />}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${openOnPhone ? "rotate-180" : ""}`} />
      </button>

      <div className={`${openOnPhone ? "block" : "hidden"} lg:block`}>
        <div className="mb-3 hidden items-center gap-2 lg:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><MapIcon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">Spot on the map</h2>
            <p className="text-xs text-slate-500">Optional. Pick the area, then tap.</p>
          </div>
          <button type="button" onClick={() => setBig(true)} aria-label="Open larger map" title="Larger map"
            className="btn-ghost btn-icon btn-sm"><Expand /></button>
        </div>

        <AreaTabs value={area} onChange={setArea} pin={pin} others={others} />
        <p className="mb-2 mt-1.5 truncate text-[11px] text-slate-400">{map.place}</p>

        <MapCanvas map={map} pin={pin} onPick={onChange} others={others} />

        <div className="mt-3 flex items-center gap-2 text-xs">
          {pin && pinMap ? (
            <>
              <button type="button" onClick={() => setArea(pin.map)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-semibold text-brand-700">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{pin.map === area ? `Marked${plate ? ` for ${plate}` : ""}` : `Marked in ${pinMap.name}`}</span>
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
          subtitle="Pick the area, then tap where the car is parked. Dark dots are other cars."
          footer={
            <>
              {pin && <button type="button" className="btn-secondary sm:mr-auto" onClick={() => onChange(null)}><X /> Clear pin</button>}
              <button type="button" className="btn-primary" onClick={() => setBig(false)}>Done</button>
            </>
          }>
          <div className="mx-auto max-w-md">
            <AreaTabs value={area} onChange={setArea} pin={pin} others={others} />
            <p className="mb-2 mt-1.5 text-xs text-slate-500">{map.place}</p>
            <MapCanvas map={map} pin={pin} onPick={onChange} others={others} big />
          </div>
        </Modal>
      )}
    </section>
  );
}
