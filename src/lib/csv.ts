/**
 * One CSV cell, safe to open in Excel / Google Sheets.
 * Text starting with = + - @ (or a tab / line break) would be run as a
 * formula by spreadsheet apps, so it gets a leading apostrophe, which
 * makes the spreadsheet show it as plain text.
 */
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export const csvRow = (values: unknown[]) => values.map(csvCell).join(",");
