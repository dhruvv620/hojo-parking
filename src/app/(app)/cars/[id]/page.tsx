"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CarForm } from "@/components/CarForm";
import { useParking } from "@/lib/useParking";
import { useRun, useToast } from "@/components/Toast";
import { liveStatus, type LiveStatus, type ParkingRecord } from "@/lib/types";
import { fmtDateTime } from "@/lib/time";
import { cancelReservation, checkOutNow, deleteRecord, extend, markArrived, restoreReservation } from "@/lib/actions";

const STATUS: Record<LiveStatus, { text: string; cls: string }> = {
  upcoming: { text: "Upcoming reservation", cls: "bg-violet-50 text-violet-700" },
  parked: { text: "Parked", cls: "bg-emerald-50 text-emerald-700" },
  auto_out: { text: "Checked out (auto)", cls: "bg-slate-100 text-slate-700" },
  checked_out: { text: "Checked out (manual)", cls: "bg-slate-100 text-slate-700" },
  cancelled: { text: "Cancelled", cls: "bg-red-50 text-red-700" },
};

export default function EditCarPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const run = useRun();
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
      <div className="py-20 text-center">
        <p className="text-slate-500">This record was not found. It may have been deleted.</p>
        <Link href="/" className="btn-secondary mt-4">Back to dashboard</Link>
      </div>
    );
  }
  if (!record || lot.loading) return <p className="py-20 text-center text-slate-500">Loading...</p>;

  const s = liveStatus(record, lot.now);
  const act = async (p: ReturnType<typeof checkOutNow>, msg: string) => {
    if (await run(p, msg)) load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm font-semibold text-brand-600 hover:underline">&larr; Dashboard</Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{record.guest_name}</h1>
        <span className={`chip ${STATUS[s].cls}`}>{STATUS[s].text}</span>
        <span className="font-mono text-sm text-slate-500">{record.license_plate}</span>
      </div>

      {/* Quick actions */}
      <div className="card mb-6 flex flex-wrap items-center gap-2 p-4">
        {s === "upcoming" && (
          <>
            <button className="btn-primary" onClick={() => act(markArrived(record, lot.isFull), "Checked in. Paid days start now.")}>
              Guest arrived
            </button>
            <button className="btn-secondary" onClick={() => confirm("Cancel this reservation?") && act(cancelReservation(record), "Reservation cancelled.")}>
              Cancel reservation
            </button>
          </>
        )}
        {s === "parked" && (
          <>
            <button className="btn-secondary" onClick={() => act(extend(record, 1), "Extended by 1 day.")}>+1 day</button>
            <button className="btn-secondary" onClick={() => act(extend(record, 2), "Extended by 2 days.")}>+2 days</button>
            <button className="btn-secondary" onClick={() => confirm("Check this car out now? The spot frees up right away.") && act(checkOutNow(record), "Checked out. Spot is free.")}>
              Check out now
            </button>
          </>
        )}
        {(s === "auto_out" || s === "checked_out") && (
          <>
            <span className="text-sm text-slate-600">
              Left {fmtDateTime(s === "auto_out" ? record.checkout_at : record.checked_out_at)}. Car still here?
            </span>
            <button className="btn-primary" onClick={() => act(extend(record, 1), "Extended. Car is back in the lot.")}>Extend 1 day</button>
          </>
        )}
        {s === "cancelled" && (
          <button className="btn-secondary" onClick={() => act(restoreReservation(record), "Reservation restored.")}>Restore reservation</button>
        )}
        <button className="btn-danger ml-auto"
          onClick={async () => {
            if (!confirm(`Delete ${record.guest_name}'s record for good? This cannot be undone.`)) return;
            const res = await deleteRecord(record);
            if (res.ok) { toast("Record deleted."); router.push("/"); }
            else toast(res.error, "error");
          }}>
          Delete
        </button>
      </div>

      <CarForm key={formKey} record={record} insideCount={lot.inside.length}
        onSaved={(r, note) => {
          toast(note ?? "Changes saved.", note ? "warn" : "ok");
          setRecord(r);
          setFormKey((k) => k + 1);
        }} />

      <p className="mt-6 text-center text-xs text-slate-400">
        Added {fmtDateTime(record.created_at)} · Last changed {fmtDateTime(record.updated_at)}
      </p>
    </div>
  );
}
