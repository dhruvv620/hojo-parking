"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import type { LotId } from "./lots";

/**
 * Lots staff have marked "Full" for the guest check-in form.
 * Refreshes every 30 seconds and when the window regains focus, so all desks agree.
 */
export function useLotsFull() {
  const [full, setFull] = useState<LotId[]>([]);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(true); // false until update 10 is installed

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("app_settings").select("value").eq("key", "lots_full").maybeSingle();
    if (error || !data) setAvailable(false);
    else {
      setAvailable(true);
      setFull(((data as { value: string }).value || "").split(",").filter(Boolean) as LotId[]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => { clearInterval(t); window.removeEventListener("focus", load); };
  }, [load]);

  const setLotFull = useCallback(async (lot: LotId, isFull: boolean) => {
    setFull((f) => (isFull ? [...f.filter((x) => x !== lot), lot] : f.filter((x) => x !== lot))); // instant feedback
    const { data, error } = await supabaseBrowser().rpc("set_lot_full", { p_lot: lot, p_full: isFull });
    if (error) { load(); return error.message; }
    setFull(((data as string) || "").split(",").filter(Boolean) as LotId[]);
    return null;
  }, [load]);

  return { full, ready, available, setLotFull, reload: load };
}
