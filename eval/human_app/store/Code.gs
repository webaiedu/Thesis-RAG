/**
 * AinSutro data store: Apps Script bound to the scoring Sheet "AinSutro human scoring" (eval/HUMAN_GUIDE.md).
 * Runs as the Sheet owner. It holds all data and answers the private API that the AinSutro page
 * (eval/human_app/web) calls with the shared secret (Secret.gs, never committed).
 *
 * - Menu "AinSutro" (Sheet owner only): import CSVs from the Gold Judge folder, translate questions,
 *   progress, release claims, reset ratings.
 * - doPost: JSON API {secret, action, user:{email,name}, data}. Raters are identified by their Google email,
 *   which the AinSutro page reads from Google itself (it runs as the visitor).
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
const CLAIM_HOURS = 3;
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
};
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
    if (!req || req.secret !== API_SECRET) throw new Error('forbidden');
    const d = req.data || {};
    const admin = { import: importFiles, translate: translateQuestions, reset: resetRatings,
                    progress: () => progressFor('', true), ratings: exportRatings };
    if (req.action.indexOf('admin_') === 0) {
      const f = admin[req.action.slice(6)];
      if (!f) throw new Error('unknown action');
      out = { result: f() };
    } else {
      const u = user(req.user);
      if (req.action === 'next') out = { result: getNext(u, d.section) };
      else if (req.action === 'submit') out = { result: submit(u, d.row, d.bundle, d.rating) };
      else if (req.action === 'skip') out = { result: skip(u, d.row, d.bundle, d.section) };
      else if (req.action === 'progress') out = { result: progressFor(u.id, false) };
      else throw new Error('unknown action');
    }
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function user(u) {
  const email = String((u && u.email) || '').trim().toLowerCase();
  if (!/^[^@\s,]+@[^@\s,]+$/.test(email)) throw new Error('Not signed in with a Google account.');
  const name = String((u && u.name) || email.split('@')[0]).replace(/[\n\r\t]/g, ' ').trim().slice(0, 60);
  return { id: email, name: name };
}

function exportRatings() {
  return rowsOf(tab('Ratings'), HEAD.Ratings.length).map(r => {
    const o = {};
    HEAD.Ratings.forEach((h, i) => { o[h] = String(r[i]); });
    return o;
  });
}

function claimLive(r, now) {
  return r[Q.claim_rater] && r[Q.claim_time] &&
    now - new Date(r[Q.claim_time]).getTime() < CLAIM_HOURS * 3600 * 1000;
}

/** < 0 when queue row a should be rated before b: lower question rank first, then model order. */
function better(a, b) {
  return Number(a[Q.rank]) - Number(b[Q.rank]) ||
    MODEL_ORDER.indexOf(String(a[Q.model])) - MODEL_ORDER.indexOf(String(b[Q.model]));
}

/** qid -> 'law' or 'file' (the test set the question comes from). */
function sections() {
  const out = {};
  rowsOf(tab('Questions'), 4).forEach(r => { out[String(r[0])] = String(r[3]) === 'file' ? 'file' : 'law'; });
  return out;
}

/** Give the rater their current bundle in this section (law or file), or claim the next open one. */
function getNext(u, section) {
  section = section === 'file' ? 'file' : 'law';
  const sec = sections();
  const row = withLock(() => {
    const sh = tab('Queue');
    const vals = rowsOf(sh, HEAD.Queue.length);
    if (!vals.length) return 0;
    const now = Date.now();
    let mine = -1, best = -1;
    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      if (sec[String(r[Q.qid])] !== section) continue;
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
      if (r[Q.claim_rater] !== u.id) r[Q.rated] = '';      // my own expired claim keeps what I rated
      r[Q.claim_rater] = u.id;
      r[Q.claim_time] = new Date(now).toISOString();
      writeRow(sh, i + 2, r);
    }
    return i + 2;
  });
  if (row === 0) return { empty: true, msg: 'Nothing has been imported yet.' };
  if (row < 0) {
    return { empty: true, section: section, progress: progressFor(u.id, false),
             msg: 'No ' + (section === 'file' ? 'file' : 'law') + ' answers are left for you right now. Thank you!' };
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
    const second = doneBefore.length > 0 && doneBefore.indexOf(u.id) < 0;
    appendText(tab('Ratings'), [[new Date().toISOString(), u.id, rating.key, bundle, a[1], a[2], a[4], a[5],
      s.correctness, s.faithfulness, s.technicality_fit, s.language_ok, s.refused,
      String(rating.note || '').slice(0, 2000), second ? '1' : '', u.name, RUBRIC]]);
    let finished = false;
    const now = Date.now();
    if (doneBefore.indexOf(u.id) < 0 && (r[Q.claim_rater] === u.id || !claimLive(r, now))) {
      if (r[Q.claim_rater] !== u.id) r[Q.rated] = '';
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
function skip(u, row, bundle, section) {
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
  return getNext(u, section);
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
  const sec = sections();
  const per = {}, bySec = { law: { done: 0, total: 0 }, file: { done: 0, total: 0 } };
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
  });
  ['law', 'file'].forEach(k => { bySec[k].pct = bySec[k].total ? Math.round(1000 * bySec[k].done / bySec[k].total) / 10 : 0; });
  const counts = {}, names = {};
  const seen = new Set();
  rowsOf(tab('Ratings'), HEAD.Ratings.length).forEach(r => {
    const k = r[1] + '|' + r[2];
    names[r[1]] = r[15] || r[1];
    if (seen.has(k)) return;
    seen.add(k);
    counts[r[1]] = (counts[r[1]] || 0) + 1;
  });
  const total = vals.length * 9;
  const out = {
    done: done, total: total, pct: total ? Math.round(1000 * done / total) / 10 : 0, mine: counts[id] || 0,
    models: MODEL_ORDER.filter(m => per[m]).map(m => per[m]),
    sections: bySec,
  };
  if (withRaters) {
    out.raters = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
      .map(k => ({ rater: k, name: names[k], n: counts[k] }));
  }
  return out;
}
