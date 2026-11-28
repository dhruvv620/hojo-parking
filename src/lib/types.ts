import { normalizeLot, recordLot } from "./lots";

export type Source = "walk_in" | "online" | "guest_form";
export type Location = "inside" | "outside";
export type Status = "reserved" | "parked" | "checked_out" | "cancelled";

export interface ParkingRecord {
  id: string;
  guest_name: string;
  confirmation_number: string | null;
  phone: string | null;
  room_number: string | null;
  source: Source;
  license_plate: string;
  plate_state: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  location: Location;
  status: Status;
  arrival_at: string;
  days: number;
  checkout_at: string;
  checked_out_at: string | null;
  fence_told: boolean;
  notes: string | null;
  /** Map pin: 0-100 from left / top of the lot picture. */
  spot_x: number | null;
  spot_y: number | null;
  /** Which lot the map pin is on: lot1, lot2, lot3 or hotel. */
  spot_map: string | null;
  /** lot1 (fenced, counts toward the limit), lot2, lot3 or hotel. */
  lot: string | null;
  vehicle_type: "car" | "suv" | "truck" | null;
  created_at: string;
  updated_at: string;
}

export type RecordInput = Omit<
  ParkingRecord,
  "id" | "checkout_at" | "checked_out_at" | "created_at" | "updated_at"
>;

/** What the record means right now, including automatic check-out. */
export type LiveStatus = "upcoming" | "parked" | "auto_out" | "checked_out" | "cancelled";

export function liveStatus(r: ParkingRecord, now: number): LiveStatus {
  if (r.status === "reserved") return "upcoming";
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "checked_out") return "checked_out";
  return new Date(r.checkout_at).getTime() > now ? "parked" : "auto_out";
}

/** When the car left (or is treated as having left). */
export function leftAt(r: ParkingRecord): string | null {
  if (r.status === "checked_out") return r.checked_out_at;
  if (r.status === "parked") return r.checkout_at;
  return null;
}

/** Map pins of parked cars (for faint dots on the map). */
export function pinsOf(records: ParkingRecord[]) {
  return records
    .filter((r) => r.spot_x != null && r.spot_y != null)
    .map((r) => ({
      id: r.id,
      map: normalizeLot(r.spot_map) ?? recordLot(r) ?? "lot1",
      x: Number(r.spot_x),
      y: Number(r.spot_y),
      label: r.license_plate,
      sub: r.guest_name,
    }));
}

export const sourceLabel = (s: Source) => (s === "online" ? "Online" : s === "guest_form" ? "Self check-in" : "Walk-in");

export function carLabel(r: Pick<ParkingRecord, "color" | "make" | "model">) {
  return [r.color, r.make, r.model].filter(Boolean).join(" ") || "Car details not entered";
}

export function isLotFullError(message: string | undefined) {
  return !!message && message.includes("LOT_FULL");
}

export type Payment = "paid" | "unpaid" | "free";

export type StayChangeKind =
  | "created" | "reserved" | "arrived" | "extended" | "shortened" | "dates_changed" | "checked_out"
  | "reopened" | "cancelled" | "restored" | "moved" | "edited" | "note";

/** One row of a customer's Stay history. */
export interface StayChange {
  id: string;
  record_id: string;
  changed_at: string;
  changed_by_email: string | null;
  changed_by_device?: string | null;
  kind: StayChangeKind;
  old_arrival_at: string | null;
  old_days: number | null;
  old_checkout_at: string | null;
  new_arrival_at: string | null;
  new_days: number | null;
  new_checkout_at: string | null;
  old_location: string | null;
  new_location: string | null;
  details: string | null;
  payment: Payment | null;
  amount: number | null;
  note: string | null;
  paid_marked_at: string | null;
}

/** One phone/computer that has used the app (Staff page > Devices). */
export interface Device {
  id: string;
  device_key: string;
  user_email: string | null;
  name: string | null;
  label: string | null;
  last_ip: string | null;
  first_ip: string | null;
  country: string | null;
  first_seen: string;
  last_seen: string;
  sign_ins: number;
  removed_at: string | null;
  removed_by: string | null;
}
