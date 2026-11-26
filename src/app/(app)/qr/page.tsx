"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, ExternalLink, Printer, RefreshCw, ScanLine } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HOTEL_NAME } from "@/lib/config";
import { LOTS } from "@/lib/lots";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ui/Confirm";

/** Printable sign with the QR code guests scan to check themselves in. */
export default function QrPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [token, setToken] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const url = token && typeof window !== "undefined" ? `${window.location.origin}/checkin?k=${token}` : "";

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("app_settings").select("value").eq("key", "checkin_token").maybeSingle();
    if (error || !data) setError("Guest check-in isn't set up yet. Run supabase/update-6-lots-and-guest-form.sql in Supabase.");
    else setToken((data as { value: string }).value);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 0, width: 640, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } }).then(setSvg);
  }, [url]);

  async function rotate() {
    const ok = await confirm({
      title: "Make a new QR code?",
      message: "The old QR code stops working right away. You'll need to print the new sign and replace the old one.",
      confirmText: "Make new code",
      tone: "danger",
    });
    if (!ok) return;
    const { data, error } = await supabaseBrowser().rpc("rotate_checkin_token");
    if (error) toast(error.message, "error");
    else { setToken(data as string); toast("New QR code ready. Print it and replace the old sign."); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Guest check-in QR</h1>
          <p className="mt-1 text-sm text-slate-500">Print this sign and put it at the front desk. Guests scan it to register their car; it shows up on the dashboard right away.</p>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2 print:hidden">
            <button className="btn-primary" onClick={() => window.print()} disabled={!svg}><Printer /> Print sign</button>
            <button className="btn-secondary" disabled={!url} onClick={async () => { await navigator.clipboard.writeText(url); toast("Link copied."); }}><Copy /> Copy link</button>
            <a className="btn-secondary" href={url || undefined} target="_blank" rel="noreferrer"><ExternalLink /> Open form</a>
            <button className="btn-ghost ml-auto" onClick={rotate} disabled={!token}><RefreshCw /> Make new code</button>
          </div>

          {/* the printable sign */}
          <div className="card mx-auto max-w-xl p-8 text-center print:max-w-none print:border-0 print:shadow-none sm:p-10">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{HOTEL_NAME}</div>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Parking check-in</h2>
            <p className="mt-2 flex items-center justify-center gap-2 text-lg text-slate-600">
              <ScanLine className="h-5 w-5" /> Scan with your phone camera
            </p>
            <div className="mx-auto mt-6 w-64 max-w-full sm:w-72 [&>svg]:h-auto [&>svg]:w-full">
              {svg
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={svg} alt="QR code for guest parking check-in" className="h-auto w-full [image-rendering:pixelated]" />
                : <div className="skeleton aspect-square w-full" />}
            </div>
            <ul className="mx-auto mt-8 max-w-sm space-y-2 text-left">
              {LOTS.filter((l) => l.id !== "hotel").map((l) => (
                <li key={l.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-2.5">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${l.dot}`} />
                  <b className="w-14 shrink-0">{l.name}</b>
                  <span className="text-slate-600">{l.rule}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-slate-500">Takes about a minute. Need help? Ask the front desk.</p>
          </div>
        </>
      )}
    </div>
  );
}
