"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MonitorSmartphone, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { getDeviceKey } from "@/lib/device";
import { fmtDateTime } from "@/lib/time";
import type { Device } from "@/lib/types";

const SEEN_KEY = "hojo.devices.seen";

/** Small dashboard notice when a new phone/computer started using the app in the last 24 hours. */
export function NewDeviceNotice() {
  const [list, setList] = useState<Device[]>([]);
  const [hotelIp, setHotelIp] = useState("");

  useEffect(() => {
    const load = async () => {
      const sb = supabaseBrowser();
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [d, s] = await Promise.all([
        sb.from("devices").select("*").gt("first_seen", since).is("removed_at", null).order("first_seen", { ascending: false }),
        sb.from("app_settings").select("value").eq("key", "hotel_ip").maybeSingle(),
      ]);
      if (d.error) return; // device update not installed
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { /* ignore */ }
      const mine = getDeviceKey();
      setList((d.data as Device[]).filter((x) => x.device_key !== mine && !seen.includes(x.id)));
      setHotelIp(((s.data as { value: string } | null)?.value) ?? "");
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  if (list.length === 0) return null;

  function dismiss() {
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...list.map((d) => d.id)].slice(-200)));
    } catch { /* ignore */ }
    setList([]);
  }

  const d = list[0];
  const where = hotelIp ? (d.last_ip === hotelIp ? "at the hotel" : "outside the hotel network") : null;
  return (
    <div className="flex animate-rise flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <MonitorSmartphone className="h-5 w-5 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1">
        <b>New device signed in:</b> {d.name ?? d.label ?? "Unknown device"}
        {where && <> · {where}</>} · {fmtDateTime(d.first_seen)}
        {list.length > 1 && <> (and {list.length - 1} more)</>}
      </span>
      <Link href="/staff" className="btn-secondary btn-sm">Review devices</Link>
      <button onClick={dismiss} aria-label="Dismiss" className="rounded-md p-1 text-amber-700 transition hover:bg-amber-100"><X className="h-4 w-4" /></button>
    </div>
  );
}
