"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CarForm } from "@/components/CarForm";
import { useParking } from "@/lib/useParking";
import { useRun, useToast } from "@/components/Toast";
import { carLabel, liveStatus, type LiveStatus, type ParkingRecord } from "@/lib/types";
import { fmtDateTime, fmtDuration } from "@/lib/time";
import { useConfirm } from "@/components/ui/Confirm";
import { Menu } from "@/components/ui/Dropdown";
import { Avatar, EmptyState, Plate } from "@/components/ui/bits";
import { ArrowLeft, CalendarX2, Clock, Ellipsis, LogIn, LogOut, Plus, SearchX, Trash2, Undo2 } from "lucide-react";
import { cancelReservation, checkOutNow, deleteRecord, extend, markArrived, restoreReservation } from "@/lib/actions";

const STATUS: Record<LiveStatus, { text: string; cls: string; dot: string }> = {
  upcoming: { text: "Upcoming reservation", cls: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  parked: { text: "Parked", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  auto_out: { text: "Checked out (auto)", cls: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  checked_out: { text: "Checked out (manual)", cls: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  cancelled: { text: "Cancelled", cls: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

function BackLink() {
  return (
    <Link href="/" className="group inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-500 transition hover:text-brand-700">
      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Dashboard
    </Link>
  );
}

export default function EditCarPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const run = useRun();
  const confirm = useConfirm();
  const lot = useParking();
  const [record, setRecord] = useState<ParkingRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("parking_records").select("*").eq("id", id).maybeSingle();
    if (!data) setMissing(true);
    else setRecord(data as ParkingRecord);
    setFormKey((k) => k + 1);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (missing) {
    return (
      <div className="card mx-auto mt-10 max-w-md">
        <EmptyState icon={<SearchX />} title="Record not found" text="It may have been deleted."
          action={<Link href="/" className="btn-secondary">Back to dashboard</Link>} />
      </div>
    );
  }
  if (!record || lot.loading)
    return (
      <div className="mx-auto max-w-3xl space-y-5" aria-busy="true">
        <div className="skeleton h-5 w-28" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );

  const s = liveStatus(record, lot.now);
  const r = record;

  async function checkout() {
    if (await confirm({ title: `Check out ${r.guest_name}?`, message: "The spot frees up right away.", confirmText: "Check out", icon: "checkout" }))
      act(checkOutNow(r), "Checked out. Spot is free.");
  }
  async function cancel() {
    if (await confirm({ title: "Cancel this reservation?", message: "You can restore it later if the guest still comes.", confirmText: "Cancel reservation", cancelText: "Keep it", tone: "danger" }))
      act(cancelReservation(r), "Reservation cancelled.");
  }
  async function remove() {
    if (!(await confirm({ title: "Delete this record for good?", message: <>{r.guest_name}&apos;s record will be removed from History too. This cannot be undone.</>, confirmText: "Delete", tone: "danger" }))) return;
    const res = await deleteRecord(r);
    if (res.ok) { toast("Record deleted."); router.push("/"); }
    else toast(res.error, "error");
  }
  const act = async (p: ReturnType<typeof checkOutNow>, msg: string) => {
    if (await run(p, msg)) load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink />

      {/* Header card */}
      <div className="card mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <Avatar name={record.guest_name} size="lg" tone={s === "upcoming" ? "violet" : s === "parked" ? "brand" : "slate"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{record.guest_name}</h1>
              <span className={`chip ${STATUS[s].cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS[s].dot}`} /> {STATUS[s].text}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <Plate plate={record.license_plate} state={record.plate_state} />
              <span>{carLabel(record)}</span>
              {record.confirmation_number && <span className="font-mono text-xs">#{record.confirmation_number}</span>}
            </div>
          </div>
          <Menu label="More" triggerClassName="btn-secondary btn-icon" items={[
            { label: "Delete record", icon: <Trash2 />, danger: true, onSelect: remove },
          ]}>
            <Ellipsis />
          </Menu>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
          {s === "upcoming" && (
            <>
              <span className="mr-auto text-sm text-slate-600">Expected {fmtDateTime(record.arrival_at)}</span>
              <button className="btn-secondary" onClick={cancel}><CalendarX2 /> Cancel reservation</button>
              <button className="btn-primary" onClick={() => act(markArrived(record, lot.isFull), "Checked in. Paid days start now.")}>
                <LogIn /> Guest arrived
              </button>
            </>
          )}
          {s === "parked" && (
            <>
              <span className="mr-auto flex items-center gap-1.5 text-sm text-slate-600">
                <Clock className="h-4 w-4 text-slate-400" /> Leaves {fmtDateTime(record.checkout_at)}
                <span className="text-slate-400">· in {fmtDuration(new Date(record.checkout_at).getTime() - lot.now)}</span>
              </span>
              <button className="btn-secondary" onClick={() => act(extend(record, 1), "Extended by 1 day.")}><Plus /> 1 day</button>
              <button className="btn-secondary" onClick={() => act(extend(record, 2), "Extended by 2 days.")}><Plus /> 2 days</button>
              <button className="btn-primary" onClick={checkout}><LogOut /> Check out now</button>
            </>
          )}
          {(s === "auto_out" || s === "checked_out") && (
            <>
              <span className="mr-auto text-sm text-slate-600">
                Left {fmtDateTime(s === "auto_out" ? record.checkout_at : record.checked_out_at)}. Car still here?
              </span>
              <button className="btn-primary" onClick={() => act(extend(record, 1), "Extended. Car is back in the lot.")}>
                <Undo2 /> Extend 1 day
              </button>
            </>
          )}
          {s === "cancelled" && (
            <>
              <span className="mr-auto text-sm text-slate-600">This reservation was cancelled.</span>
              <button className="btn-secondary" onClick={() => act(restoreReservation(record), "Reservation restored.")}>
                <Undo2 /> Restore reservation
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-5">
      <CarForm key={formKey} record={record} insideCount={lot.inside.length}
        onSaved={(r, note) => {
          toast(note ?? "Changes saved.", note ? "warn" : "ok");
          setRecord(r);
          setFormKey((k) => k + 1);
        }} />
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Added {fmtDateTime(record.created_at)} · Last changed {fmtDateTime(record.updated_at)}
      </p>
    </div>
  );
}
