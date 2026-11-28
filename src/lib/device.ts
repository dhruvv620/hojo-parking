/**
 * Each browser gets its own random device ID, saved in that browser. It's sent
 * with every request so the database can log devices and block removed ones.
 * Clearing the browser's data (or a private window) makes a new device.
 */
const STORAGE_KEY = "hojo.device";
let memoryKey: string | null = null;

function randomKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getDeviceKey(): string {
  if (typeof window === "undefined") return "";
  try {
    let k = localStorage.getItem(STORAGE_KEY);
    if (!k || !/^[a-f0-9]{32}$/.test(k)) {
      k = randomKey();
      localStorage.setItem(STORAGE_KEY, k);
    }
    return k;
  } catch {
    // storage blocked: still works for this visit
    memoryKey ??= randomKey();
    return memoryKey;
  }
}

/** "Chrome on Windows", "Safari on iPhone", ... */
export function deviceLabel(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  const os =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad|Macintosh.*Mobile/.test(ua) ? "iPad"
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
    : /CrOS/.test(ua) ? "Chromebook"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : "unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
    : /CriOS|Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  return `${browser} on ${os}`;
}
