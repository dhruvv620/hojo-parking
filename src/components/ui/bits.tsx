import { Car, CarFront, Truck } from "lucide-react";
import { lotById } from "@/lib/lots";

const TONES = {
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** Round badge with the guest's initials. */
export function Avatar({ name, tone = "brand", size = "md" }: { name: string; tone?: keyof typeof TONES; size?: "md" | "lg" }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-inset ${TONES[tone]} ${
      size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-xs"}`}>
      {initials}
    </span>
  );
}

/** License plate styled like a real plate. */
export function Plate({ plate, state, size = "md" }: { plate: string; state?: string | null; size?: "md" | "lg" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white font-mono font-bold tracking-wider text-slate-800 shadow-[inset_0_-2px_0_rgb(0_0_0/0.04)] ${
      size === "lg" ? "px-2.5 py-1 text-base" : "px-1.5 py-0.5 text-xs"}`}>
      {plate}
      {state && <span className="font-sans text-[10px] font-semibold tracking-normal text-slate-400">{state}</span>}
    </span>
  );
}

export function SectionTitle({ icon, title, sub }: { icon?: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      )}
      <div>
        <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action, compact }: {
  icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode; compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-6" : "py-12"}`}>
      <span className={`flex items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ${compact ? "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5" : "h-14 w-14 [&>svg]:h-6 [&>svg]:w-6"}`}>
        {icon}
      </span>
      <p className={`mt-3 font-semibold text-slate-700 ${compact ? "text-sm" : ""}`}>{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Icon for Car / SUV / Truck. */
export function VehicleIcon({ type, className = "" }: { type: string | null | undefined; className?: string }) {
  if (type === "truck") return <Truck className={className} />;
  if (type === "suv") return <CarFront className={className} />;
  return <Car className={className} />;
}

/** Small coloured badge with the lot name. */
export function LotChip({ lot }: { lot: string | null | undefined }) {
  const l = lotById(lot);
  if (!l) return <span className="chip bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">Needs a lot</span>;
  return (
    <span className={`chip ring-1 ring-inset ${l.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} /> {l.name}
    </span>
  );
}
