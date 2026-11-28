"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, ArrowRightLeft, Ban, CalendarMinus, CalendarPlus, CalendarRange, CircleCheck, CircleX, Clock,
  History, LogIn, LogOut, Pencil, RotateCcw, StickyNote, UserPlus,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { markChangePaid } from "@/lib/actions";
import type { StayChange, StayChangeKind } from "@/lib/types";
import { fmtDateTime } from "@/lib/time";
import { useRun } from "./Toast";
import { lotById } from "@/lib/lots";
import { useConfirm } from "./ui/Confirm";
import { EmptyState, SectionTitle } from "./ui/bits";

const KIND: Record<StayChangeKind, { label: string; icon: React.ReactNode; tone: string }> = {
  created: { label: "Checked in", icon: <LogIn />, tone: "bg-brand-100 text-brand-700" },
  reserved: { label: "Reservation made", icon: <UserPlus />, tone: "bg-violet-100 text-violet-700" },
  arrived: { label: "Guest arrived", icon: <LogIn />, tone: "bg-brand-100 text-brand-700" },
  extended: { label: "Stay extended", icon: <CalendarPlus />, tone: "bg-emerald-100 text-emerald-700" },
  shortened: { label: "Stay shortened", icon: <CalendarMinus />, tone: "bg-amber-100 text-amber-700" },
  dates_changed: { label: "Dates changed", icon: <CalendarRange />, tone: "bg-sky-100 text-sky-700" },
  checked_out: { label: "Checked out", icon: <LogOut />, tone: "bg-slate-200 text-slate-700" },
  reopened: { label: "Back in the lot", icon: <RotateCcw />, tone: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Reservation cancelled", icon: <CircleX />, tone: "bg-red-100 text-red-700" },
  restored: { label: "Reservation restored", icon: <RotateCcw />, tone: "bg-violet-100 text-violet-700" },
  moved: { label: "Moved", icon: <ArrowRightLeft />, tone: "bg-sky-100 text-sky-700" },
  edited: { label: "Details edited", icon: <Pencil />, tone: "bg-slate-100 text-slate-600" },
  note: { label: "Note added", icon: <StickyNote />, tone: "bg-yellow-100 text-yellow-700" },
};

const range = (a: string | null, c: string | null) =>
  a && c ? `${new Date(a).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(c).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : null;

const money = (n: number | null) => (n == null ? null : `$${Number(n).toFixed(2).replace(/\.00$/, "")}`);

/** Timeline of every change to one customer's stay. */
export function StayHistory({ recordId, refreshKey, onUnpaidCount }: {
  recordId: string;
  /** Change this to reload (e.g. after a save). */
  refreshKey?: unknown;
  onUnpaidCount?: (n: number) => void;
}) {
  const run = useRun();
  const confirm = useConfirm();
  const [rows, setRows] = useState<StayChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser()
      .from("stay_changes")
      .select("*")
      .eq("record_id", recordId)
      .order("changed_at", { ascending: false });
    if (error) setError(error.message);
    else {
      setError(null);
      setRows(data as StayChange[]);
    }
  }, [recordId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    onUnpaidCount?.((rows ?? []).filter((r) => r.payment === "unpaid").length);
  }, [rows, onUnpaidCount]);

  async function markPaid(c: StayChange) {
    if (!(await confirm({ title: "Mark as paid?", message: `The customer has now paid${c.amount ? ` ${money(c.amount)}` : ""} for this change.`, confirmText: "Mark paid" }))) return;
    if (await run(markChangePaid(c.id), "Marked as paid.")) load();
  }

  const unpaid = (rows ?? []).filter((r) => r.payment === "unpaid");
  const paidTotal = (rows ?? []).filter((r) => r.payment === "paid" && r.amount).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle icon={<History />} title="Stay history" sub="Every change to this stay, newest first." />
        <div className="flex flex-wrap gap-1.5">
          {unpaid.length > 0 && (
            <span className="chip bg-amber-100 text-amber-800"><Clock className="h-3 w-3" /> {unpaid.length} unpaid</span>
          )}
          {paidTotal > 0 && <span className="chip bg-emerald-50 text-emerald-700">{money(paidTotal)} paid for changes</span>}
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Stay history isn&apos;t set up yet. Run <code className="font-mono">supabase/update-3-stay-history.sql</code> in Supabase.
        </p>
      ) : rows === null ? (
        <div className="mt-5 space-y-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState compact icon={<History />} title="No changes recorded yet" />
      ) : (
        <ol className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-slate-200">
          {rows.map((c) => {
            const k = KIND[c.kind] ?? KIND.edited;
            const before = range(c.old_arrival_at, c.old_checkout_at);
            const after = range(c.new_arrival_at, c.new_checkout_at);
            const dateChange = ["extended", "shortened", "dates_changed", "reopened"].includes(c.kind) && before && after && before !== after;
            const diff = c.old_days != null && c.new_days != null ? c.new_days - c.old_days : 0;
            return (
              <li key={c.id} className="relative flex gap-3.5">
                <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white [&>svg]:h-4 [&>svg]:w-4 ${k.tone}`}>
                  {k.icon}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-slate-900">
                      {k.label}
                      {diff !== 0 && (c.kind === "extended" || c.kind === "shortened") && (
                        <span className="font-normal text-slate-500"> by {Math.abs(diff)} day{Math.abs(diff) > 1 ? "s" : ""}</span>
                      )}
                      {c.kind === "moved" && c.new_location && (
                        <span className="font-normal text-slate-500">
                          {lotById(c.new_location)
                            ? <> {lotById(c.old_location)?.name ? `from ${lotById(c.old_location)!.name} ` : ""}to {lotById(c.new_location)!.name}</>
                            : <> {c.new_location} the fence</>}
                        </span>
                      )}
                    </span>
                    <PaymentChip c={c} onMarkPaid={() => markPaid(c)} />
                  </div>

                  {dateChange ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-500 line-through decoration-slate-300">{before}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">{after}</span>
                      <span className="text-xs text-slate-400">({c.old_days} → {c.new_days} days)</span>
                    </div>
                  ) : (c.kind === "created" || c.kind === "reserved" || c.kind === "arrived") && after ? (
                    <div className="mt-1 text-sm text-slate-600">{after} · {c.new_days} day{c.new_days === 1 ? "" : "s"}</div>
                  ) : null}

                  {c.details && <div className="mt-1 text-sm text-slate-600">{c.details}</div>}

                  {c.note && (
                    <div className="mt-2 rounded-lg border-l-2 border-yellow-400 bg-yellow-50/70 px-3 py-2 text-sm text-slate-700">
                      {c.note}
                    </div>
                  )}

                  <div className="mt-1.5 text-xs text-slate-400">
                    {fmtDateTime(c.changed_at)}
                    {c.changed_by_email && <> · {c.changed_by_email}</>}
                    {c.changed_by_device && <> · on {c.changed_by_device}</>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function PaymentChip({ c, onMarkPaid }: { c: StayChange; onMarkPaid: () => void }) {
  if (!c.payment) return null;
  const amt = money(c.amount);
  if (c.payment === "paid")
    return (
      <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <CircleCheck className="h-3 w-3" /> Paid{amt && ` ${amt}`}
        {c.paid_marked_at && <span className="font-normal opacity-70"> · {fmtDateTime(c.paid_marked_at)}</span>}
      </span>
    );
  if (c.payment === "free")
    return <span className="chip bg-slate-100 text-slate-600"><Ban className="h-3 w-3" /> No charge</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="chip bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">
        <Clock className="h-3 w-3" /> Not paid{amt && ` · ${amt} due`}
      </span>
      <button type="button" onClick={onMarkPaid} className="btn-secondary btn-sm !h-6 !rounded-md !px-2 !text-[11px]">
        Mark paid
      </button>
    </span>
  );
}
