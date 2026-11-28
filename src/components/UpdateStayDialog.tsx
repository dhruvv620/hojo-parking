"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Ban, CalendarCheck, CalendarRange, ChevronDown, CircleCheck, Clock, DollarSign, LoaderCircle, Minus, Plus } from "lucide-react";
import { DatePicker } from "./ui/DatePicker";
import { Modal } from "./ui/Modal";
import { useRun } from "./Toast";
import { updateStay, undoTo } from "@/lib/actions";
import type { ParkingRecord, Payment } from "@/lib/types";
import { DAY, fmtDateTime, fmtTime } from "@/lib/time";

const PAYMENTS: { value: Payment; label: string; sub: string; icon: React.ReactNode; on: string }[] = [
  { value: "paid", label: "Paid", sub: "Customer paid", icon: <CircleCheck />, on: "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-[0_0_0_3px_rgb(16_185_129/0.15)]" },
  { value: "unpaid", label: "Not paid yet", sub: "Collect later", icon: <Clock />, on: "border-amber-500 bg-amber-50 text-amber-800 shadow-[0_0_0_3px_rgb(245_158_11/0.18)]" },
  { value: "free", label: "No charge", sub: "Free / comped", icon: <Ban />, on: "border-slate-500 bg-slate-100 text-slate-800 shadow-[0_0_0_3px_rgb(100_116_139/0.15)]" },
];

/** Whole calendar days from one date to another (at least 1). */
function daysBetween(from: Date, to: Date) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(1, Math.min(365, Math.round((b - a) / 86_400_000)));
}

const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * "Update stay" pop-up: change the check-out date (extend or shorten), and
 * record whether the customer paid, how much, and a note. Saved to the
 * customer's Stay history.
 */
export function UpdateStayDialog({ record, presetAdd = 0, onClose, onSaved }: {
  record: ParkingRecord | null;
  /** Start with this many days already added (e.g. 1 for "Extend"). */
  presetAdd?: number;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const run = useRun();
  const [days, setDays] = useState(1);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!record) return;
    setDays(Math.min(365, record.days + presetAdd));
    setPayment(null);
    setAmount("");
    setNote("");
    setTried(false);
  }, [record, presetAdd]);

  if (!record) return null;

  const arrival = new Date(record.arrival_at);
  const oldCheckout = new Date(record.checkout_at);
  const newCheckout = new Date(arrival.getTime() + days * DAY);
  const diff = days - record.days;
  const needsPayment = diff > 0;
  const missingPayment = needsPayment && !payment;

  async function save() {
    setTried(true);
    if (!record || (diff === 0 && !note.trim())) return;
    if (missingPayment) return;
    setBusy(true);
    const amt = amount.trim() ? Number(amount.replace(/[^0-9.]/g, "")) : null;
    const msg = diff > 0 ? `Extended by ${diff} day${diff > 1 ? "s" : ""}.` : diff < 0 ? `Shortened by ${-diff} day${diff < -1 ? "s" : ""}.` : "Note added.";
    const before = record;
    const ok = await run(updateStay(record, { days, payment, amount: Number.isFinite(amt) ? amt : null, note }), msg, {
      undo: () => undoTo(before, { voidPayment: !!payment }),
      after: onSaved,
    });
    setBusy(false);
    if (ok) {
      onSaved?.();
      onClose();
    }
  }

  const quick = [-1, 1, 2, 3, 7];

  return (
    <Modal open onClose={onClose} icon={<CalendarRange />} title="Update stay"
      subtitle={<>{record.guest_name} · <span className="font-mono font-semibold text-slate-700">{record.license_plate}</span></>}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy || (diff === 0 && !note.trim())}>
            {busy ? <LoaderCircle className="animate-spin" /> : <CalendarCheck />}
            {busy ? "Saving..." : diff === 0 ? "Save note" : "Save update"}
          </button>
        </>
      }>
      {/* current vs new */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Current</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">{shortDate(arrival)} → {shortDate(oldCheckout)}</div>
          <div className="text-xs text-slate-500">{record.days} day{record.days > 1 ? "s" : ""}</div>
        </div>
        <div className="flex items-center text-slate-300"><ArrowRight className="h-5 w-5" /></div>
        <div className={`rounded-xl border p-3 transition-colors ${
          diff > 0 ? "border-emerald-200 bg-emerald-50" : diff < 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">New</div>
          <div className="mt-1 text-sm font-bold text-slate-900">{shortDate(arrival)} → {shortDate(newCheckout)}</div>
          <div className={`text-xs font-semibold ${diff > 0 ? "text-emerald-700" : diff < 0 ? "text-amber-700" : "text-slate-500"}`}>
            {days} day{days > 1 ? "s" : ""}{diff !== 0 && ` (${diff > 0 ? "+" : ""}${diff})`}
          </div>
        </div>
      </div>

      {/* pick new check-out */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <span className="label">New check-out date</span>
          {diff !== 0 && (
            <button type="button" onClick={() => setDays(record.days)} className="mb-1.5 text-xs font-semibold text-brand-600 hover:underline">
              Reset
            </button>
          )}
        </div>
        <DatePicker mode="date" ariaLabel="New check-out date" value={newCheckout}
          minDate={new Date(arrival.getTime() + DAY)}
          onChange={(d) => setDays(daysBetween(arrival, d))}
          footer={(d) => {
            const n = daysBetween(arrival, d);
            return <><b className="text-slate-800">{n} day{n > 1 ? "s" : ""}</b> · leaves at {fmtTime(arrival)}</>;
          }}
          triggerClassName="input group flex items-center gap-2 text-left"
          renderTrigger={({ open }) => (
            <>
              <CalendarCheck className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex-1 truncate font-semibold">{fmtDateTime(newCheckout)}</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </>
          )} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quick.map((q) => {
            const target = record.days + q;
            const disabled = target < 1;
            const active = days === target;
            return (
              <button key={q} type="button" disabled={disabled} onClick={() => setDays(target)} data-active={active}
                className="choice flex h-9 items-center gap-1 px-3 text-sm font-semibold text-slate-600 data-[active=true]:text-brand-700">
                {q < 0 ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {q === 7 ? "1 week" : `${Math.abs(q)} day${Math.abs(q) > 1 ? "s" : ""}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* payment */}
      <div className="mt-5">
        <span className="label">
          Payment {needsPayment ? <span className="text-red-500">*</span> : <span className="font-normal text-slate-400">(optional)</span>}
        </span>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENTS.map((p) => {
            const active = payment === p.value;
            return (
              <button key={p.value} type="button" aria-pressed={active} onClick={() => setPayment(active ? null : p.value)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition duration-150 active:scale-[0.98] ${
                  active ? p.on : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>
                <span className="[&>svg]:h-4 [&>svg]:w-4">{p.icon}</span>
                <span className="text-sm font-bold leading-tight">{p.label}</span>
                <span className="text-[11px] opacity-70">{p.sub}</span>
              </button>
            );
          })}
        </div>
        {tried && missingPayment && (
          <p className="mt-1.5 text-xs font-medium text-red-600">Choose whether the customer paid for the extra days.</p>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[150px_1fr]">
        <div>
          <label className="label" htmlFor="amount">Amount <span className="font-normal text-slate-400">(optional)</span></label>
          <div className="relative">
            <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="amount" inputMode="decimal" className="input pl-8 tabular-nums" placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="change-note">Note</label>
          <textarea id="change-note" data-autofocus className="input min-h-[2.75rem] resize-y" rows={2}
            placeholder="e.g. Customer called, paid by card over the phone"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">This change is saved to the customer&apos;s Stay history with your name and the time.</p>
    </Modal>
  );
}
