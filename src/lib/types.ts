export type Source = "walk_in" | "online";
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

export function carLabel(r: Pick<ParkingRecord, "color" | "make" | "model">) {
  return [r.color, r.make, r.model].filter(Boolean).join(" ") || "Car details not entered";
}

export function isLotFullError(message: string | undefined) {
  return !!message && message.includes("LOT_FULL");
}
