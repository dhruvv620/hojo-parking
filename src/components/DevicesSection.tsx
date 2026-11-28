"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Laptop, MonitorSmartphone, Pencil, RotateCcw, Smartphone, Tablet, Wifi, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { getDeviceKey } from "@/lib/device";
import { fmtDateTime, fmtDuration } from "@/lib/time";
import type { Device } from "@/lib/types";
import { useToast } from "./Toast";
import { useConfirm } from "./ui/Confirm";
import { pinResultError, usePin } from "./ui/Pin";
import { EmptyState, SectionTitle } from "./ui/bits";

const DAY = 86_400_000;

function DeviceIcon({ label }: { label: string | null }) {
  const l = label ?? "";
  if (/iPhone|Android phone/.test(l)) return <Smartphone className="h-5 w-5" />;
  if (/iPad|tablet/.test(l)) return <Tablet className="h-5 w-5" />;
  if (/Mac|Chromebook/.test(l)) return <Laptop className="h-5 w-5" />;
  return <MonitorSmartphone className="h-5 w-5" />;
}

const ago = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  return ms < 90_000 ? "active now" : `active ${fmtDuration(ms)} ago`;
};

/** Staff page: every phone/computer that has used the app, with Remove / Restore. */
export function DevicesSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const askPin = usePin();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [hotelIp, setHotelIp] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const mine = getDeviceKey();

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [d, s] = await Promise.all([
      sb.from("devices").select("*").order("last_seen", { ascending: false }),
      sb.from("app_settings").select("value").eq("key", "hotel_ip").maybeSingle(),
    ]);
    if (d.error) { setUnavailable(true); return; }
    setDevices(d.data as Device[]);
    setHotelIp(((s.data as { value: string } | null)?.value) ?? "");
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function remove(d: Device) {
    const ok = await confirm({
      title: `Remove ${d.name ?? d.label ?? "this device"}?`,
      message: "It's signed out within about a minute and can't use the parking app again unless you restore it here. (If someone clears their browser, it shows up below as a new device.)",
      confirmText: "Remove device",
      tone: "danger",
    });
    if (!ok) return;
    const pin = await askPin(`Remove ${d.name ?? d.label ?? "this device"}`);
    if (pin === null) return;
    const { data, error } = await supabaseBrowser().rpc("set_device_removed", { p_id: d.id, p_removed: true, p_pin: pin });
    const err = pinResultError(data, error);
    if (err) toast(err, "error"); else { toast("Device removed."); load(); }
  }

  async function restore(d: Device) {
    const pin = await askPin(`Restore ${d.name ?? d.label ?? "this device"}`);
    if (pin === null) return;
    const { data, error } = await supabaseBrowser().rpc("set_device_removed", { p_id: d.id, p_removed: false, p_pin: pin });
    const err = pinResultError(data, error);
    if (err) toast(err, "error"); else { toast("Device restored."); load(); }
  }

  async function saveName(d: Device) {
    const { error } = await supabaseBrowser().rpc("rename_device", { p_id: d.id, p_name: draft });
    if (error) toast(error.message, "error"); else { setEditing(null); load(); }
  }

  async function setHotel() {
    const ok = await confirm({
      title: "Use this network as the hotel's?",
      message: "Do this on a front-desk computer, connected to the hotel's internet. Devices on this network will show “At hotel”; others show “Outside hotel”.",
      confirmText: "Yes, this is the hotel network",
    });
    if (!ok) return;
    const pin = await askPin("Change the hotel network");
    if (pin === null) return;
    const { data, error } = await supabaseBrowser().rpc("set_hotel_network", { p_pin: pin });
    const err = pinResultError(data, error);
    if (err) toast(err, "error"); else { toast(`Hotel network saved (${(data as { ip: string }).ip}).`); load(); }
  }

  if (unavailable) {
    return (
      <section className="card p-5 sm:p-6">
        <SectionTitle icon={<MonitorSmartphone />} title="Devices" />
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Device log isn&apos;t set up yet. Run supabase/update-13-devices.sql (or schema.sql) in Supabase.</p>
      </section>
    );
  }

  const active = (devices ?? []).filter((d) => !d.removed_at);
  const removed = (devices ?? []).filter((d) => d.removed_at);

  const row = (d: Device) => {
    const isMine = d.device_key === mine;
    const isNew = Date.now() - new Date(d.first_seen).getTime() < DAY;
    const atHotel = !!hotelIp && d.last_ip === hotelIp;
    return (
      <li key={d.id} className="flex flex-wrap items-start gap-3 py-3.5">
        <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${d.removed_at ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-600"}`}>
          <DeviceIcon label={d.label} />
        </span>
        <div className="min-w-0 flex-1">
          {editing === d.id ? (
            <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); saveName(d); }}>
              <input autoFocus className="input h-8 max-w-xs text-sm" maxLength={40} placeholder="e.g. Front desk PC" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn-primary btn-sm btn-icon" aria-label="Save name"><Check /></button>
              <button type="button" className="btn-ghost btn-sm btn-icon" aria-label="Cancel" onClick={() => setEditing(null)}><X /></button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-900">{d.name ?? d.label ?? "Unknown device"}</span>
              <button className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Rename device"
                onClick={() => { setEditing(d.id); setDraft(d.name ?? ""); }}><Pencil className="h-3.5 w-3.5" /></button>
              {isMine && <span className="chip bg-brand-50 text-brand-700">This device</span>}
              {isNew && !d.removed_at && <span className="chip bg-amber-100 text-amber-800">New</span>}
              {!d.removed_at && hotelIp && (atHotel
                ? <span className="chip bg-emerald-50 text-emerald-700"><Wifi className="h-3 w-3" /> At hotel</span>
                : <span className="chip bg-slate-100 text-slate-600">Outside hotel</span>)}
              {d.removed_at && <span className="chip bg-red-50 text-red-700">Removed</span>}
            </div>
          )}
          <div className="mt-0.5 text-xs text-slate-500">
            {d.name && d.label ? `${d.label} · ` : ""}
            {d.removed_at
              ? `Removed ${fmtDateTime(d.removed_at)}${d.removed_by ? ` by ${d.removed_by}` : ""}`
              : `${ago(d.last_seen)} · first used ${fmtDateTime(d.first_seen)}`}
            {d.country ? ` · ${d.country}` : ""}{d.last_ip ? ` · IP ${d.last_ip}` : ""}
            {` · ${d.sign_ins} sign-in${d.sign_ins === 1 ? "" : "s"}`}
          </div>
        </div>
        {d.removed_at
          ? <button className="btn-secondary btn-sm" onClick={() => restore(d)}><RotateCcw /> Restore</button>
          : !isMine && <button className="btn-danger btn-sm" onClick={() => remove(d)}><X /> Remove device</button>}
      </li>
    );
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle icon={<MonitorSmartphone />} title={`Devices (${active.length})`}
          sub="Every phone and computer that has used the app. Remove any you don't recognize." />
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Wifi className="h-3.5 w-3.5" />
          {hotelIp ? <>Hotel network: <b className="font-mono text-slate-700">{hotelIp}</b></> : "Hotel network not set"}
          <button className="btn-secondary btn-sm" onClick={setHotel}>This is the hotel network</button>
        </div>
      </div>

      {devices === null ? (
        <div className="mt-4 space-y-3">{[0, 1].map((i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : active.length === 0 ? (
        <EmptyState compact icon={<MonitorSmartphone />} title="No devices yet" />
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">{active.map(row)}</ul>
      )}

      {removed.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button className="text-sm font-semibold text-slate-500 hover:text-slate-800" onClick={() => setShowRemoved((v) => !v)}>
            {showRemoved ? "Hide" : "Show"} removed devices ({removed.length})
          </button>
          {showRemoved && <ul className="mt-1 divide-y divide-slate-100">{removed.map(row)}</ul>}
        </div>
      )}
    </section>
  );
}
