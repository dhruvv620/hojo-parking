"use client";

import { supabaseBrowser } from "./supabase/client";
import { isLotFullError, type Location, type ParkingRecord, type Payment } from "./types";
import { DAY } from "./time";

type Result = { ok: true; note?: string } | { ok: false; error: string };

const table = () => supabaseBrowser().from("parking_records");

type Patch = Partial<ParkingRecord> & {
  change_note?: string | null;
  change_payment?: Payment | null;
  change_amount?: number | null;
};

async function update(id: string, patch: Patch): Promise<Result> {
  const { error } = await table().update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Save something that may need an inside spot. If the lot filled up in the
 * meantime, save it as "outside fence" instead and say so.
 */
async function updateWithFallback(id: string, patch: Patch): Promise<Result> {
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

/**
 * Change how many days a car stays (extend or shorten), and record why in the
 * Stay history: payment status, amount and a note.
 */
export function updateStay(
  r: ParkingRecord,
  change: { days: number; payment: Payment | null; amount: number | null; note: string },
) {
  const reopen = r.status === "checked_out" || (r.status === "parked" && new Date(r.checkout_at).getTime() <= Date.now());
  return updateWithFallback(r.id, {
    days: change.days,
    ...(reopen ? { status: "parked" as const } : {}),
    change_note: change.note.trim() || null,
    change_payment: change.payment,
    change_amount: change.amount,
  });
}

/** Mark a logged unpaid change as paid. */
export async function markChangePaid(changeId: string): Promise<Result> {
  const { error } = await supabaseBrowser()
    .from("stay_changes")
    .update({ payment: "paid", paid_marked_at: new Date().toISOString() })
    .eq("id", changeId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
