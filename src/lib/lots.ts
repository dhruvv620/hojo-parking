import { LOT_CAPACITY } from "./config";

export type LotId = "lot1" | "lot2" | "lot3" | "hotel";
export type VehicleType = "car" | "suv" | "truck";

export const VEHICLES: { id: VehicleType; label: string }[] = [
  { id: "car", label: "Car" },
  { id: "suv", label: "SUV" },
  { id: "truck", label: "Truck" },
];

/**
 * The parking areas. Only Lot 1 (the fenced lot) counts toward the limit.
 * To swap a picture, replace the file in public/maps/ (same framing) and
 * update its width/height here.
 */
export const LOTS: {
  id: LotId;
  name: string;
  place: string;
  rule: string;
  allowed: VehicleType[];
  capacity: number | null;
  src: string | null;
  w: number;
  h: number;
  /**
   * Where "Directions" sends guests. Either a Google Maps share link of the
   * pinned lot (opens the pin; the guest taps Directions), or an address /
   * "latitude,longitude" (opens driving directions straight away).
   */
  nav: { link: string } | { address: string };
  /** Tailwind colour family used for chips and bars. */
  dot: string;
  chip: string;
}[] = [
  {
    id: "lot1", name: "Lot 1", place: "Fenced lot on E Melvin St", rule: "Cars & SUVs only",
    allowed: ["car", "suv"], capacity: LOT_CAPACITY, src: "/maps/fenced-lot.webp", w: 1046, h: 1312,
    nav: { link: "https://maps.app.goo.gl/y8ozduPKwcMY96RR9" },
    dot: "bg-brand-500", chip: "bg-brand-50 text-brand-700 ring-brand-100",
  },
  {
    id: "lot2", name: "Lot 2", place: "401 N 41st St", rule: "Trucks only",
    allowed: ["truck"], capacity: null, src: "/maps/lot-401.webp", w: 784, h: 710,
    nav: { address: "401 N 41st St, Phoenix, AZ 85008" },
    dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 ring-orange-100",
  },
  {
    id: "lot3", name: "Lot 3", place: "Along E Melvin St, behind the hotel building", rule: "Any vehicle",
    allowed: ["car", "suv", "truck"], capacity: null, src: "/maps/lot-3.webp", w: 1676, h: 848,
    nav: { link: "https://maps.app.goo.gl/wdBRNz9AggN9qsjB6" },
    dot: "bg-teal-500", chip: "bg-teal-50 text-teal-700 ring-teal-100",
  },
  {
    id: "hotel", name: "Hotel Lot", place: "At the hotel, 4120 E Van Buren St", rule: "Ask the front desk",
    allowed: ["car", "suv", "truck"], capacity: null, src: "/maps/hotel-lot.webp", w: 852, h: 1222,
    nav: { address: "Howard Johnson, 4120 E Van Buren St, Phoenix, AZ 85008" },
    dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-100",
  },
];

export const lotById = (id: string | null | undefined) => LOTS.find((l) => l.id === normalizeLot(id)) ?? null;

/** Older saved names: fenced -> lot1, lot401 -> lot2. */
export function normalizeLot(id: string | null | undefined): LotId | null {
  if (id === "fenced") return "lot1";
  if (id === "lot401") return "lot2";
  return id === "lot1" || id === "lot2" || id === "lot3" || id === "hotel" ? id : null;
}

/** Lot for a record: its lot, or Lot 1 for older "inside" records. */
export function recordLot(r: { lot?: string | null; location: string }): LotId | null {
  return normalizeLot(r.lot) ?? (r.location === "inside" ? "lot1" : null);
}

export const lotName = (id: string | null | undefined) => lotById(id)?.name ?? "Lot not set";

/** Is this vehicle allowed in this lot? (unknown vehicle type = yes) */
export function lotFits(lot: LotId | null, vehicle: VehicleType | null | undefined) {
  const l = lotById(lot);
  return !l || !vehicle || l.allowed.includes(vehicle);
}

/** Where a vehicle should park: trucks in Lot 2; cars & SUVs in Lot 1, or Lot 3 if it is full. */
export function suggestLot(vehicle: VehicleType | null | undefined, lot1Full: boolean): LotId {
  if (vehicle === "truck") return "lot2";
  return lot1Full ? "lot3" : "lot1";
}

export const vehicleLabel = (v: string | null | undefined) => VEHICLES.find((x) => x.id === v)?.label ?? null;

/**
 * Directions links for a lot. `google` works on every phone. `apple` (for
 * iPhone users) is only offered when the lot has a street address, since
 * Apple Maps can't open Google share links.
 */
export function directionsLinks(id: LotId) {
  const nav = lotById(id)?.nav;
  if (!nav) return null;
  if ("link" in nav) return { google: nav.link, apple: null };
  const q = encodeURIComponent(nav.address);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
    apple: `https://maps.apple.com/?daddr=${q}&dirflg=d`,
  };
}
