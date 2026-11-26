"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check, CircleCheck, CircleDashed, CloudUpload, Copy, DatabaseBackup, ExternalLink, FileSpreadsheet,
  HardDriveDownload, LoaderCircle, Send, Unplug,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { backupScript } from "@/lib/backupScript";
import { fmtDateTime } from "@/lib/time";
import { carLabel, sourceLabel, type ParkingRecord } from "@/lib/types";
import { lotName, recordLot, vehicleLabel } from "@/lib/lots";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { SectionTitle } from "@/components/ui/bits";

type Settings = { url: string; key: string; lastFull: string };

const sb = () => supabaseBrowser();

/** Reads every row of a table, 1000 at a time. */
async function fetchAll(table: string, order: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from(table).select("*").order(order).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as Record<string, unknown>[]));
    if (!data || data.length < 1000) return out;
  }
}

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function BackupPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb().from("app_settings").select("key, value").in("key", ["backup_url", "backup_key", "backup_last_full"]);
    const map = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    if (error || !map.backup_key) {
      setError("Backup isn't set up in the database yet. Run supabase/update-7-sheet-backup.sql in Supabase.");
      return;
    }
    setS({ url: map.backup_url ?? "", key: map.backup_key, lastFull: map.backup_last_full ?? "" });
  }, []);
  useEffect(() => { load(); }, [load]);

  const connected = !!s?.url;
  const today = new Date().toISOString().slice(0, 10);

  async function saveUrl() {
    if (!s) return;
    const clean = url.trim().split("?")[0];
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(clean)) {
      toast("That doesn't look like a Web app URL. It should start with https://script.google.com/macros/s/ and end with /exec", "error");
      return;
    }
    setBusy("save");
    const full = `${clean}?key=${s.key}`;
    const { error } = await sb().from("app_settings").update({ value: full, updated_at: new Date().toISOString() }).eq("key", "backup_url");
    setBusy(null);
    if (error) toast(error.message, "error");
    else { toast("Google Sheet connected. Now press Send test."); setUrl(""); load(); }
  }

  async function disconnect() {
    if (!(await confirm({ title: "Stop the Google Sheet backup?", message: "New changes won't be copied to the sheet. What's already in the sheet stays there.", confirmText: "Stop backup", tone: "danger" }))) return;
    const { error } = await sb().from("app_settings").update({ value: "" }).eq("key", "backup_url");
    if (error) toast(error.message, "error"); else { toast("Backup stopped."); load(); }
  }

  async function sendTest() {
    setBusy("test");
    const { error } = await sb().rpc("backup_test");
    setBusy(null);
    if (error) toast(error.message, "error");
    else toast("Test sent. In the sheet, the Status tab should say “Test received” within a few seconds.");
  }

  async function sendAll() {
    setBusy("all");
    const { data, error } = await sb().rpc("backup_full");
    setBusy(null);
    if (error) { toast(error.message.replace(/^[A-Z_]+:\s*/, ""), "error"); return; }
    const d = data as { cars: number; changes: number };
    toast(`Sent ${d.cars} cars and ${d.changes} history entries to the sheet.`);
    load();
  }

  async function downloadJson() {
    setBusy("json");
    try {
      const [cars, changes] = await Promise.all([fetchAll("parking_records", "created_at"), fetchAll("stay_changes", "changed_at")]);
      download(`parking-backup-${today}.json`, JSON.stringify({ exported_at: new Date().toISOString(), cars, stay_history: changes }, null, 2), "application/json");
      toast(`Downloaded ${cars.length} cars and ${changes.length} history entries.`);
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  }

  async function downloadCsv() {
    setBusy("csv");
    try {
      const cars = (await fetchAll("parking_records", "arrival_at")) as unknown as ParkingRecord[];
      const head = ["Guest", "Phone", "Room", "Confirmation #", "Booked", "Vehicle", "Plate", "State", "Car", "Lot", "Status", "Checked in", "Days", "Leaves by", "Checked out early", "Notes"];
      const rows = cars.map((r) => [
        r.guest_name, r.phone, r.room_number, r.confirmation_number, sourceLabel(r.source), vehicleLabel(r.vehicle_type), r.license_plate,
        r.plate_state, carLabel(r), lotName(recordLot(r)), r.status, fmtDateTime(r.arrival_at), r.days, fmtDateTime(r.checkout_at),
        r.checked_out_at ? fmtDateTime(r.checked_out_at) : "", r.notes,
      ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
      download(`parking-cars-${today}.csv`, [head.join(","), ...rows].join("\n"), "text/csv");
      toast(`Downloaded ${cars.length} cars.`);
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Backup</h1>
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>
      </div>
    );
  }
  if (!s) return <div className="mx-auto max-w-3xl space-y-4"><div className="skeleton h-10 w-40" /><div className="skeleton h-48 rounded-2xl" /></div>;

  const code = backupScript(s.key);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Backup</h1>
        <p className="mt-1 text-sm text-slate-500">Keep a copy of every car and every change outside the app, in case anything ever goes wrong.</p>
      </div>

      {/* Status */}
      <section className={`card flex flex-wrap items-center gap-4 p-5 ${connected ? "ring-1 ring-emerald-200" : ""}`}>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${connected ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
          {connected ? <CircleCheck className="h-6 w-6" /> : <CircleDashed className="h-6 w-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{connected ? "Google Sheet backup is ON" : "Google Sheet backup is off"}</div>
          <div className="text-sm text-slate-500">
            {connected
              ? <>Every check-in and change is copied to your sheet within seconds.{s.lastFull && <> Last full copy: {fmtDateTime(s.lastFull)}.</>}</>
              : "Follow the steps below once (about 5 minutes)."}
          </div>
        </div>
        {connected && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={sendTest} disabled={!!busy}>
              {busy === "test" ? <LoaderCircle className="animate-spin" /> : <Send />} Send test
            </button>
            <button className="btn-primary btn-sm" onClick={sendAll} disabled={!!busy}>
              {busy === "all" ? <LoaderCircle className="animate-spin" /> : <CloudUpload />} Send everything now
            </button>
            <button className="btn-ghost btn-sm" onClick={disconnect} disabled={!!busy}><Unplug /> Stop</button>
          </div>
        )}
      </section>

      {/* Setup steps (folded away once connected) */}
      {connected && !showSetup ? (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setShowSetup(true)}><FileSpreadsheet /> Connect a different sheet</button>
      ) : (
      <section className="card p-5 sm:p-6">
        <SectionTitle icon={<FileSpreadsheet />} title={connected ? "Connect a different sheet" : "Connect a Google Sheet"}
          sub="Do this once, signed in to the Google account that should own the backup." />
        <ol className="mt-5 space-y-5">
          <Step n={1} title="Make a new Google Sheet">
            <a href="https://sheets.new" target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink /> Open a new sheet</a>
            <span className="ml-2 text-sm text-slate-500">Name it something like “HoJo Parking Backup”.</span>
          </Step>
          <Step n={2} title="Add the backup script">
            <p className="text-sm text-slate-600">In the sheet, click <b>Extensions</b> → <b>Apps Script</b>. Delete everything in the editor, paste this script, and click the 💾 Save icon.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-primary btn-sm" onClick={async () => { await navigator.clipboard.writeText(code); toast("Script copied."); }}><Copy /> Copy script</button>
              <button className="btn-ghost btn-sm" onClick={() => setShowCode((v) => !v)}>{showCode ? "Hide" : "Show"} script</button>
            </div>
            {showCode && <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100">{code}</pre>}
          </Step>
          <Step n={3} title="Publish it as a web app">
            <p className="text-sm text-slate-600">
              Click <b>Deploy</b> → <b>New deployment</b>. Click the ⚙️ gear and choose <b>Web app</b>. Set <b>Execute as: Me</b> and
              <b> Who has access: Anyone</b>, then <b>Deploy</b>. Google will ask you to allow access: choose your account, then
              <b> Advanced</b> → <b>Go to … (unsafe)</b> → <b>Allow</b> (it&apos;s your own script). Copy the <b>Web app URL</b>.
            </p>
            <p className="mt-1.5 text-xs text-slate-500">“Anyone” is needed so the database can reach it. The script ignores anything without your secret key.</p>
          </Step>
          <Step n={4} title="Paste the Web app URL here">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="input flex-1 font-mono text-sm" placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn-primary" onClick={saveUrl} disabled={!url.trim() || busy === "save"}>
                {busy === "save" ? <LoaderCircle className="animate-spin" /> : <Check />} Connect
              </button>
            </div>
          </Step>
          <Step n={5} title="Check it and copy everything">
            <p className="text-sm text-slate-600">Press <b>Send test</b> above. The sheet gets a <b>Status</b> tab saying “Test received”. Then press <b>Send everything now</b> to copy all existing cars and history. From then on it updates by itself.</p>
          </Step>
        </ol>
      </section>
      )}

      {/* Download */}
      <section className="card p-5 sm:p-6">
        <SectionTitle icon={<HardDriveDownload />} title="Download a backup file" sub="An extra copy you can save on a computer or USB drive. Good to do once a month." />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={downloadCsv} disabled={!!busy}>
            {busy === "csv" ? <LoaderCircle className="animate-spin" /> : <FileSpreadsheet />} All cars (.csv, opens in Excel)
          </button>
          <button className="btn-secondary" onClick={downloadJson} disabled={!!busy}>
            {busy === "json" ? <LoaderCircle className="animate-spin" /> : <DatabaseBackup />} Everything incl. history (.json)
          </button>
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1.5 font-semibold text-slate-900">{title}</div>
        {children}
      </div>
    </li>
  );
}
