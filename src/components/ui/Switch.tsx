"use client";

/** On/off switch. */
export function Switch({ checked, onChange, label, tone = "brand", disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; tone?: "brand" | "red"; disabled?: boolean;
}) {
  const on = tone === "red" ? "bg-red-500" : "bg-brand-600";
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="group flex items-center gap-2.5 rounded-lg py-1 text-sm font-medium text-slate-600 outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50">
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${checked ? on : "bg-slate-200 group-hover:bg-slate-300"}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(16_24_40/0.25)] transition-transform duration-200 ease-out ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      {label && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}
