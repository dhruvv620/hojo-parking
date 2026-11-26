"use client";

import { supabaseBrowser } from "./supabase/client";
import { isLotFullError, type ParkingRecord, type Payment } from "./types";
import { lotName, recordLot, suggestLot, type LotId } from "./lots";
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
 * Save something that may need a Lot 1 spot. If Lot 1 filled up in the
 * meantime, save it in Lot 3 instead and say so.
 */
async function updateWithFallback(id: string, patch: Patch): Promise<Result> {
  const first = await update(id, patch);
  if (first.ok || !isLotFullError(first.error)) return first;
  const second = await update(id, { ...patch, lot: "lot3", location: "outside" });
  return second.ok ? { ok: true, note: "Lot 1 is full, so this car was put in Lot 3." } : second;
}

const lotPatch = (lot: LotId) => ({ lot, location: lot === "lot1" ? ("inside" as const) : ("outside" as const) });

/** Reservation guest showed up. Paid days start counting now. */
export function markArrived(r: ParkingRecord, lot1Full: boolean) {
  return updateWithFallback(r.id, {
    status: "parked",
    arrival_at: new Date().toISOString(),
    ...lotPatch(suggestLot(r.vehicle_type, lot1Full)),
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

export async function moveToLot(r: ParkingRecord, lot: LotId): Promise<Result> {
  if (recordLot(r) === lot) return { ok: true };
  const res = await update(r.id, lotPatch(lot));
  if (!res.ok && isLotFullError(res.error)) return { ok: false, error: `${lotName("lot1")} is full.` };
  return res;
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
  const { error } = await supabaseBrowser().rpc("mark_change_paid", { p_id: changeId });
  return error ? { ok: false, error: error.message } : { ok: true };
}
