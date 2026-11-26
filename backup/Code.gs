// Howard Johnson Parking: Google Sheet backup
// IMPORTANT: replace PASTE-YOUR-BACKUP-KEY-HERE below with your backup key (see backup/README.md),
// or use Copy script on the app's Backup page, which fills it in for you.
// Paste this whole file into Extensions > Apps Script, then Deploy > New deployment > Web app.
// The parking database sends every change here; it is written into the tabs
// "Cars" and "Stay history". Rows are never deleted: a deleted car gets a "Deleted at" time.

const KEY = "PASTE-YOUR-BACKUP-KEY-HERE";
const TIME_ZONE = "America/Phoenix";

const CARS = [
  ["id", "Record ID"], ["guest_name", "Guest"], ["phone", "Phone"], ["room_number", "Room"],
  ["confirmation_number", "Confirmation #"], ["source", "Booked"], ["vehicle_type", "Vehicle"],
  ["license_plate", "Plate"], ["plate_state", "State"], ["make", "Make"], ["model", "Model"], ["color", "Color"],
  ["lot", "Lot"], ["status", "Status"], ["arrival_at", "Checked in"], ["days", "Days"],
  ["checkout_at", "Leaves by"], ["checked_out_at", "Checked out early at"], ["notes", "Notes"],
  ["spot_map", "Map lot"], ["spot_x", "Map X"], ["spot_y", "Map Y"],
  ["created_at", "Created"], ["updated_at", "Last changed"], ["deleted_at", "Deleted at"],
];
const CHANGES = [
  ["id", "Change ID"], ["record_id", "Record ID"], ["changed_at", "When"], ["changed_by_email", "By"],
  ["kind", "What"], ["old_arrival_at", "Old check-in"], ["old_days", "Old days"], ["old_checkout_at", "Old leaves by"],
  ["new_arrival_at", "New check-in"], ["new_days", "New days"], ["new_checkout_at", "New leaves by"],
  ["old_location", "Old lot"], ["new_location", "New lot"], ["details", "Details"],
  ["payment", "Payment"], ["amount", "Amount"], ["note", "Note"], ["paid_marked_at", "Marked paid at"],
];

function doGet() {
  return ContentService.createTextOutput("Parking backup is running.");
}

function doPost(e) {
  if (!e || !e.parameter || e.parameter.key !== KEY) return reply({ ok: false, error: "wrong key" });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const msg = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cars = tab(ss, "Cars", CARS);
    const changes = tab(ss, "Stay history", CHANGES);
    if (msg.kind === "full") {
      replaceAll(cars, CARS, msg.cars || []);
      replaceAll(changes, CHANGES, msg.changes || []);
    } else if (msg.kind === "car") {
      const rec = msg.record || {};
      if (msg.op === "DELETE") markDeleted(cars, CARS, rec.id);
      else upsert(cars, CARS, rec);
    } else if (msg.kind === "change") {
      upsert(changes, CHANGES, msg.record || {});
    }
    status(ss, msg.kind === "test" ? "Test received" : "Last backup");
    return reply({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function tab(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map((c) => c[1])]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat("@"); // keep plates / numbers as typed
  }
  return sh;
}

function cell(field, v) {
  if (v === null || v === undefined) return "";
  if (/_at$/.test(field) && v) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, TIME_ZONE, "yyyy-MM-dd HH:mm");
  }
  return String(v);
}

function rowOf(cols, rec) {
  return cols.map((c) => cell(c[0], rec[c[0]]));
}

function findRow(sh, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const hit = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function upsert(sh, cols, rec) {
  if (!rec.id) return;
  const values = [rowOf(cols, rec)];
  const r = findRow(sh, rec.id);
  if (r) sh.getRange(r, 1, 1, cols.length).setValues(values);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setNumberFormat("@").setValues(values);
}

function markDeleted(sh, cols, id) {
  const r = findRow(sh, id);
  const col = cols.findIndex((c) => c[0] === "deleted_at") + 1;
  if (r && col) sh.getRange(r, col).setValue(Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm"));
}

function replaceAll(sh, cols, records) {
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  if (!records.length) return;
  sh.getRange(2, 1, records.length, cols.length).setNumberFormat("@").setValues(records.map((r) => rowOf(cols, r)));
}

function status(ss, label) {
  const sh = ss.getSheetByName("Status") || ss.insertSheet("Status");
  sh.getRange("A1:B1").setValues([[label, Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm:ss")]]);
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
