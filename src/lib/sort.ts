import { leftAt, type ParkingRecord } from "./types";
import { LOTS, recordLot } from "./lots";

export type SortKey =
  | "checkin_desc" | "checkin_asc"
  | "leaves_asc" | "leaves_desc"
  | "left_desc"
  | "name_asc" | "name_desc"
  | "lot";

export const SORT_LABELS: Record<SortKey, { label: string; description: string }> = {
  checkin_desc: { label: "Check-in: newest first", description: "Most recent arrivals on top" },
  checkin_asc: { label: "Check-in: oldest first", description: "Earliest arrivals on top" },
  leaves_asc: { label: "Leaving soonest", description: "Next check-out on top" },
  leaves_desc: { label: "Leaving latest", description: "Longest stays on top" },
  left_desc: { label: "Left: most recent", description: "Most recent check-out on top" },
  name_asc: { label: "Name: A to Z", description: "By guest name" },
  name_desc: { label: "Name: Z to A", description: "By guest name" },
  lot: { label: "Lot", description: "Lot 1, Lot 2, Lot 3, Hotel" },
};

const lotOrder = (r: ParkingRecord) => {
  const i = LOTS.findIndex((l) => l.id === recordLot(r));
  return i < 0 ? 99 : i;
};

export function sortRecords(rows: ParkingRecord[], key: SortKey): ParkingRecord[] {
  const out = [...rows];
  const byName = (a: ParkingRecord, b: ParkingRecord) => a.guest_name.localeCompare(b.guest_name, undefined, { sensitivity: "base" });
  switch (key) {
    case "checkin_desc": return out.sort((a, b) => b.arrival_at.localeCompare(a.arrival_at));
    case "checkin_asc": return out.sort((a, b) => a.arrival_at.localeCompare(b.arrival_at));
    case "leaves_asc": return out.sort((a, b) => a.checkout_at.localeCompare(b.checkout_at));
    case "leaves_desc": return out.sort((a, b) => b.checkout_at.localeCompare(a.checkout_at));
    case "left_desc": return out.sort((a, b) => (leftAt(b) ?? "").localeCompare(leftAt(a) ?? ""));
    case "name_asc": return out.sort(byName);
    case "name_desc": return out.sort((a, b) => byName(b, a));
    case "lot": return out.sort((a, b) => lotOrder(a) - lotOrder(b) || a.checkout_at.localeCompare(b.checkout_at));
  }
}

/** Remembers the chosen sort on this computer (falls back quietly if storage is blocked). */
export function loadSort(storageKey: string, fallback: SortKey, allowed: SortKey[]): SortKey {
  try {
    const v = localStorage.getItem(storageKey) as SortKey | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
export function saveSort(storageKey: string, v: SortKey) {
  try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
}
