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

// Run once from the editor to grant permissions and create the Data tab.
function setup() {
  dataSheet_();
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
