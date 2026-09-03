/**
 * Seminar room reservations — Google Apps Script backend.
 * Department of Microbiology, Chungbuk National University.
 *
 * Deploy this as a Web App ("Execute as: Me", "Who has access: Anyone")
 * and paste the /exec URL into assets/js/config.js.
 *
 * Data lives in the sheet named SHEET_NAME of the bound spreadsheet.
 */

var SHEET_NAME     = 'Reservations';
var MAX_DAYS_AHEAD = 90;
var MIN_LEAD_HOURS = 2;   // a booking may not start sooner than this from now
var MAX_HOURS      = 6;
var OPEN_HOUR      = 8;
var CLOSE_HOUR     = 22;

// The five columns the office reads come first; the last three are machinery
// (createdAt for the record, id + pin so a booking can be cancelled).
var HEADERS = ['date', 'start', 'end', 'name', 'lab', 'createdAt', 'id', 'pin'];

/* ---------------------------------------------------------------- helpers */

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function rows_() {
  var sh = sheet_();
  if (sh.getLastRow() < 2) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  return values.map(function (row, i) {
    var rec = { _row: i + 2 };
    HEADERS.forEach(function (h, c) { rec[h] = row[c]; });
    // Sheets may hand back Date objects; normalise everything to strings.
    rec.date  = normDate_(rec.date);
    rec.start = normTime_(rec.start);
    rec.end   = normTime_(rec.end);
    return rec;
  });
}

function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').trim();
}

function normTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  return String(v || '').trim();
}

function toMin_(hhmm) {
  var parts = String(hhmm).split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Strip anything the public should not see (the cancellation PIN). */
function publicView_(rec) {
  return {
    id: rec.id, date: rec.date, start: rec.start, end: rec.end,
    name: rec.name, lab: rec.lab,
  };
}

/* ------------------------------------------------------------------ read */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action !== 'list') return json_({ ok: false, error: 'UNKNOWN_ACTION' });

    var from = p.from || '0000-00-00';
    var to   = p.to   || '9999-99-99';
    var out = rows_()
      .filter(function (r) { return r.id && r.date >= from && r.date <= to; })
      .map(publicView_);

    return json_({ ok: true, reservations: out });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ----------------------------------------------------------------- write */

function doPost(e) {
  // One writer at a time, so two people cannot claim the same slot.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'BUSY' });
  }

  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'create') return json_(create_(body));
    if (body.action === 'cancel') return json_(cancel_(body));
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function create_(b) {
  var date  = normDate_(b.date);
  var start = normTime_(b.start);
  var end   = normTime_(b.end);
  var name  = String(b.name || '').trim();
  var lab   = String(b.lab || '').trim();
  var pin   = String(b.pin || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))  return { ok: false, error: 'BAD_DATE' };
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return { ok: false, error: 'BAD_TIME' };
  if (!name || !lab)                      return { ok: false, error: 'MISSING_FIELDS' };
  if (!/^\d{4}$/.test(pin))               return { ok: false, error: 'BAD_PIN_FORMAT' };

  var today = todayIso_();
  if (date < today) return { ok: false, error: 'PAST_DATE' };

  // Reject times already gone, and last-minute claims on a room that may well
  // be occupied right now. Parsed in the script's own timezone.
  var tz = Session.getScriptTimeZone();
  var startsAt = Utilities.parseDate(date + ' ' + start, tz, 'yyyy-MM-dd HH:mm');
  var earliest = new Date(new Date().getTime() + MIN_LEAD_HOURS * 3600 * 1000);
  if (startsAt.getTime() < earliest.getTime()) {
    return { ok: false, error: 'TOO_SOON' };
  }

  var limit = new Date();
  limit.setDate(limit.getDate() + MAX_DAYS_AHEAD);
  if (date > Utilities.formatDate(limit, Session.getScriptTimeZone(), 'yyyy-MM-dd')) {
    return { ok: false, error: 'TOO_FAR' };
  }

  var s = toMin_(start), en = toMin_(end);
  if (en <= s)                       return { ok: false, error: 'BAD_RANGE' };
  if (en - s > MAX_HOURS * 60)       return { ok: false, error: 'TOO_LONG' };
  if (s < OPEN_HOUR * 60 || en > CLOSE_HOUR * 60) return { ok: false, error: 'OUT_OF_HOURS' };

  var clash = rows_().some(function (r) {
    return r.date === date && toMin_(r.start) < en && s < toMin_(r.end);
  });
  if (clash) return { ok: false, error: 'SLOT_TAKEN' };

  var rec = {
    id: Utilities.getUuid(),
    createdAt: new Date().toISOString(),
    date: date, start: start, end: end,
    name: name, lab: lab,
    pin: pin,
  };

  sheet_().appendRow(HEADERS.map(function (h) { return rec[h]; }));
  return { ok: true, reservation: publicView_(rec) };
}

function cancel_(b) {
  var id  = String(b.id || '').trim();
  var pin = String(b.pin || '').trim();

  var hit = null;
  rows_().forEach(function (r) { if (String(r.id) === id) hit = r; });

  if (!hit) return { ok: false, error: 'NOT_FOUND' };
  if (String(hit.pin) !== pin) return { ok: false, error: 'BAD_PIN' };

  sheet_().deleteRow(hit._row);
  return { ok: true };
}

/* --------------------------------------------------------------- one-off */

/**
 * Run once from the editor to create the sheet, and again after changing
 * HEADERS to rewrite the header row in place.
 */
function setup() {
  var sh = sheet_();
  sh.getRange(1, 1, 1, sh.getMaxColumns()).clearContent();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  SpreadsheetApp.getActiveSpreadsheet().toast('Reservations sheet ready: ' + HEADERS.join(', '));
}
