"use client";

import { supabaseBrowser } from "./supabase/client";
import { isLotFullError, type Location, type ParkingRecord } from "./types";
import { DAY } from "./time";

type Result = { ok: true; note?: string } | { ok: false; error: string };

const table = () => supabaseBrowser().from("parking_records");

async function update(id: string, patch: Partial<ParkingRecord>): Promise<Result> {
  const { error } = await table().update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Save something that may need an inside spot. If the lot filled up in the
 * meantime, save it as "outside fence" instead and say so.
 */
async function updateWithFallback(id: string, patch: Partial<ParkingRecord>): Promise<Result> {
  const first = await update(id, patch);
  if (first.ok || !isLotFullError(first.error) || patch.location === "outside") return first;
  const second = await update(id, { ...patch, location: "outside" });
  return second.ok ? { ok: true, note: "The lot is full, so this car was put OUTSIDE the fence." } : second;
}

/** Reservation guest showed up. Paid days start counting now. */
export function markArrived(r: ParkingRecord, lotFull: boolean) {
  const location: Location = lotFull ? "outside" : "inside";
  return updateWithFallback(r.id, {
    status: "parked",
    arrival_at: new Date().toISOString(),
    location,
  });
}

export function checkOutNow(r: ParkingRecord) {
  return update(r.id, { status: "checked_out" });
}

/** Add days. Works for parked cars and for cars that just auto checked out. */
export function extend(r: ParkingRecord, addDays: number) {
  let days = r.days + addDays;
  // If it auto checked out a while ago, make sure the new time is in the future.
  const arrival = new Date(r.arrival_at).getTime();
  while (arrival + days * DAY <= Date.now()) days += 1;
  return updateWithFallback(r.id, { status: "parked", days });
}

export function moveTo(r: ParkingRecord, location: Location) {
  return update(r.id, { location });
}

export function cancelReservation(r: ParkingRecord) {
  return update(r.id, { status: "cancelled" });
}

export function restoreReservation(r: ParkingRecord) {
  return update(r.id, { status: "reserved" });
}

export async function deleteRecord(r: ParkingRecord): Promise<Result> {
  const { error } = await table().delete().eq("id", r.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
