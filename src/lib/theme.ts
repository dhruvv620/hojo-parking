/**
 * Light / dark colors. Staff pick Light, Dark or Auto (dark from 8 PM to 6 AM)
 * in the account menu; it is remembered on each device. The guest check-in
 * page always follows the phone's own setting. Printing is always light.
 */
export type ThemeChoice = "light" | "dark" | "auto";
export const THEME_KEY = "hojo-theme";
export const DARK_FROM = 20; // 8 PM
export const DARK_UNTIL = 6; // 6 AM

/**
 * Runs before the page draws (inline in <head>) so there is no white flash.
 * Kept as plain old JavaScript in a string; the same logic as applyTheme().
 */
export const themeScript = `(function(){try{
var guest=location.pathname.indexOf('/checkin')===0;
var c=guest?'system':(localStorage.getItem('${THEME_KEY}')||'light');
var h=new Date().getHours();
var d=c==='dark'||(c==='auto'&&(h>=${DARK_FROM}||h<${DARK_UNTIL}))||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',d?'dark':'light');
}catch(e){}})();`;

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "dark" || v === "auto" ? v : "light";
  } catch {
    return "light";
  }
}

export function applyTheme() {
  const guest = location.pathname.startsWith("/checkin");
  const h = new Date().getHours();
  const c = guest ? "system" : getThemeChoice();
  const dark =
    c === "dark" ||
    (c === "auto" && (h >= DARK_FROM || h < DARK_UNTIL)) ||
    (c === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function setThemeChoice(c: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, c);
  } catch {
    /* private window: just use it for now */
  }
  applyTheme();
}
