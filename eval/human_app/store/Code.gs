/**
 * AinSutro data store: Apps Script bound to the scoring Sheet "AinSutro human scoring" (eval/HUMAN_GUIDE.md).
 * Runs as the Sheet owner. It holds all data and answers the API that the AinSutro page calls
 * (eval/human_app/site, on Firebase Hosting since 25 Nov).
 *
 * - Menu "AinSutro" (Sheet owner only): import CSVs from the Gold Judge folder, translate questions,
 *   progress, release claims, reset ratings.
 * - doPost, rater actions: {idToken, action, data}. The page signs raters in with Firebase Auth (Google
 *   account, basic profile only, so Google shows no "unverified app" warning). The store checks the ID token
 *   with Google (verifyUser) and takes the email and name from Google, never from the page.
 * - doPost, admin actions: {secret, action: 'admin_*'} for human.py (Secret.gs, never committed).
 * - doGet: the old link; shows "AinSutro has moved" with a button to the new page.
 * - One bundle = one question x one model = its 9 answers (3 effort x 3 technicality). A bundle is claimed by
 *   one rater under a lock, so nobody gets answers that are done or being done; claims expire after CLAIM_HOURS.
 *   Overlap questions (every 20th) need a second, different rater (inter-rater kappa).
 * - Scores follow the 80B judge's rubric j1 exactly (eval/score.py): correctness 1-5; faithfulness 1-5, or
 *   null only when no excerpts were given; technicality_fit 1-5 for low/high, null for auto; language_ok; refused.
 * Everything is free: Google Sheets + Apps Script on an ordinary Google account.
 */

const FOLDER_ID = '1e53LUi8-6m9D0CRVK-4u2iWM_VCuPID5';   // Drive folder "Gold Judge"
const SHEET_ID = '1Xo1tdlE4T5Hd6kKStyhaVYnpHR1v3ir8CWAUX2ONwbI'; // Sheet "AinSutro human scoring"
// API_SECRET and UI_URL are in Secret.gs (not committed).
const CLAIM_HOURS = 3;            // a question nobody has started scoring is released after 3 h idle
const STARTED_CLAIM_HOURS = 168;  // a started question stays with its rater for 7 days, so nobody re-scores its answers
const EXCERPT_CHARS = 6000;                              // eval/config.json judge.excerpt_chars
const MODEL_ORDER = ['gemma', 'qwen3-30b', 'qwen3-next-80b'];
const EFFORTS = ['low', 'mid', 'high'];
const TECHS = ['low', 'auto', 'high'];
const BATCH = 400;                                       // rows per write
const TIME_BUDGET_MS = 270000;                           // stop long jobs before Apps Script's 6-min limit
const RUBRIC = 'j1';

const HEAD = {
  Questions: ['qid', 'rank', 'overlap', 'test', 'lang', 'domain', 'type', 'expected_route', 'file', 'history',
              'question', 'reference', 'file_truth', 'question_tr', 'reference_tr'],
  Chunks: ['id', 'text'],
  Answers: ['key', 'qid', 'model', 'model_label', 'effort', 'technicality', 'route', 'corrected', 'reply',
            'sources', 'file'],
  Queue: ['bundle', 'qid', 'model', 'rank', 'need', 'answer_row', 'question_row', 'claim_rater', 'claim_time',
          'rated', 'done_raters', 'skipped_by'],
  Ratings: ['time', 'rater', 'key', 'bundle', 'qid', 'model', 'effort', 'technicality', 'correctness',
            'faithfulness', 'technicality_fit', 'language_ok', 'refused', 'note', 'second', 'rater_name', 'rubric'],
  Acks: ['time', 'rater', 'rater_name', 'version'],     // the legal-background acknowledgement on the sign-in page
};
// The acknowledgement text raters tick (eval/human_app/site/public/index.html, #ackText). Change the version
// whenever the wording changes; everyone is then asked again.
const ACK_VERSION = 'ack-1';
const NOT_IN_CSV = new Set(['question_tr', 'reference_tr']);   // filled here, not by human.py export
const Q = colIndex(HEAD.Queue);
const QS = colIndex(HEAD.Questions);

function colIndex(h) { const o = {}; h.forEach((k, i) => { o[k] = i; }); return o; }

// ------------------------------------------------------------------ sheet helpers
function book() { return SpreadsheetApp.openById(SHEET_ID); }

function tab(name) {
  let sh = book().getSheetByName(name);
  if (!sh) {
    sh = book().insertSheet(name);
    sh.setFrozenRows(1);
  }
  const head = sh.getRange(1, 1, 1, HEAD[name].length);
  if (head.getValues()[0].join('\t') !== HEAD[name].join('\t')) head.setValues([HEAD[name]]);  // new columns go last
  return sh;
}

function rowsOf(sh, ncols) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, ncols).getValues() : [];
}

function column(sh, col) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, col, n, 1).getValues().map(r => String(r[0])) : [];
}

/** Append rows as plain text (so answers starting with "=", "+" or "-" are never read as formulas). */
function appendText(sh, rows) {
  for (let s = 0; s < rows.length; s += BATCH) {
    const part = rows.slice(s, s + BATCH);
    const r = sh.getRange(sh.getLastRow() + 1, 1, part.length, part[0].length);
    r.setNumberFormat('@');
    r.setValues(part);
  }
}

function writeRow(sh, row, values) {
  const r = sh.getRange(row, 1, 1, values.length);
  r.setNumberFormat('@');
  r.setValues([values]);
}

function list(v) { return String(v || '').split(',').map(s => s.trim()).filter(String); }

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ------------------------------------------------------------------ menu (Sheet owner)
function onOpen() {
  SpreadsheetApp.getUi().createMenu('AinSutro')
    .addItem('Import files from Gold Judge folder', 'importAll')
    .addItem('Translate questions (Bangla/English)', 'translateAll')
    .addItem('Show progress', 'showProgress')
    .addItem('Release all claims (nobody is rating)', 'releaseAll')
    .addItem('Allow the sign-in check (once, owner)', 'authorizeMenu')
    .addSeparator()
    .addItem('Delete ALL ratings and claims (start fresh)', 'resetAskFirst')
    .addToUi();
}

function say(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
  return msg;
}

/** CSV rows of a file in the folder (plain CSV, or a CSV that Drive converted into a Google Sheet). */
function readCsvFile(file) {
  if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
    return SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues().map(r => r.map(String));
  }
  return Utilities.parseCsv(file.getBlob().getDataAsString('UTF-8'));
}

function folderFiles() {
  const out = {};
  const it = DriveApp.getFolderById(FOLDER_ID).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName().replace(/\.csv$/i, '');
    if (/^(questions|chunks|answers-[a-z0-9-]+)$/.test(name) && !f.isTrashed()) {
      if (!out[name] || f.getLastUpdated() > out[name].getLastUpdated()) out[name] = f;   // newest copy wins
    }
  }
  return out;
}

/** Append the rows of `data` (header first) whose first column is not in the sheet yet. */
function importInto(name, data, t0) {
  const sh = tab(name);
  const head = data[0];
  const want = HEAD[name];
  const idx = want.map(h => head.indexOf(h));
  const missing = want.filter((h, i) => idx[i] < 0 && !NOT_IN_CSV.has(h));
  if (missing.length) throw new Error(name + ': CSV is missing columns ' + missing.join(', '));
  const have = new Set(column(sh, 1));
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = idx.map(j => (j < 0 ? '' : data[i][j]));
    if (r[0] && !have.has(String(r[0]))) { rows.push(r); have.add(String(r[0])); }
  }
  let added = 0;
  for (let s = 0; s < rows.length; s += BATCH) {
    if (Date.now() - t0 > TIME_BUDGET_MS) return { added: added, left: rows.length - added };
    appendText(sh, rows.slice(s, s + BATCH));
    added += Math.min(BATCH, rows.length - s);
  }
  return { added: added, left: 0 };
}

function importAll() { return say(importFiles()); }

// Read-only audit (25 Nov): fingerprints of what raters see, compared on PC A with the run files the judge used.
function md5hex(v) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(v), Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function auditModel(model) {
  const qs = {}, text = {}, out = {}, qh = {};
  rowsOf(tab('Questions'), HEAD.Questions.length).forEach(r => { qs[String(r[0])] = objOf(HEAD.Questions, r); });
  rowsOf(tab('Chunks'), 2).forEach(r => { text[String(r[0])] = String(r[1]); });
  rowsOf(tab('Answers'), HEAD.Answers.length).forEach(r => {
    const a = objOf(HEAD.Answers, r);
    if (model && String(a.model) !== String(model)) return;
    const ex = excerpts(a, qs[String(a.qid)] || {}, text);
    out[String(a.key)] = [md5hex(a.reply), md5hex(ex.map(e => e.text).join('\u241e')), ex.length, String(a.qid)];
  });
  Object.keys(qs).forEach(k => {
    const q = qs[k];
    qh[k] = md5hex([q.question, q.reference, q.file_truth, q.lang, q.test, q.file, q.expected_route, q.history].join('\u241e'));
  });
  // every queue entry must point at its own question and at exactly its own 9 answers (3 effort x 3 technicality)
  const ans = tab('Answers').getRange(2, 1, Math.max(1, tab('Answers').getLastRow() - 1), 6).getValues();
  const qrows = rowsOf(tab('Questions'), 1).map(r => String(r[0]));
  const queue = { rows: 0, bad: [], need2: {} };
  rowsOf(tab('Queue'), HEAD.Queue.length).forEach(r => {
    if (model && String(r[Q.model]) !== String(model)) return;
    queue.rows++;
    const ar = Number(r[Q.answer_row]) - 2, nine = ans.slice(ar, ar + 9);
    const combos = new Set(nine.map(x => x[4] + '/' + x[5]));
    const ok = nine.length === 9 && nine.every(x => String(x[1]) === String(r[Q.qid]) && String(x[2]) === String(r[Q.model])) &&
      combos.size === 9 && qrows[Number(r[Q.question_row]) - 2] === String(r[Q.qid]) && String(r[Q.bundle]) === r[Q.qid] + '|' + r[Q.model];
    if (!ok) queue.bad.push(String(r[Q.bundle]));
    if (Number(r[Q.need]) === 2) queue.need2[String(r[Q.qid])] = 1;
  });
  queue.need2 = Object.keys(queue.need2).sort();
  return { answers: out, questions: qh, queue: queue };
}

/** Import CSV rows sent by human.py push (header first). Only Questions, Chunks and Answers; existing ids are skipped. */
function importRows(name, rows) {
  const tabName = { questions: 'Questions', chunks: 'Chunks', answers: 'Answers' }[String(name)];
  if (!tabName || !Array.isArray(rows) || rows.length < 1) throw new Error('import_rows: bad name or rows');
  return withLock(() => importInto(tabName, rows.map(r => r.map(v => (v == null ? '' : String(v)))), Date.now()));
}

function importFiles() {
  const t0 = Date.now();
  Object.keys(HEAD).forEach(tab);
  const files = folderFiles();
  if (!files.questions || !files.chunks) return 'questions.csv and chunks.csv must be in the Gold Judge folder.';
  const order = ['questions', 'chunks'].concat(Object.keys(files).filter(n => n.indexOf('answers-') === 0).sort());
  const msg = [];
  for (const n of order) {
    const r = importInto(n === 'questions' ? 'Questions' : n === 'chunks' ? 'Chunks' : 'Answers',
                         readCsvFile(files[n]), t0);
    msg.push(n + ': +' + r.added + (r.left ? ' (' + r.left + ' left)' : ''));
    if (r.left) return msg.join('\n') + '\n\nStopped before the 6-minute limit. Run Import again to continue.';
  }
  msg.push('new bundles in the queue: ' + buildQueue());
  SpreadsheetApp.flush();
  return msg.join('\n');
}

/** One queue row per (question, model) that has all 9 answers and isn't queued yet. */
function buildQueue() {
  return withLock(() => {
    const qinfo = {};
    rowsOf(tab('Questions'), 3).forEach((r, i) => {
      qinfo[String(r[0])] = { rank: Number(r[1]), overlap: String(r[2]) === '1', row: i + 2 };
    });
    const groups = {};
    rowsOf(tab('Answers'), 3).forEach((r, i) => {
      const b = r[1] + '|' + r[2];
      if (!groups[b]) groups[b] = { qid: String(r[1]), model: String(r[2]), first: i + 2, n: 0, contiguous: true };
      const g = groups[b];
      if (g.first + g.n !== i + 2) g.contiguous = false;
      g.n++;
    });
    const queued = new Set(column(tab('Queue'), 1));
    const rows = [];
    Object.keys(groups).forEach(b => {
      const g = groups[b];
      const q = qinfo[g.qid];
      if (queued.has(b) || !q || g.n !== EFFORTS.length * TECHS.length || !g.contiguous) return;
      rows.push([b, g.qid, g.model, q.rank, q.overlap ? 2 : 1, g.first, q.row, '', '', '', '', '']);
    });
    rows.sort((a, b) => a[3] - b[3] || MODEL_ORDER.indexOf(a[2]) - MODEL_ORDER.indexOf(b[2]));
    if (rows.length) appendText(tab('Queue'), rows);
    return rows.length;
  });
}

function releaseAll() {
  const sh = tab('Queue');
  const vals = rowsOf(sh, HEAD.Queue.length);
  vals.forEach(r => { r[Q.claim_rater] = ''; r[Q.claim_time] = ''; r[Q.rated] = ''; });
  if (vals.length) sh.getRange(2, 1, vals.length, HEAD.Queue.length).setValues(vals);
  return say('Released ' + vals.length + ' bundles.');
}

function resetAskFirst() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('Delete ALL ratings and claims?', 'Every rating in the Ratings tab is deleted. This cannot be undone.',
                     ui.ButtonSet.YES_NO);
  if (r === ui.Button.YES) say(resetRatings());
}

function resetRatings() {
  return withLock(() => {
    const rs = tab('Ratings');
    const n = rs.getLastRow() - 1;
    if (n > 0) rs.getRange(2, 1, n, rs.getLastColumn()).clearContent();
    const qs = tab('Queue');
    const vals = rowsOf(qs, HEAD.Queue.length);
    vals.forEach(r => { r[Q.claim_rater] = ''; r[Q.claim_time] = ''; r[Q.rated] = ''; r[Q.done_raters] = ''; r[Q.skipped_by] = ''; });
    if (vals.length) qs.getRange(2, 1, vals.length, HEAD.Queue.length).setValues(vals);
    return 'Deleted ' + Math.max(0, n) + ' ratings; cleared claims on ' + vals.length + ' bundles.';
  });
}

function showProgress() {
  const p = progressFor('', true);
  return say('Answers rated: ' + p.done + ' of ' + p.total + ' (' + p.pct + '%)\n' +
    'Law: ' + p.sections.law.done + ' / ' + p.sections.law.total + ', File: ' + p.sections.file.done + ' / ' + p.sections.file.total + '\n' +
    p.models.map(m => m.model + ': ' + m.done + ' / ' + m.total).join('\n') + '\n\n' +
    p.raters.map(r => r.name + ' <' + r.rater + '>: ' + r.n).join('\n'));
}

// ------------------------------------------------------------------ translation (free, LanguageApp)
function translatePair(lang, question, reference) {
  const src = lang === 'bn' ? 'bn' : 'en';
  const dst = src === 'bn' ? 'en' : 'bn';
  return [LanguageApp.translate(String(question || ''), src, dst),
          reference && reference !== '(none)' ? LanguageApp.translate(String(reference), src, dst) : ''];
}

/** Translation of one Questions row, made once and stored in the sheet. */
function translationFor(row, q) {
  if (q.question_tr) return [q.question_tr, q.reference_tr];
  try {
    const t = translatePair(q.lang, q.question, q.reference);
    tab('Questions').getRange(row, QS.question_tr + 1, 1, 2).setNumberFormat('@').setValues([t]);
    return t;
  } catch (e) {
    return ['', ''];                                    // quota or service error: the page just hides it
  }
}

function translateAll() { return say(translateQuestions()); }

function translateQuestions() {
  const t0 = Date.now();
  const sh = tab('Questions');
  const vals = rowsOf(sh, HEAD.Questions.length);
  let done = 0, left = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i][QS.question_tr]) continue;
    if (Date.now() - t0 > TIME_BUDGET_MS) { left++; continue; }
    try {
      const t = translatePair(vals[i][QS.lang], vals[i][QS.question], vals[i][QS.reference]);
      sh.getRange(i + 2, QS.question_tr + 1, 1, 2).setNumberFormat('@').setValues([t]);
      done++;
    } catch (e) {
      return 'Translated ' + done + ' questions, then the translation service refused (' + e.message +
             '). Try again later (daily quota).';
    }
  }
  return 'Translated ' + done + ' questions.' + (left ? ' ' + left + ' left: run it again.' : ' All done.');
}

// ------------------------------------------------------------------ old link: "moved" page
function doGet() {
  const html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:16px;text-align:center">' +
    '<h2 style="margin:0 0 8px">AinSutro has moved</h2>' +
    '<p>The answer-scoring page now signs you in with your Google account.</p>' +
    '<p><a href="' + UI_URL + '" target="_top" style="display:inline-block;padding:10px 18px;background:#2f5bd3;' +
    'color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open AinSutro</a></p></div>';
  return HtmlService.createHtmlOutput(html).setTitle('AinSutro has moved')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ------------------------------------------------------------------ API (called by the AinSutro page)
function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (!req || typeof req.action !== 'string') throw new Error('bad request');
    const d = req.data || {};
    const admin = { import: importFiles, translate: translateQuestions, reset: resetRatings,
                    progress: () => progressFor('', true), ratings: exportRatings, acks: exportAcks,
                    // human.py push: the same import as the Drive folder, sent directly (rows incl. the header row)
                    import_rows: () => importRows(d.name, d.rows), build_queue: () => ({ added: buildQueue() }),
                    audit: () => auditModel(d.model) };
    if (req.action.indexOf('admin_') === 0) {
      if (req.secret !== API_SECRET) throw new Error('forbidden');
      const f = admin[req.action.slice(6)];
      if (!f) throw new Error('unknown action');
      out = { result: f() };
    } else {
      const u = verifyUser(req.idToken);
      if (req.action === 'me') out = { result: { email: u.id, name: u.name, acked: hasAck(u) } };
      else if (req.action === 'ack') out = { result: addAck(u, d.version) };
      else if (!hasAck(u)) throw new Error('ACK_REQUIRED: Please confirm the acknowledgement on the sign-in page first.');
      else if (req.action === 'next') out = { result: getNext(u, d.section, d.filter) };
      else if (req.action === 'mine') out = { result: myRatings(u) };
      else if (req.action === 'open') out = { result: openBundle(u, d.bundle) };
      else if (req.action === 'submit') out = { result: submit(u, d.row, d.bundle, d.rating) };
      else if (req.action === 'skip') out = { result: skip(u, d.row, d.bundle, d.section, d.filter) };
      else if (req.action === 'progress') out = { result: progressFor(u.id, false) };
      else throw new Error('unknown action');
    }
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * The signed-in rater, checked with Google: Firebase's accounts:lookup accepts only a valid, unexpired ID token
 * issued for this Firebase project (FIREBASE_API_KEY in Secret.gs). Cached for 10 minutes per token.
 */
function verifyUser(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 100) throw new Error('Please sign in with Google.');
  const cache = CacheService.getScriptCache();
  const ck = 'u:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ idToken: idToken }),
  });
  if (res.getResponseCode() !== 200) throw new Error('Your sign-in has expired. Please reload the page.');
  const g = (JSON.parse(res.getContentText()).users || [])[0] || {};
  const email = String(g.email || '').trim().toLowerCase();
  if (!g.emailVerified || !/^[^@\s,]+@[^@\s,]+$/.test(email)) throw new Error('Please sign in with a Google account.');
  const name = String(g.displayName || email.split('@')[0]).replace(/[\n\r\t]/g, ' ').trim().slice(0, 60);
  const u = { id: email, name: name };
  cache.put(ck, JSON.stringify(u), 600);
  return u;
}

function authorizeMenu() { authorize(); say('Done. The store can now check AinSutro sign-ins.'); }

/** Has this rater ticked the current acknowledgement? (cached 6 h once true) */
function hasAck(u) {
  const cache = CacheService.getScriptCache(), ck = 'ack:' + ACK_VERSION + ':' + u.id;
  if (cache.get(ck)) return true;
  const ok = rowsOf(tab('Acks'), HEAD.Acks.length).some(r => String(r[1]) === u.id && String(r[3]) === ACK_VERSION);
  if (ok) cache.put(ck, '1', 21600);
  return ok;
}

function addAck(u, version) {
  if (version !== ACK_VERSION) throw new Error('The acknowledgement has changed. Please reload the page.');
  if (!hasAck(u)) {
    withLock(() => appendText(tab('Acks'), [[new Date().toISOString(), u.id, u.name, ACK_VERSION]]));
    CacheService.getScriptCache().put('ack:' + ACK_VERSION + ':' + u.id, '1', 21600);
  }
  return { acked: true };
}

function exportAcks() {
  return rowsOf(tab('Acks'), HEAD.Acks.length).map(r => ({ time: String(r[0]), rater: String(r[1]), version: String(r[3]) }));
}

/** Run once (Sheet menu or the editor, as the owner) so the store may call Google's sign-in check. */
function authorize() {
  UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
    { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: '{}' });
  return 'OK';
}

function exportRatings() {
  return rowsOf(tab('Ratings'), HEAD.Ratings.length).map(r => {
    const o = {};
    HEAD.Ratings.forEach((h, i) => { o[h] = String(r[i]); });
    return o;
  });
}

function claimLive(r, now) {
  const hours = list(r[Q.rated]).length ? STARTED_CLAIM_HOURS : CLAIM_HOURS;
  return r[Q.claim_rater] && r[Q.claim_time] &&
    now - new Date(r[Q.claim_time]).getTime() < hours * 3600 * 1000;
}

/**
 * Answers of this bundle scored by someone who left it unfinished (not one of its finished raters, not me).
 * Their score stays and nobody scores those answers again, so outside the planned overlap every answer has
 * exactly one rater. {key: 1}
 */
function abandonedKeys(bundle, done, u) {
  const out = {};
  rowsOf(tab('Ratings'), HEAD.Ratings.length).forEach(r => {
    const who = String(r[1]);
    if (String(r[3]) === String(bundle) && who !== u.id && done.indexOf(who) < 0) out[String(r[2])] = 1;
  });
  return out;
}

/** When a rater takes over a question: the answers already scored by unfinished raters (or by them) count as done. */
function takeoverRated(r, u) {
  const done = list(r[Q.done_raters]);
  const keys = tab('Answers').getRange(Number(r[Q.answer_row]), 1, 9, 1).getValues().map(x => String(x[0]));
  const scored = abandonedKeys(r[Q.bundle], done, u), mine = myKeys(u, r[Q.bundle]);
  return keys.map((k, i) => (scored[k] || mine[k] ? String(i) : '')).filter(String).join(',');
}

/** Keys of this bundle the rater has scored before (any time). */
function myKeys(u, bundle) {
  const out = {};
  rowsOf(tab('Ratings'), HEAD.Ratings.length).forEach(r => {
    if (String(r[1]) === u.id && String(r[3]) === String(bundle)) out[String(r[2])] = 1;
  });
  return out;
}

/** < 0 when queue row a should be rated before b: lower question rank first, then model order. */
function better(a, b) {
  return Number(a[Q.rank]) - Number(b[Q.rank]) ||
    MODEL_ORDER.indexOf(String(a[Q.model])) - MODEL_ORDER.indexOf(String(b[Q.model]));
}

/** qid -> 'law' or 'file' (the test set the question comes from). */
function sections() {
  const out = {}, qi = qinfo();
  Object.keys(qi).forEach(k => { out[k] = qi[k].sec; });
  return out;
}

// Rater filters (25 Nov). They only choose WHICH questions a rater gets; every question, answer and excerpt is
// exactly the one the 80B judge and Claude score. Law: 'en' / 'bn' = normal law questions in that language,
// 'other' = the special questions (typos, informal or Banglish wording, follow-ups, general, out of scope).
// File: the type of the attached file.
const SPECIAL_TYPES = ['typo', 'colloquial', 'follow_up', 'general', 'out_of_scope'];
const LAW_GROUPS = ['en', 'bn', 'other'];
const FILE_TYPES = ['pdf', 'scan', 'photo', 'word'];

function fileType(f) {
  f = String(f || '').toLowerCase();
  if (/\.(jpe?g|png|webp|heic|heif)$/.test(f)) return 'photo';
  if (/-scan\.pdf$/.test(f)) return 'scan';
  if (/\.pdf$/.test(f)) return 'pdf';
  if (/\.(docx?|odt)$/.test(f)) return 'word';
  return 'other';
}

/** qid -> {sec, group (law: en/bn/other; file: pdf/scan/photo/word), question} */
function qinfo() {
  const out = {};
  rowsOf(tab('Questions'), 11).forEach(r => {
    const sec = String(r[3]) === 'file' ? 'file' : 'law';
    const group = sec === 'file' ? fileType(r[8])
      : SPECIAL_TYPES.indexOf(String(r[6])) >= 0 ? 'other' : (String(r[4]) === 'bn' ? 'bn' : 'en');
    out[String(r[0])] = { sec: sec, group: group, question: String(r[10] || '') };
  });
  return out;
}

/** The rater's choice: law defaults to English, files to all types. */
function wanted(section, filter) {
  filter = filter || {};
  if (section === 'file') return FILE_TYPES.indexOf(filter.ftype) >= 0 ? filter.ftype : 'all';
  return LAW_GROUPS.indexOf(filter.lang) >= 0 ? filter.lang : 'en';
}

function matches(info, section, want) {
  return !!info && info.sec === section && (want === 'all' || info.group === want);
}

/** Give the rater their current bundle in this section (law or file), or claim the next open one. */
function getNext(u, section, filter) {
  section = section === 'file' ? 'file' : 'law';
  const qi = qinfo(), want = wanted(section, filter);
  const wantModel = filter && MODEL_ORDER.indexOf(filter.model) >= 0 ? filter.model : 'all';   // 'all' = any model
  const row = withLock(() => {
    const sh = tab('Queue');
    const vals = rowsOf(sh, HEAD.Queue.length);
    if (!vals.length) return 0;
    const now = Date.now();
    let mine = -1, best = -1;
    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      if (!matches(qi[String(r[Q.qid])], section, want) || (wantModel !== 'all' && String(r[Q.model]) !== wantModel)) {
        // a question I claimed but have not started, outside my new choice: give it back to the team
        if (r[Q.claim_rater] === u.id && claimLive(r, now) && !list(r[Q.rated]).length) {
          r[Q.claim_rater] = ''; r[Q.claim_time] = '';
          writeRow(sh, i + 2, r);
        }
        continue;
      }
      const done = list(r[Q.done_raters]);
      if (done.length >= Number(r[Q.need]) || done.indexOf(u.id) >= 0) continue;
      const live = claimLive(r, now);
      if (live && r[Q.claim_rater] === u.id) { mine = i; break; }
      if (live || list(r[Q.skipped_by]).indexOf(u.id) >= 0) continue;
      if (best < 0 || better(r, vals[best]) < 0) best = i;
    }
    const i = mine >= 0 ? mine : best;
    if (i < 0) return -1;
    if (mine < 0) {
      const r = vals[i];
      if (r[Q.claim_rater] !== u.id) r[Q.rated] = takeoverRated(r, u);   // answers already scored stay done
      r[Q.claim_rater] = u.id;
      r[Q.claim_time] = new Date(now).toISOString();
      writeRow(sh, i + 2, r);
    }
    return i + 2;
  });
  if (row === 0) return { empty: true, msg: 'Nothing has been imported yet.' };
  if (row < 0) {
    return { empty: true, section: section, progress: progressFor(u.id, false),
             msg: 'No ' + (section === 'file' ? 'file' : 'law') + ' answers are left for you in this group right now. ' +
                  'Choose another ' + (section === 'file' ? 'file type' : 'language') + ' above, or check back later.' };
  }
  const b = loadBundle(row, u);
  b.section = section;
  return b;
}

function objOf(head, r) { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; }

function chunkRows() {
  const rowOf = {};
  column(tab('Chunks'), 1).forEach((id, i) => { rowOf[id] = i + 2; });
  return rowOf;
}

/** Everything the page needs for one bundle: question (+ translation), 9 answers with excerpts, my ratings. */
function loadBundle(row, u) {
  const qr = tab('Queue').getRange(row, 1, 1, HEAD.Queue.length).getValues()[0];
  const qrow = Number(qr[Q.question_row]);
  const q = objOf(HEAD.Questions, tab('Questions').getRange(qrow, 1, 1, HEAD.Questions.length).getValues()[0]);
  const tr = translationFor(qrow, q);
  const ans = tab('Answers').getRange(Number(qr[Q.answer_row]), 1, 9, HEAD.Answers.length).getValues()
    .map(r => objOf(HEAD.Answers, r));
  const rowOf = chunkRows();
  const text = {};
  const csh = tab('Chunks');
  ans.forEach(a => JSON.parse(a.sources || '[]').forEach(s => {
    if (rowOf[s.id] && !(s.id in text)) text[s.id] = String(csh.getRange(rowOf[s.id], 2).getValue());
  }));
  const mine = {};
  rowsOf(tab('Ratings'), HEAD.Ratings.length).forEach(r => {
    const o = objOf(HEAD.Ratings, r);
    if (o.bundle === qr[Q.bundle] && o.rater === u.id) mine[o.key] = o;   // later rows win
  });
  const locked = abandonedKeys(qr[Q.bundle], list(qr[Q.done_raters]), u);
  return {
    row: row, bundle: qr[Q.bundle],
    question: {
      qid: q.qid, lang: q.lang, domain: q.domain, type: q.type, expected_route: q.expected_route, file: q.file,
      history: q.history, question: q.question, reference: q.reference, file_truth: q.file_truth,
      question_tr: tr[0], reference_tr: tr[1], tr_lang: q.lang === 'bn' ? 'en' : 'bn',
    },
    answers: ans.map(a => {
      const ex = excerpts(a, q, text);
      return {
        key: a.key, model_label: a.model_label, effort: a.effort, technicality: a.technicality,
        route: a.route, reply: a.reply, excerpts: ex, has_excerpts: ex.length > 0, rating: mine[a.key] || null,
        locked: !mine[a.key] && !!locked[a.key],     // scored by a rater who left it unfinished: not scored again
      };
    }).sort((x, y) => EFFORTS.indexOf(x.effort) - EFFORTS.indexOf(y.effort) ||
                      TECHS.indexOf(x.technicality) - TECHS.indexOf(y.technicality)),
    progress: progressFor(u.id, false),
  };
}

/** Same rule as score.py excerpts_for(): file content first, then sources in order, up to EXCERPT_CHARS. */
function excerpts(a, q, text) {
  const out = [];
  let used = 0;
  if (a.file && q.file_truth) {
    out.push({ n: 'file', label: 'Attached file (its true content)', text: String(q.file_truth) });
    used += ('[attached file, its true content] ' + String(q.file_truth)).length;
  }
  const srcs = JSON.parse(a.sources || '[]');
  for (let i = 0; i < srcs.length; i++) {
    const t = (text[srcs[i].id] || '').slice(0, Math.max(0, EXCERPT_CHARS - used));
    if (!t) break;
    out.push({ n: i + 1, label: srcs[i].label, text: t });
    used += t.length;
  }
  return out;
}

/** Scores exactly as the 80B judge gives them (rubric j1), or an error the page shows to the rater. */
function checkRating(rating, a, q, rowOf) {
  const score = (v, what) => {
    const n = Number(v);
    if (!(n >= 1 && n <= 5 && Math.round(n) === n)) throw new Error('Choose a ' + what + ' score (1-5).');
    return n;
  };
  const srcs = JSON.parse(a[9] || '[]');
  const hasEx = (a[10] && q[QS.file_truth]) || (srcs.length > 0 && !!rowOf[srcs[0].id]);
  return {
    correctness: score(rating.correctness, 'correctness'),
    faithfulness: hasEx ? score(rating.faithfulness, 'faithfulness') : '',        // judge: null without excerpts
    technicality_fit: a[5] === 'auto' ? '' : score(rating.technicality_fit, 'technicality fit'),  // null for auto
    language_ok: rating.language_ok ? 'true' : 'false',
    refused: rating.refused ? 'true' : 'false',
  };
}

/** Save one rating. Returns whether the bundle is now finished for this rater. */
function submit(u, row, bundle, rating) {
  return withLock(() => {
    const sh = tab('Queue');
    row = findRow(sh, row, bundle);
    const r = sh.getRange(row, 1, 1, HEAD.Queue.length).getValues()[0];
    const ans = tab('Answers').getRange(Number(r[Q.answer_row]), 1, 9, HEAD.Answers.length).getValues();
    const idx = ans.findIndex(x => x[0] === rating.key);
    if (idx < 0) throw new Error('This answer is not part of the question.');
    const a = ans[idx];
    const q = tab('Questions').getRange(Number(r[Q.question_row]), 1, 1, HEAD.Questions.length).getValues()[0];
    const s = checkRating(rating, a, q, chunkRows());
    const doneBefore = list(r[Q.done_raters]);
    // Uniqueness: a rater may score a NEW answer here only if the question is theirs (their claim, or free and not
    // finished by others). Changing their own earlier score is always allowed (My ratings).
    const nowT = Date.now();
    const mineNow = doneBefore.indexOf(u.id) >= 0 || r[Q.claim_rater] === u.id;
    const takenByOther = r[Q.claim_rater] && r[Q.claim_rater] !== u.id && claimLive(r, nowT);
    const finishedByOthers = doneBefore.length >= Number(r[Q.need]);
    if (!mineNow && (takenByOther || finishedByOthers) && !myKeys(u, bundle)[rating.key]) {
      throw new Error('TAKEN: This question is now with another rater. Please continue with a new question.');
    }
    if (abandonedKeys(bundle, doneBefore, u)[rating.key]) {
      throw new Error('Another rater already scored this answer. Please go on to the next answer.');
    }
    const second = doneBefore.length > 0 && doneBefore[0] !== u.id;   // re-scoring keeps the first/second role
    appendText(tab('Ratings'), [[new Date().toISOString(), u.id, rating.key, bundle, a[1], a[2], a[4], a[5],
      s.correctness, s.faithfulness, s.technicality_fit, s.language_ok, s.refused,
      String(rating.note || '').slice(0, 2000), second ? '1' : '', u.name, RUBRIC]]);
    let finished = false;
    const now = Date.now();
    if (doneBefore.indexOf(u.id) < 0 && (r[Q.claim_rater] === u.id || !claimLive(r, now))) {
      if (r[Q.claim_rater] !== u.id) r[Q.rated] = takeoverRated(r, u);
      r[Q.claim_rater] = u.id;
      r[Q.claim_time] = new Date(now).toISOString();
      const rated = new Set(list(r[Q.rated]));
      rated.add(String(idx));
      r[Q.rated] = Array.from(rated).join(',');
      if (rated.size >= 9) {
        doneBefore.push(u.id);
        r[Q.done_raters] = doneBefore.join(',');
        r[Q.claim_rater] = '';
        r[Q.claim_time] = '';
        r[Q.rated] = '';
        finished = true;
      }
      writeRow(sh, row, r);
    }
    return { finished: finished, saved: s };
  });
}

/** Give the bundle back (someone else will rate it) and never offer it to this rater again. */
function skip(u, row, bundle, section, filter) {
  if (Object.keys(myKeys(u, bundle)).length) {
    throw new Error('You have already scored answers of this question, so it cannot be given to someone else. Please finish it.');
  }
  withLock(() => {
    const sh = tab('Queue');
    row = findRow(sh, row, bundle);
    const r = sh.getRange(row, 1, 1, HEAD.Queue.length).getValues()[0];
    const s = list(r[Q.skipped_by]);
    if (s.indexOf(u.id) < 0) s.push(u.id);
    r[Q.skipped_by] = s.join(',');
    if (r[Q.claim_rater] === u.id) { r[Q.claim_rater] = ''; r[Q.claim_time] = ''; r[Q.rated] = ''; }
    writeRow(sh, row, r);
  });
  return getNext(u, section, filter);
}

const MODEL_LABEL = { 'gemma': 'Gemma 4 E4B', 'qwen3-30b': 'Qwen3 30B', 'qwen3-next-80b': 'Qwen3-Next 80B' };

/** The questions this rater has scored (newest first), for "My ratings". */
function myRatings(u) {
  const by = {};
  rowsOf(tab('Ratings'), HEAD.Ratings.length).forEach(r => {
    if (String(r[1]) !== u.id) return;
    const b = String(r[3]);
    const o = by[b] || (by[b] = { bundle: b, qid: String(r[4]), model: String(r[5]), keys: {}, last: '' });
    o.keys[String(r[2])] = 1;
    const t = r[0] instanceof Date ? r[0].toISOString() : String(r[0]);
    if (t > o.last) o.last = t;
  });
  const qi = qinfo();
  return Object.keys(by).map(b => {
    const o = by[b], q = qi[o.qid] || {};
    return { bundle: b, qid: o.qid, model: MODEL_LABEL[o.model] || o.model, rated: Object.keys(o.keys).length,
             last: o.last, section: q.sec || 'law', group: q.group || '', question: String(q.question || '').slice(0, 200) };
  }).sort((a, b) => (a.last < b.last ? 1 : -1));
}

/** One of my scored questions again, with my scores filled in, so I can change them. */
function openBundle(u, bundle) {
  const mineHere = rowsOf(tab('Ratings'), HEAD.Ratings.length).some(r => String(r[1]) === u.id && String(r[3]) === String(bundle));
  if (!mineHere) throw new Error('You can only reopen questions you have scored.');
  const b = loadBundle(findRow(tab('Queue'), 0, String(bundle)), u);
  const q = qinfo()[String(b.question.qid)] || {};
  b.section = q.sec || 'law';
  b.review = true;
  return b;
}

function findRow(sh, row, bundle) {
  row = Number(row);
  if (row >= 2 && String(sh.getRange(row, 1).getValue()) === bundle) return row;
  const i = column(sh, 1).indexOf(bundle);
  if (i < 0) throw new Error('Unknown question ' + bundle);
  return i + 2;
}

/** Team progress (each answer counted once) and this rater's count. Rater names only for the owner. */
function progressFor(id, withRaters) {
  const vals = rowsOf(tab('Queue'), HEAD.Queue.length);
  const qi = qinfo(), sec = {};
  Object.keys(qi).forEach(k => { sec[k] = qi[k].sec; });
  const per = {}, bySec = { law: { done: 0, total: 0 }, file: { done: 0, total: 0 } }, groups = {};
  let done = 0;
  vals.forEach(r => {
    const m = String(r[Q.model]);
    per[m] = per[m] || { model: m, done: 0, total: 0 };
    per[m].total += 9;
    const d = list(r[Q.done_raters]).length > 0 ? 9 : list(r[Q.rated]).length;
    per[m].done += d;
    done += d;
    const x = bySec[sec[String(r[Q.qid])] === 'file' ? 'file' : 'law'];
    x.total += 9;
    x.done += d;
    const info = qi[String(r[Q.qid])];
    if (info) {
      // per group, per model, and per model+section+group (the page shows the rater's current choice)
      [info.sec + ':' + info.group, m + '|', m + '|' + info.sec, m + '|' + info.sec + ':' + info.group].forEach(k => {
        const g = groups[k] || (groups[k] = { done: 0, total: 0 });
        g.total += 9; g.done += d;
      });
    }
  });
  ['law', 'file'].forEach(k => { bySec[k].pct = bySec[k].total ? Math.round(1000 * bySec[k].done / bySec[k].total) / 10 : 0; });
  const counts = {}, names = {}, mineBy = {};
  const seen = new Set();
  rowsOf(tab('Ratings'), HEAD.Ratings.length).forEach(r => {
    const k = r[1] + '|' + r[2];
    names[r[1]] = r[15] || r[1];
    if (seen.has(k)) return;
    seen.add(k);
    counts[r[1]] = (counts[r[1]] || 0) + 1;
    if (r[1] === id) mineBy[String(r[5])] = (mineBy[String(r[5])] || 0) + 1;
  });
  const total = vals.length * 9;
  const out = {
    done: done, total: total, pct: total ? Math.round(1000 * done / total) / 10 : 0, mine: counts[id] || 0,
    models: MODEL_ORDER.filter(m => per[m]).map(m => per[m]),
    sections: bySec,
    groups: groups,
    mineByModel: mineBy,
    modelsIn: Object.keys(per),        // models whose answers are in the scoring page
  };
  if (withRaters) {
    out.raters = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
      .map(k => ({ rater: k, name: names[k], n: counts[k] }));
  }
  return out;
}
