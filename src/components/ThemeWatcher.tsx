"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { THEME_KEY, applyTheme } from "@/lib/theme";

/** Keeps the colors right: Auto switches at 8 PM / 6 AM, the phone's setting can change, other tabs can change it. */
export function ThemeWatcher() {
  const path = usePathname();
  useEffect(() => { applyTheme(); }, [path]);
  useEffect(() => {
    const t = setInterval(applyTheme, 60_000);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) applyTheme(); };
    mq.addEventListener("change", applyTheme);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", applyTheme);
    return () => {
      clearInterval(t);
      mq.removeEventListener("change", applyTheme);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", applyTheme);
    };
  }, []);
  return null;
}
