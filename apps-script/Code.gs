/**
 * THE FRIDAY CHALLENGE - Google storage
 *
 * Serves the app from GitHub Pages and keeps every score in the "Data" tab of
 * the spreadsheet this script is attached to, so any browser signed in to the
 * school account sees the same numbers. App changes pushed to GitHub show up
 * here automatically; this file rarely needs to change.
 *
 * @OnlyCurrentDoc
 */

var APP_URL = 'https://jackylegs-oss.github.io/friday-challenge/index.html';
var SHEET_NAME = 'Data';

function doGet() {
  var html;
  try {
    html = UrlFetchApp.fetch(APP_URL + '?v=' + Date.now()).getContentText();
  } catch (e) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Couldn’t load The Friday Challenge from GitHub. Reload the page in a minute.</p>');
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle('The Friday Challenge')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Run once from the editor to grant permissions and create the Data and Skip tabs.
function setup() {
  dataSheet_();
  skipSheet_();
  loadAll();
}

function dataSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 3).setValues([['key', 'json', 'updated']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function loadAll() {
  var rows = dataSheet_().getDataRange().getValues().slice(1);
  var out = { weeks: {} };
  rows.forEach(function (r) {
    var key = String(r[0]);
    if (!key || !r[1]) return;
    var value = JSON.parse(r[1]);
    if (key === 'config/main') out.config = value;
    else if (key.indexOf('weeks/') === 0) out.weeks[key.slice(6)] = value;
  });
  return JSON.stringify(out);
}

/* ------------------------------------------------------------
 * Update from gradebook and attendance tabs
 *
 * Gradebook tabs: one per class, named exactly like the class in the app
 * ("Period 2"), holding the gradebook's Student Task Scores CSV
 * (File > Import > Upload > Insert new sheet, then rename the tab).
 * Attendance tab: named "Attendance", with a date column, a class/period
 * column, and either count columns ("Unexcused absences", "Tardies") or a
 * "Status" column where each row is one Unexcused absence or Tardy.
 *
 * All math happens here. Only class-level numbers are written to the Data
 * tab; student names and scores never leave this spreadsheet.
 * ------------------------------------------------------------ */

var SKIP_NAME = 'Skip';
// From the week ending on this Thursday on, an update only changes the current week's quiz and
// homework numbers; every earlier week stays exactly as it was (locked). Attendance is never locked.
var LOCK_FROM = '2026-10-08';

// The app checks this to make sure it's talking to a script that uses Friday-Thursday weeks.
function apiVersion() { return 2; }
var ATTENDANCE_NAME = 'Attendance';

function updateFromGradebooks() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var docs = readDocs_();
    var config = docs['config/main'] && docs['config/main'].value;
    if (!config || !config.classes || !config.classes.length) throw new Error('Set up your classes in the app first.');
    var classes = config.classes;
    var skip = readSkip_();
    var tabs = ss.getSheets();
    var thisWeek = weekOf_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
    var lockBefore = thisWeek >= LOCK_FROM ? thisWeek : null;
    var lockedSkips = 0;
    var lines = [];
    var updates = {}; // weekId -> {names: {...}, entries: {cid: {...}}}
    var touch = function (wk) { return updates[wk] || (updates[wk] = { names: {}, entries: {} }); };

    classes.forEach(function (cls) {
      var tab = findClassTab_(tabs, cls.name);
      if (!tab) { lines.push(cls.name + ': no gradebook tab. Name a tab exactly "' + cls.name + '".'); return; }
      var res;
      try { res = gradebookWeeks_(tab.getDataRange().getDisplayValues(), cls.name, skip); }
      catch (e) { lines.push(cls.name + ': ' + e.message); return; }
      var q = 0, h = 0;
      Object.keys(res.weeks).forEach(function (wk) {
        if (lockBefore && wk < lockBefore) { lockedSkips++; return; }
        var w = res.weeks[wk], u = touch(wk), e = u.entries[cls.id] || (u.entries[cls.id] = {});
        if (w.quiz !== undefined) { e.quiz = w.quiz; q++; if (!u.names.quizName) u.names.quizName = w.quizName; }
        if (w.hw !== undefined) { e.hw = w.hw; h++; if (!u.names.hwName) u.names.hwName = w.hwName; }
      });
      lines.push(cls.name + ': ' + q + ' quiz week' + (q === 1 ? '' : 's') + ', ' + h + ' homework week' + (h === 1 ? '' : 's') + '.');
      res.notes.forEach(function (n) { lines.push('   ' + n); });
    });

    if (lockedSkips) lines.push('Weeks ending before Thursday ' + lockBefore + ' are locked, so only this week\u2019s quiz and homework numbers were updated.');

    var att = ss.getSheetByName(ATTENDANCE_NAME);
    if (att) {
      try {
        var a = attendanceWeeks_(att.getDataRange().getDisplayValues(), classes);
        Object.keys(a.weeks).forEach(function (wk) {
          var u = touch(wk);
          classes.forEach(function (cls) {
            var e = u.entries[cls.id] || (u.entries[cls.id] = {});
            if (a.hasAbs) e.abs = a.weeks[wk].abs[cls.id] || 0;
            if (a.hasTardy) e.tardy = a.weeks[wk].tardy[cls.id] || 0;
          });
        });
        lines.push('Attendance: ' + Object.keys(a.weeks).length + ' week' + (Object.keys(a.weeks).length === 1 ? '' : 's') +
          (a.hasAbs ? ', unexcused absences' : '') + (a.hasTardy ? ', tardies' : '') + '.');
        a.notes.forEach(function (n) { lines.push('   ' + n); });
      } catch (e) { lines.push('Attendance: ' + e.message); }
    } else {
      lines.push('Attendance: no tab named "' + ATTENDANCE_NAME + '", so absences and tardies were left alone.');
    }

    var n = writeWeeks_(docs, updates);
    return JSON.stringify({ weeks: n, lines: lines });
  } finally {
    lock.releaseLock();
  }
}

function skipSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SKIP_NAME);
  if (!sh) {
    sh = ss.insertSheet(SKIP_NAME);
    sh.getRange(1, 1, 1, 3).setValues([['Class', 'Assignment (exact column name)', 'Why (optional)']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readSkip_() {
  var set = {};
  skipSheet_().getDataRange().getDisplayValues().slice(1).forEach(function (r) {
    if (String(r[0]).trim() && String(r[1]).trim()) set[norm_(r[0]) + '|' + norm_(r[1])] = true;
  });
  return set;
}

function norm_(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }

// "Period 2" matches a tab named "Period 2" or "Period 2 gradebook", but not "Period 20".
function findClassTab_(tabs, name) {
  var n = norm_(name);
  for (var i = 0; i < tabs.length; i++) {
    var t = norm_(tabs[i].getName());
    if (t === n || (t.indexOf(n) === 0 && !/[0-9]/.test(t.charAt(n.length)))) return tabs[i];
  }
  return null;
}

// Competition weeks run Friday through Thursday and are named by the Thursday they end on.
// Returns that Thursday (YYYY-MM-DD) for a date written as 2026-09-21 or 9/21/2026.
function weekOf_(s) {
  s = String(s);
  var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return null;
    mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000;
  }
  var t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null; // e.g. 13/45/2026
  t.setUTCDate(t.getUTCDate() + (4 - t.getUTCDay() + 7) % 7);
  return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2);
}

function numOrNull_(s) {
  var t = String(s).trim().replace(/%$/, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

// Rules (set by the teacher):
// - Quiz = "Assessments" columns: percent of max points; blank and "Missing" count as 0,
//   averaged over every student on the roster.
// - Homework = "Homework" columns: a student counts as turned in for the week if any
//   homework due that week has a score above 0. Blank cells don't count either way.
// - A column is skipped only when it hasn't been graded at all (every student blank).
// - Weeks run Friday to Thursday by due date (a Friday quiz counts in the week it starts).
//   Classwork and everything else is ignored.
function gradebookWeeks_(grid, className, skip) {
  var findRow = function (prefix) {
    for (var r = 1; r < Math.min(grid.length, 20); r++) {
      for (var c = 2; c < grid[r].length; c++) if (String(grid[r][c]).indexOf(prefix) === 0) return r;
    }
    return -1;
  };
  var catRow = findRow('Category:'), dueRow = findRow('Due:'), maxRow = findRow('Max Points:');
  if (catRow < 0 || dueRow < 0 || maxRow < 0) throw new Error('this tab doesn’t look like a Student Task Scores export (no Category/Due/Max Points rows).');
  var hdr = grid[0];
  var students = grid.slice(Math.max(catRow, dueRow, maxRow) + 1).filter(function (r) { return String(r[1] || '').trim() !== ''; });
  if (!students.length) throw new Error('no student rows found.');
  var strip = function (v, p) { return String(v).replace(p, '').trim(); };
  var notes = [], cols = [];
  for (var i = 2; i < hdr.length; i++) {
    var cat = strip(grid[catRow][i], 'Category:');
    if (cat !== 'Homework' && cat !== 'Assessments') continue;
    var name = String(hdr[i]).trim();
    if (skip[norm_(className) + '|' + norm_(name)]) { notes.push('Skipped "' + name + '" (on the Skip tab).'); continue; }
    var wk = weekOf_(strip(grid[dueRow][i], 'Due:')), max = numOrNull_(strip(grid[maxRow][i], 'Max Points:'));
    if (!wk || !(max > 0)) { notes.push('Skipped "' + name + '" (no due date or max points).'); continue; }
    var vals = students.map(function (r) { return String(r[i] === undefined ? '' : r[i]).trim(); });
    var blank = vals.filter(function (v) { return v === ''; }).length;
    if (blank === students.length) { notes.push('Skipped "' + name + '": not graded yet (every cell blank).'); continue; }
    cols.push({ name: name, cat: cat, wk: wk, max: max, vals: vals });
  }
  var weeks = {};
  cols.forEach(function (c) { weeks[c.wk] = weeks[c.wk] || {}; });
  Object.keys(weeks).forEach(function (wk) {
    var q = cols.filter(function (c) { return c.wk === wk && c.cat === 'Assessments'; });
    if (q.length) {
      var avgs = q.map(function (c) {
        var pts = c.vals.map(function (v) { var n = numOrNull_(v); return n === null ? 0 : n / c.max * 100; });
        return pts.reduce(function (a, b) { return a + b; }, 0) / pts.length;
      });
      weeks[wk].quiz = Math.round(avgs.reduce(function (a, b) { return a + b; }, 0) / avgs.length * 10) / 10;
      weeks[wk].quizName = q.map(function (c) { return c.name; }).join(' + ');
    }
    var h = cols.filter(function (c) { return c.wk === wk && c.cat === 'Homework'; });
    if (h.length) {
      var counted = 0, turnedIn = 0;
      students.forEach(function (s, si) {
        var cells = h.map(function (c) { return c.vals[si]; }).filter(function (v) { return v !== ''; });
        if (!cells.length) return;
        counted++;
        if (cells.some(function (v) { var n = numOrNull_(v); return n !== null && n > 0; })) turnedIn++;
      });
      if (counted) {
        weeks[wk].hw = Math.round(turnedIn / counted * 1000) / 10;
        weeks[wk].hwName = h.map(function (c) { return c.name; }).join(' + ');
      }
    }
  });
  return { weeks: weeks, notes: notes };
}

function matchClass_(v, classes) {
  var n = norm_(v);
  if (!n) return null;
  for (var i = 0; i < classes.length; i++) if (norm_(classes[i].name) === n) return classes[i];
  var d = n.match(/\d+/);
  if (!d) return null;
  var hits = classes.filter(function (c) { var m = norm_(c.name).match(/\d+/); return m && m[0] === d[0]; });
  return hits.length === 1 ? hits[0] : null;
}

function attendanceWeeks_(grid, classes) {
  if (grid.length < 2) throw new Error('the tab is empty.');
  var hdr = grid[0].map(norm_);
  var col = function (re) { for (var i = 0; i < hdr.length; i++) if (re.test(hdr[i])) return i; return -1; };
  var dateC = col(/date|week/), classC = col(/class|period|section/);
  var absC = col(/absen/), tardyC = col(/tard/), statusC = col(/status|code|type/);
  if (dateC < 0 || classC < 0) throw new Error('needs a "Date" column and a "Class" (or "Period") column in row 1.');
  if (absC < 0 && tardyC < 0 && statusC < 0) throw new Error('needs "Unexcused absences" and/or "Tardies" columns, or a "Status" column.');
  var weeks = {}, notes = [], badDate = 0, unknown = {};
  grid.slice(1).forEach(function (r) {
    if (!r.join('').trim()) return;
    var wk = weekOf_(r[dateC]);
    if (!wk) { badDate++; return; }
    var cls = matchClass_(r[classC], classes);
    if (!cls) { unknown[String(r[classC]).trim() || '(blank)'] = true; return; }
    var w = weeks[wk] || (weeks[wk] = { abs: {}, tardy: {} });
    if (absC >= 0) w.abs[cls.id] = (w.abs[cls.id] || 0) + (numOrNull_(r[absC]) || 0);
    if (tardyC >= 0) w.tardy[cls.id] = (w.tardy[cls.id] || 0) + (numOrNull_(r[tardyC]) || 0);
    if (statusC >= 0) {
      var s = norm_(r[statusC]);
      if (/unex|^u$/.test(s)) w.abs[cls.id] = (w.abs[cls.id] || 0) + 1;
      else if (/tard|^t$/.test(s)) w.tardy[cls.id] = (w.tardy[cls.id] || 0) + 1;
    }
  });
  if (badDate) notes.push(badDate + ' row' + (badDate === 1 ? '' : 's') + ' skipped: date not recognized (use 9/21/2026 or 2026-09-21).');
  var u = Object.keys(unknown);
  if (u.length) notes.push('Rows skipped for unknown class: ' + u.join(', ') + '.');
  return { weeks: weeks, notes: notes, hasAbs: absC >= 0 || statusC >= 0, hasTardy: tardyC >= 0 || statusC >= 0 };
}

function readDocs_() {
  var sh = dataSheet_();
  var docs = {};
  sh.getDataRange().getValues().forEach(function (r, i) {
    if (i === 0 || !r[0] || !r[1]) return;
    docs[String(r[0])] = { row: i + 1, value: JSON.parse(r[1]) };
  });
  return docs;
}

// Merge the new numbers into each week, keeping everything else (behavior taps, house points, names).
function writeWeeks_(docs, updates) {
  var sh = dataSheet_();
  var next = sh.getLastRow() + 1, n = 0;
  Object.keys(updates).sort().forEach(function (wk) {
    var key = 'weeks/' + wk, u = updates[wk];
    var doc = docs[key] ? docs[key].value : { entries: {} };
    doc.entries = doc.entries || {};
    Object.keys(u.entries).forEach(function (cid) {
      var e = Object.assign({}, doc.entries[cid] || {}, u.entries[cid]);
      if (u.entries[cid].quiz !== undefined) { delete e.quizN; delete e.quizSum; }
      doc.entries[cid] = e;
    });
    Object.keys(u.names).forEach(function (k) { if (!doc[k]) doc[k] = u.names[k]; });
    var row = docs[key] ? docs[key].row : next++;
    sh.getRange(row, 1, 1, 3).setNumberFormat('@').setValues([[key, JSON.stringify(doc), new Date().toISOString()]]);
    n++;
  });
  return n;
}

function saveDoc(path, json) {
  if (!/^(config\/main|weeks\/\d{4}-\d{2}-\d{2})$/.test(path)) throw new Error('Unknown data path: ' + path);
  JSON.parse(json); // refuse anything that isn't valid JSON
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = dataSheet_();
    var keys = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    var row = -1;
    for (var i = 1; i < keys.length; i++) {
      if (String(keys[i][0]) === path) { row = i + 1; break; }
    }
    if (row < 0) row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 3).setNumberFormat('@').setValues([[path, json, new Date().toISOString()]]);
  } finally {
    lock.releaseLock();
  }
  return true;
}
