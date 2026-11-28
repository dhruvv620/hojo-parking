"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { id: ThemeChoice; label: string; icon: React.ReactNode; title: string }[] = [
  { id: "light", label: "Light", icon: <Sun />, title: "Always light" },
  { id: "dark", label: "Dark", icon: <Moon />, title: "Always dark" },
  { id: "auto", label: "Auto", icon: <SunMoon />, title: "Dark from 8 PM to 6 AM" },
];

/** Light / Dark / Auto buttons for the account menu. Remembered on this device. */
export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>("light");
  useEffect(() => setChoice(getThemeChoice()), []);
  return (
    <div className="mt-2.5">
      <div className="mb-1 text-[11px] font-semibold text-slate-500">Colors on this device</div>
      <div role="radiogroup" aria-label="Colors" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-0.5">
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={choice === o.id} title={o.title}
            onClick={(e) => { e.stopPropagation(); setChoice(o.id); setThemeChoice(o.id); }}
            className={`flex h-7 items-center justify-center gap-1 rounded-md text-xs font-semibold transition [&>svg]:h-3.5 [&>svg]:w-3.5 ${
              choice === o.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            {o.icon} {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
