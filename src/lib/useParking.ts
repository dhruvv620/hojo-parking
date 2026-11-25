"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import { liveStatus, type ParkingRecord } from "./types";
import { DAY, sameDay } from "./time";
import { LOT_CAPACITY } from "./config";

/** Re-renders every 30 seconds so cars check out on time with nobody touching anything. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Everything the dashboard needs: upcoming reservations, parked cars, and cars
 * that left in the last 24 hours. Updates live when any desk makes a change.
 */
export function useParking() {
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  const load = useCallback(async () => {
    const since = new Date(Date.now() - DAY).toISOString();
    const { data, error } = await supabaseBrowser()
      .from("parking_records")
      .select("*")
      .or(
        `status.eq.reserved,and(status.eq.parked,checkout_at.gt.${since}),and(status.eq.checked_out,checked_out_at.gt.${since})`,
      )
      .order("arrival_at", { ascending: true });
    if (error) setError(error.message);
    else {
      setError(null);
      setRecords(data as ParkingRecord[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const sb = supabaseBrowser();
    const channel = sb
      .channel("parking-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "parking_records" }, () => load())
      .subscribe();
    // backup refresh in case the live connection drops
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      sb.removeChannel(channel);
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const view = useMemo(() => {
    const parked: ParkingRecord[] = [];
    const upcoming: ParkingRecord[] = [];
    const recentlyLeft: ParkingRecord[] = [];
    for (const r of records) {
      const s = liveStatus(r, now);
      if (s === "parked") parked.push(r);
      else if (s === "upcoming") upcoming.push(r);
      else if (s === "auto_out" || s === "checked_out") recentlyLeft.push(r);
    }
    const inside = parked.filter((r) => r.location === "inside");
    const outside = parked.filter((r) => r.location === "outside");
    const leavingToday = parked
      .filter((r) => sameDay(r.checkout_at, new Date(now)))
      .sort((a, b) => a.checkout_at.localeCompare(b.checkout_at));
    recentlyLeft.sort((a, b) => {
      const la = a.status === "checked_out" ? a.checked_out_at! : a.checkout_at;
      const lb = b.status === "checked_out" ? b.checked_out_at! : b.checkout_at;
      return lb.localeCompare(la);
    });
    return {
      parked,
      inside,
      outside,
      upcoming,
      recentlyLeft,
      leavingToday,
      available: Math.max(0, LOT_CAPACITY - inside.length),
      isFull: inside.length >= LOT_CAPACITY,
    };
  }, [records, now]);

  return { ...view, records, loading, error, now, reload: load };
}
