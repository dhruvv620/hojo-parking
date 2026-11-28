"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HOTEL_NAME } from "@/lib/config";
import { lotName, recordLot, vehicleLabel } from "@/lib/lots";
import { PAYMENT_METHODS, carLabel, leftAt, liveStatus, type ParkingRecord, type StayChange } from "@/lib/types";

const HOTEL = {
  name: `${HOTEL_NAME} by Wyndham`,
  address: "4120 E Van Buren St, Phoenix, AZ 85008",
  phone: "602-275-5746",
};

const money = (n: number) => `$${n.toFixed(2)}`;
const date = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";
const dateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "-";

/** Printable receipt for one stay. Print or "Save as PDF" from the browser. */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<ParkingRecord | null>(null);
  const [changes, setChanges] = useState<StayChange[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.from("parking_records").select("*").eq("id", id).maybeSingle().then(({ data }: { data: ParkingRecord | null }) => {
      if (!data) setMissing(true);
      else setR(data);
    });
    sb.from("stay_changes").select("*").eq("record_id", id).order("changed_at")
      .then(({ data }: { data: StayChange[] | null }) => setChanges(data ?? []));
  }, [id]);

  if (missing) return <p className="py-20 text-center text-slate-500">Record not found.</p>;
  if (!r) return <div className="mx-auto max-w-2xl"><div className="skeleton h-96 rounded-2xl" /></div>;

  const paidExtensions = changes.filter((c) => c.payment === "paid" && c.amount && Number(c.amount) > 0);
  const due = changes.filter((c) => c.payment === "unpaid" && c.amount).reduce((s, c) => s + Number(c.amount), 0);
  const base = r.amount_paid != null ? Number(r.amount_paid) : null;
  const total = (base ?? 0) + paidExtensions.reduce((s, c) => s + Number(c.amount), 0);
  const method = PAYMENT_METHODS.find((m) => m.id === r.payment_method)?.label;
  const s = liveStatus(r, Date.now());
  const ended = s === "auto_out" || s === "checked_out";
  const receiptNo = `R-${r.id.replace(/-/g, "").slice(-8).toUpperCase()}`;
  const car = carLabel(r);
  const vehicle = [vehicleLabel(r.vehicle_type), car !== "Car details not entered" ? car : null].filter(Boolean).join(" · ") || "-";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/cars/${r.id}`} className="group inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-brand-700">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Back to {r.guest_name}
        </Link>
        <button className="btn-primary ml-auto" onClick={() => window.print()}><Printer /> Print or save as PDF</button>
      </div>

      {base == null && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          No amount paid is saved for this stay. Add it under <b>Stay</b> on the guest&apos;s page so the receipt shows it.
        </p>
      )}

      <article className="receipt card p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={HOTEL.name} className="logo-pill h-14 w-auto" />
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{HOTEL.address}<br />{HOTEL.phone}</p>
          </div>
          <div className="sm:text-right">
            <h1 className="text-2xl font-extrabold tracking-tight">Parking receipt</h1>
            <p className="mt-1 font-mono text-sm text-slate-600">{receiptNo}</p>
            <p className="text-xs text-slate-500">Issued {dateTime(new Date().toISOString())}</p>
          </div>
        </header>

        <section className="grid gap-x-6 gap-y-1.5 border-b border-slate-200 py-6 text-sm sm:grid-cols-2">
          <dl className="space-y-1.5">
            <Row label="Guest" value={r.guest_name} />
            {r.phone && <Row label="Phone" value={r.phone} />}
            {r.room_number && <Row label="Room" value={r.room_number} />}
            {r.confirmation_number && <Row label="Confirmation #" value={r.confirmation_number} />}
          </dl>
          <dl className="space-y-1.5">
            <Row label="Plate" value={`${r.license_plate}${r.plate_state ? ` (${r.plate_state})` : ""}`} />
            <Row label="Vehicle" value={vehicle} />
            <Row label="Lot" value={lotName(recordLot(r))} />
          </dl>
        </section>

        <section className="grid grid-cols-3 gap-4 border-b border-slate-200 py-6">
          <Stat label="Check-in" value={dateTime(r.arrival_at)} />
          <Stat label={ended ? "Checked out" : "Check-out"} value={dateTime(ended ? leftAt(r) : r.checkout_at)} />
          <Stat label="Days" value={`${r.days} day${r.days === 1 ? "" : "s"}`} />
        </section>

        <section className="py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Description</th>
                <th className="pb-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2.5 pr-3">Parking, {date(r.arrival_at)} to {date(r.checkout_at)}</td>
                <td className="py-2.5 text-right tabular-nums">{base != null ? money(base) : "-"}</td>
              </tr>
              {paidExtensions.map((c) => {
                const add = c.old_days != null && c.new_days != null ? c.new_days - c.old_days : 0;
                return (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-3">
                      {add > 0 ? `Extra ${add} day${add === 1 ? "" : "s"}` : "Stay change"} ({date(c.changed_at)})
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{money(Number(c.amount))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td className="pt-3 text-base font-bold">Total paid</td>
                <td className="pt-3 text-right text-base font-extrabold tabular-nums">{money(total)}</td>
              </tr>
              {method && <tr><td colSpan={2} className="pt-1 text-xs text-slate-500">Paid by {method.toLowerCase()}</td></tr>}
              {due > 0 && (
                <tr>
                  <td className="pt-2 font-semibold text-amber-700">Balance due</td>
                  <td className="pt-2 text-right font-bold tabular-nums text-amber-700">{money(due)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </section>

        <footer className="border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
          Thank you for staying with {HOTEL.name}. Questions? Call {HOTEL.phone}.
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words font-semibold">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
