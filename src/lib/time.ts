const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export function addDays(dateIso: string | Date, days: number) {
  return new Date(new Date(dateIso).getTime() + days * DAY);
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function fmtDay(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "2d 5h", "3h 20m", "12m" */
export function fmtDuration(ms: number) {
  const abs = Math.max(0, ms);
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  const m = Math.floor((abs % HOUR) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function startOfDay(d: Date | number) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sameDay(a: Date | string, b: Date | string) {
  return startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime();
}

/** Value for <input type="datetime-local"> in the computer's own time zone. */
export function toLocalInput(d: string | Date) {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function fromLocalInput(v: string) {
  return new Date(v).toISOString();
}
