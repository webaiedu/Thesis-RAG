/* AinSutro Scoring Page (eval/HUMAN_GUIDE.md). Sign-in: Firebase Auth with Google (basic profile only, remembered by the
 * browser). Data: the Apps Script store (eval/human_app/store), which checks the Firebase ID token itself.
 * Scoring rules match the 80B judge (rubric j1, eval/score.py): faithfulness only when excerpts were given,
 * technicality fit only for low/high. Answers are shown in full, exactly as the chatbot wrote them. */
'use strict';

const CFG = window.AINSUTRO_CONFIG;
const $ = id => document.getElementById(id);
const CORR = [[5, 'Perfect'], [4, 'Good'], [3, 'Partly good'], [2, 'Mostly wrong'], [1, 'Wrong']];
const FAITH = [[5, 'Fully backed'], [4, ''], [3, ''], [2, ''], [1, 'Not backed']];
const TECH = [[5, 'Fits well'], [4, ''], [3, ''], [2, ''], [1, "Doesn't fit"]];
const TECH_HINT = { low: 'plain words for a layperson', high: 'precise legal language', auto: 'no style requested' };
const EFFORTS = ['low', 'mid', 'high'], TECHS = ['low', 'auto', 'high'];
// What a rater gets (same questions and answers as the judge; only the choice of which ones). Defaults first.
const FILTERS = {
  law: { label: 'Language', key: 'lang', opts: [['en', 'English'], ['bn', 'Bangla'], ['other', 'Other: typos, informal, follow-up, general, out of scope']] },
  file: { label: 'File type', key: 'ftype', opts: [['all', 'All file types'], ['pdf', 'PDF'], ['scan', 'Scanned PDF'], ['photo', 'Photo'], ['word', 'Word document']] },
};
const GROUP_NAME = { en: 'English', bn: 'Bangla', other: 'Other', pdf: 'PDF', scan: 'Scanned PDF', photo: 'Photo', word: 'Word document' };
const SEC_NAME = { law: 'Law Answers', file: 'File Answers' };
// Every model the thesis compares; a model is selectable once its answers are in the scoring page
const MODELS = [['all', 'All models'], ['gemma', 'Gemma 4 E4B'], ['qwen3-30b', 'Qwen3 30B'], ['qwen3-next-80b', 'Qwen3-Next 80B']];
const MODEL_NAME = Object.fromEntries(MODELS);
function modelsIn() { return (PROGRESS && PROGRESS.modelsIn) || null; }
function modelValue() {
  const v = store('ainsutro-model'), inn = modelsIn();
  if (!MODELS.some(m => m[0] === v) || v === 'all') return 'all';
  return !inn || inn.indexOf(v) >= 0 ? v : 'all';
}
function fillModels() {
  const v = modelValue(), inn = modelsIn();
  $('modelSel').innerHTML = MODELS.map(([k, t]) => {
    const off = k !== 'all' && inn && inn.indexOf(k) < 0;
    return `<option value="${k}"${k === v ? ' selected' : ''}${off ? ' disabled' : ''}>${esc(t)}${off ? ' (not in yet)' : ''}</option>`;
  }).join('');
}

let auth = null, USER = null, B = null, cur = 0, busy = false, SECTION = 'law', FILES = null, PROGRESS = null;

// ---------------------------------------------------------------- small helpers
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function num(n) { return Number(n || 0).toLocaleString('en-US'); }
/** Percent that never hides small progress: 0% only when nothing is rated; 2 decimals under 1%. */
function pctText(done, total) {
  if (!total || !done) return '0%';
  const p = 100 * done / total;
  if (p < 0.01) return '<0.01%';
  return (p < 1 ? p.toFixed(2) : p < 10 ? p.toFixed(1) : Math.round(p * 10) / 10) + '%';
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), 6000); }
function icon(id) { return `<svg class="i" viewBox="0 0 24 24"><use href="#${id}"/></svg>`; }
function isBangla(s) { const t = String(s || ''); return (t.match(/[ঀ-৿]/g) || []).length > (t.match(/[A-Za-z]/g) || []).length * 0.5; }
function langTag(el, text) { el.lang = isBangla(text) ? 'bn' : 'en'; }

/** Markdown as the chatbot wrote it (tables, lists, bold), sanitised. Nothing is cut. */
function md(s) {
  const html = DOMPurify.sanitize(marked.parse(String(s || ''), { gfm: true, breaks: true }), { USE_PROFILES: { html: true } });
  return html.replace(/<table>/g, '<div class="tablewrap"><table>').replace(/<\/table>/g, '</table></div>');
}

// ---------------------------------------------------------------- the store API
const API_TIMEOUT = 45000;            // Apps Script can take 10-20 s when it starts cold; never wait forever
async function api(action, data, tries = 3) {
  for (let i = 1; ; i++) {
    let res, j, timer = null;
    try {
      const idToken = await USER.getIdToken(i > 1);
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      if (ctl) timer = setTimeout(() => ctl.abort(), API_TIMEOUT);
      // text/plain body: a "simple" request, so browsers need no CORS preflight to Apps Script
      res = await fetch(CFG.store, { method: 'POST', body: JSON.stringify({ idToken, action, data: data || {} }), redirect: 'follow',
                                     cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      j = await res.json();
    } catch (e) {
      if (i < tries) { await sleep(1500 * i); continue; }
      throw new Error(navigator.onLine === false ? 'You are offline. Check the internet connection and try again.'
        : 'The scoring server did not answer (it runs on Google, script.google.com). Please press Try again. ' +
          'If it keeps failing, this network may block Google scripts: try mobile data or another Wi-Fi, or switch off a VPN or ad blocker.');
    } finally { if (timer) clearTimeout(timer); }
    if (j.error) {
      if (/sign-in has expired/i.test(j.error) && i < tries) continue;
      if (/^ACK_REQUIRED/.test(j.error)) { store(ackKey(USER), '0'); showGate(USER); throw new Error('Please confirm the acknowledgement first.'); }
      throw new Error(j.error);
    }
    return j.result;
  }
}

// ---------------------------------------------------------------- read aloud (free: the browser's own voices)
const TTS = {
  voices: [], btn: null, token: 0,
  init() { if (!('speechSynthesis' in window)) return; const load = () => { this.voices = speechSynthesis.getVoices(); }; load(); speechSynthesis.onvoiceschanged = load; },
  pick(lang) {
    const vs = this.voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
    const score = v => (/natural|neural|online|enhanced|premium/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 3 : 0) +
      (/microsoft/i.test(v.name) ? 2 : 0) + (/bd|gb|us/i.test(v.lang) ? 1 : 0);
    return vs.sort((a, b) => score(b) - score(a))[0] || null;
  },
  clean(t) { return String(t || '').replace(/\*\*|__|`|#+\s?|\|/g, ' ').replace(/^\s*[*-]\s+/gm, '').replace(/\s+/g, ' ').trim(); },
  chunks(t) {
    const out = [];
    t.replace(/([.!?।;:])\s+/g, '$1\n').split('\n').forEach(s => {   // no look-behind: old Safari can't parse it
      while (s.length > 220) { let k = s.lastIndexOf(', ', 220); if (k < 80) k = s.lastIndexOf(' ', 220); if (k < 80) k = 220; out.push(s.slice(0, k + 1)); s = s.slice(k + 1); }
      if (out.length && (out[out.length - 1] + ' ' + s).length < 200) out[out.length - 1] += ' ' + s; else if (s.trim()) out.push(s);
    });
    return out;
  },
  speak(text, btn) {
    if (this.btn === btn) { this.stop(); return; }
    this.stop();
    if (!('speechSynthesis' in window)) return toast('This browser cannot read aloud. Chrome or Edge can.');
    const t = this.clean(text), lang = isBangla(t) ? 'bn' : 'en', v = this.pick(lang);
    if (!v) return toast(lang === 'bn' ? 'This browser has no Bangla voice. Microsoft Edge, or Chrome on Android, can read Bangla.'
                                       : 'This browser has no English voice installed.');
    const my = ++this.token;
    this.btn = btn; btn.classList.add('on'); btn.innerHTML = icon('i-stop');
    const parts = this.chunks(t);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.voice = v; u.lang = v.lang; u.rate = lang === 'bn' ? 0.95 : 0.98;
      if (i === parts.length - 1) u.onend = () => { if (my === this.token) this.reset(); };
      u.onerror = () => { if (my === this.token) this.reset(); };
      speechSynthesis.speak(u);
    });
  },
  stop() { this.token++; if ('speechSynthesis' in window) speechSynthesis.cancel(); this.reset(); },
  reset() { if (this.btn) { this.btn.classList.remove('on'); this.btn.innerHTML = icon('i-volume'); } this.btn = null; },
};
const SAY = {
  question: () => B.question.question, qtr: () => B.question.question_tr,
  reference: () => B.question.reference, rtr: () => B.question.reference_tr, answer: () => B.answers[cur].reply,
};

// ---------------------------------------------------------------- layout helpers (every screen size)
/** The sticky header's height, so the question panel and scrolling stop below it (0 when the header scrolls away). */
function topHeight() {
  const t = document.querySelector('.top');
  if (!t) return;
  const sticky = getComputedStyle(t).position === 'sticky';
  document.documentElement.style.setProperty('--top-h', (sticky ? t.offsetHeight : 0) + 'px');
}
/** The account panel opens under the avatar and is moved/shrunk so all of it is on screen, on any device. */
function placeMenu() {
  const m = $('accountMenu');
  if (m.classList.contains('hidden')) return;
  const r = $('accountBtn').getBoundingClientRect();
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (r.bottom < 0 || r.top > vh) { closeMenu(); return; }    // the avatar scrolled out of view
  const w = Math.min(300, vw - 16);
  const top = Math.max(8, r.bottom + 8);
  m.style.width = w + 'px';
  m.style.left = Math.round(Math.max(8, Math.min(r.right - w, vw - w - 8))) + 'px';
  m.style.right = 'auto';
  m.style.top = Math.round(top) + 'px';
  m.style.maxHeight = Math.round(Math.max(160, vh - top - 8)) + 'px';
}
function closeMenu() { $('accountMenu').classList.add('hidden'); $('accountBtn').setAttribute('aria-expanded', 'false'); }

// ---------------------------------------------------------------- page state
function status(msg, retry) {
  $('work').classList.add('hidden');
  const s = $('status');
  s.classList.remove('hidden');
  s.innerHTML = `<p>${esc(msg)}</p>` + (retry ? '<button class="btn" id="retryBtn">Try again</button>' : '');
  if (retry) $('retryBtn').onclick = () => next();
}

function progress(p) {
  if (!p) return;
  PROGRESS = p;
  $('team').innerHTML = `Team <b>${num(p.done)}</b> / ${num(p.total)}`;
  $('meCount').textContent = `You have rated ${num(p.mine)} answers`;
  const mb = p.mineByModel || {};
  $('meModels').innerHTML = MODELS.filter(m => m[0] !== 'all')
    .map(([k, t]) => `<span>${esc(t)}</span><b>${num(mb[k] || 0)}</b>`).join('');
  fillModels();
  strip();
  topHeight();
}

/** Law/File buttons: answers rated in the section, out of ALL answers in the scoring page (team request),
 *  or out of the selected model's answers. */
function sectionCounts() {
  const p = PROGRESS; if (!p || !p.sections) return;
  const m = modelValue(), G = p.groups || {};
  const all = m === 'all' ? p.total : ((G[m + '|'] || {}).total || 0);
  ['law', 'file'].forEach(sec => {
    const x = m === 'all' ? p.sections[sec] : (G[m + '|' + sec] || { done: 0, total: 0 });
    const el = $(sec === 'law' ? 'secLaw' : 'secFile');
    el.innerHTML = `<span class="pc">${pctText(x.done, all)}</span><span class="nn">${num(x.done)} of ${num(all)}</span>`;
    el.title = `${num(x.done)} ${sec} answers rated (${pctText(x.done, all)} of all ${num(all)} answers` +
      (m === 'all' ? '' : ` of ${MODEL_NAME[m]}`) + `; ${num(x.total)} ${sec} answers in total)`;
  });
}

/** The progress line under the header: the current section, team count and yours (shown on phones too). */
function strip() {
  const p = PROGRESS, s = p && p.sections && p.sections[SECTION];
  if (!s) { $('pstrip').classList.add('hidden'); return; }
  $('pstrip').classList.remove('hidden');
  const v = filterValue(), m = modelValue(), G = p.groups || {};
  const key = (m === 'all' ? '' : m + '|') + SECTION + (v !== 'all' ? ':' + v : '');
  const x = G[key] || (m === 'all' && v === 'all' ? s : { done: 0, total: 0 });
  const pct = x.total ? 100 * x.done / x.total : 0;
  sectionCounts();
  const label = [SEC_NAME[SECTION], v !== 'all' ? GROUP_NAME[v] : '', m !== 'all' ? MODEL_NAME[m] : ''].filter(Boolean).map(esc).join(' · ');
  const mt = m !== 'all' && G[m + '|'] ? `<span class="sep">·</span>${esc(MODEL_NAME[m])} total: ${num(G[m + '|'].done)} of ${num(G[m + '|'].total)}` : '';
  $('ptext').innerHTML = `${label}: <b>${num(x.done)}</b> of ${num(x.total)} answers rated (${pctText(x.done, x.total)})${mt}` +
    `<span class="sep">·</span>All models: ${num(p.done)} of ${num(p.total)}<span class="sep">·</span>You: <b>${num(p.mine)}</b>`;
  $('pfill').style.width = (x.done ? Math.max(0.5, Math.min(100, pct)) : 0) + '%';   // a sliver as soon as anything is rated
}

function filterValue() {
  const f = FILTERS[SECTION], v = store('ainsutro-filter-' + SECTION);
  return f.opts.some(o => o[0] === v) ? v : f.opts[0][0];
}
function filterObj() { const o = { model: modelValue() }; o[FILTERS[SECTION].key] = filterValue(); return o; }
function fillFilter() {
  const f = FILTERS[SECTION], v = filterValue();
  $('filterLabel').textContent = f.label;
  $('filterSel').innerHTML = f.opts.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

function pickSection(sec) {
  SECTION = sec; store('ainsutro-section', sec);
  fillFilter();
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sec === sec)));
  strip();
}

async function fileIndex() {
  if (FILES) return FILES;
  try { FILES = await (await fetch('files/index.json', { cache: 'no-cache' })).json(); return FILES; }
  catch (e) { return {}; }          // not cached: tried again for the next file question
}

let LOADS = 0;                       // only the newest load may change the page (fast clicks, slow networks)
async function next(promise) {
  TTS.stop();
  const my = ++LOADS;
  status('Loading the next question');
  let got;
  try { got = await (promise || api('next', { section: SECTION, filter: filterObj() })); }
  catch (e) { if (my === LOADS) status(e.message || String(e), true); return; }
  if (my !== LOADS) return;          // a newer load started meanwhile: ignore this reply
  B = got;
  progress(B.progress);
  $('reviewBar').classList.toggle('hidden', !B.review);
  $('skipBtn').classList.toggle('hidden', !!B.review);
  if (B.empty) return status(B.msg);
  await renderQuestion();
  if (my !== LOADS) return;
  const first = B.answers.findIndex(a => !a.rating && !a.locked);
  show(first < 0 ? 0 : first);
  $('status').classList.add('hidden');
  const w = $('work'); w.classList.remove('hidden'); w.classList.remove('enter'); void w.offsetWidth; w.classList.add('enter');
  window.scrollTo(0, 0);
  $('work').querySelector('.case').scrollTop = 0;
}

function renderModel() {
  const m = B && B.answers && B.answers[0] ? B.answers[0].model_label : '';
  const el = $('qmodel');
  el.classList.toggle('hidden', !m || $('hideModel').checked);
  el.innerHTML = m ? `Model <b>${esc(m)}</b>` : '';
}

async function renderQuestion() {
  const q = B.question;
  renderModel();
  const meta = [['', q.qid], ['', q.domain], ['', q.lang === 'bn' ? 'Bangla' : 'English'], ['expected ', q.expected_route],
                q.type && q.type !== 'generated' ? ['', q.type] : null];
  $('qmeta').innerHTML = meta.filter(Boolean).filter(m => m[1]).map(([k, v]) => `<span>${esc(k)}<b>${esc(v)}</b></span>`).join('');
  $('historyBox').classList.toggle('hidden', !q.history); $('history').textContent = q.history || '';
  $('question').textContent = q.question; langTag($('question'), q.question);
  const trName = q.tr_lang === 'bn' ? 'বাংলা অনুবাদ · Bangla translation' : 'English translation';
  $('qtrBox').classList.toggle('hidden', !q.question_tr); $('qtrLabel').textContent = trName; $('qtr').textContent = q.question_tr || '';
  $('rtrBox').classList.toggle('hidden', !q.reference_tr); $('rtrLabel').textContent = trName; $('rtr').textContent = q.reference_tr || '';
  $('reference').innerHTML = md(q.reference); langTag($('reference'), q.reference);
  $('fileBox').classList.toggle('hidden', !q.file);
  if (q.file) {
    const f = (await fileIndex())[q.file];
    $('fileName').textContent = q.file;
    $('filePages').innerHTML = f && f.pages.length
      ? f.pages.map((p, i) => `<a href="${esc(p)}" target="_blank" rel="noopener" title="Open page ${i + 1} full size"><img src="${esc(p)}" alt="${esc(q.file)}, page ${i + 1}" loading="lazy"></a>`).join('')
      : '<p class="fine">The page view of this file is not available. Open the original file below.</p>';
    $('fileOpen').href = f ? f.original : '#';
    $('fileOpen').parentElement.classList.toggle('hidden', !f);
    $('fileTruth').textContent = q.file_truth || '(no text)'; langTag($('fileTruth'), q.file_truth);
  }
}

function grid() {
  const g = $('grid9');
  let h = '<span></span>' + TECHS.map(t => `<span class="h">${t}</span>`).join('');
  EFFORTS.forEach(e => {
    h += `<span class="h row">${e}</span>`;
    TECHS.forEach(t => {
      const i = B.answers.findIndex(a => a.effort === e && a.technicality === t);
      if (i < 0) { h += '<span></span>'; return; }
      const a = B.answers[i];
      h += `<button type="button" data-i="${i}" class="${a.rating ? 'done' : a.locked ? 'other' : ''} ${i === cur ? 'cur' : ''}" ` +
           `title="${a.locked ? 'Scored by another rater' : ''}" ` +
           `aria-label="Answer ${i + 1}: effort ${e}, technicality ${t}${a.rating ? ', rated' : a.locked ? ', scored by another rater' : ''}" aria-current="${i === cur}">${i + 1}</button>`;
    });
  });
  g.innerHTML = `<span class="h row">effort</span><span class="h" style="grid-column: span 3">technicality</span>` + h;
  g.querySelectorAll('button').forEach(b => b.onclick = () => show(Number(b.dataset.i)));
  const done = B.answers.filter(a => a.rating).length;
  $('now').innerHTML = `Answer <b>${cur + 1}</b> of 9 · ${done} rated`;
  // Skip only before the first answer is scored (otherwise someone else would score the same answers again)
  $('skipBtn').classList.toggle('hidden', !!B.review || done > 0);
}

function scale(el, name, list) {
  el.innerHTML = '<div class="scale">' + list.map(([v, t]) =>
    `<label><input type="radio" name="${name}" value="${v}"><span class="n">${v}</span><span class="t">${esc(t) || '&nbsp;'}</span></label>`).join('') + '</div>';
}
/** Marks the chosen score (a class, not CSS :has(), so older phones show it too). */
function mark(name) {
  document.querySelectorAll(`input[name=${name}]`).forEach(i => i.parentElement.classList.toggle('on', i.checked));
}
function val(name) { const x = document.querySelector(`input[name=${name}]:checked`); return x ? x.value : null; }
function setVal(name, v) { document.querySelectorAll(`input[name=${name}]`).forEach(i => { i.checked = v !== null && v !== undefined && v !== '' && String(i.value) === String(v); }); mark(name); }

function show(i) {
  if (TTS.btn && TTS.btn.dataset.say === 'answer') TTS.stop();
  cur = i;
  const a = B.answers[i], r = a.rating, showModel = !$('hideModel').checked;
  $('ameta').innerHTML = [showModel ? ['model ', a.model_label] : null, ['effort ', a.effort], ['technicality ', a.technicality],
                          a.route ? ['routed to ', a.route] : null]
    .filter(Boolean).map(([k, v]) => `<span>${esc(k)}<b>${esc(v)}</b></span>`).join('');
  $('answer').innerHTML = md(a.reply); langTag($('answer'), a.reply);
  $('exSum').textContent = a.excerpts.length ? `Source excerpts the chatbot was given (${a.excerpts.length})` : 'The chatbot was given no source excerpts';
  $('excerpts').innerHTML = a.excerpts.map(e => {
    const lang = isBangla(e.text) ? 'bn' : 'en';
    return `<div class="ex"><span class="meta">[${esc(e.n)}] ${esc(e.label)}</span><div class="plain" lang="${lang}">${esc(e.text)}</div></div>`;
  }).join('');
  $('exBox').open = store('ainsutro-ex-open') === '1';
  // the judge's rules: faithfulness only with excerpts, technicality fit only for low/high
  if (a.has_excerpts) { scale($('faithWrap'), 'faith', FAITH); setVal('faith', r ? r.faithfulness : null); }
  else $('faithWrap').innerHTML = '<span class="na">n/a: no excerpts were given</span>';
  $('techHint').textContent = a.technicality === 'auto' ? 'Not asked for auto' : `Requested: ${a.technicality}, ${TECH_HINT[a.technicality]}`;
  if (a.technicality !== 'auto') { scale($('techWrap'), 'tech', TECH); setVal('tech', r ? r.technicality_fit : null); }
  else $('techWrap').innerHTML = '<span class="na">n/a: technicality is auto</span>';
  setVal('corr', r ? r.correctness : null);
  $('langOk').checked = r ? String(r.language_ok) === 'true' : true;
  $('refused').checked = r ? String(r.refused) === 'true' : false;
  $('note').value = r ? (r.note || '') : '';
  $('err').textContent = '';
  $('back').disabled = i === 0;
  $('rateForm').classList.toggle('locked', !!a.locked);
  $('lockedNote').classList.toggle('hidden', !a.locked);
  grid();
}

async function save(ev) {
  if (ev) ev.preventDefault();
  if (busy || !B || B.empty) return;
  const a = B.answers[cur];
  if (a.locked) return;
  const rating = { key: a.key, correctness: val('corr'), faithfulness: a.has_excerpts ? val('faith') : null,
    technicality_fit: a.technicality !== 'auto' ? val('tech') : null,
    language_ok: $('langOk').checked, refused: $('refused').checked, note: $('note').value.trim() };
  const err = m => { $('err').textContent = m; };
  if (!rating.correctness) return err('Choose a correctness score.');
  if (a.has_excerpts && !rating.faithfulness) return err('Choose a faithfulness score.');
  if (a.technicality !== 'auto' && !rating.technicality_fit) return err('Choose a technicality fit score.');
  busy = true; $('save').disabled = true; $('save').firstChild.textContent = 'Saving ';
  const B0 = B;
  try {
    const nx = B0.review ? null : { section: SECTION, filter: filterObj() };     // finished? the next question comes back at once
    const res = await api('submit', { row: B0.row, bundle: B0.bundle, rating, next: nx });
    a.rating = { ...rating, faithfulness: res.saved.faithfulness, technicality_fit: res.saved.technicality_fit };
    if (B !== B0) return;              // another question was opened meanwhile; the score is saved anyway
    if (B.review) {                       // changing earlier scores: stay on this question
      if (cur < B.answers.length - 1) { show(cur + 1); toast(`Answer ${cur} saved`); }
      else { show(cur); toast('All your changes to this question are saved'); }
      return;
    }
    if (res.finished || B.answers.every(x => x.rating || x.locked)) {
      busy = false; toast('Question finished. Here is the next one');
      return next(res.next ? Promise.resolve(res.next) : undefined);
    }
    const open = x => !x.rating && !x.locked;
    const n = B.answers.findIndex((x, j) => j > cur && open(x));
    show(n >= 0 ? n : B.answers.findIndex(open));
    document.querySelector('.paper').scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (/^TAKEN:/.test(m)) { toast(m.replace(/^TAKEN:\s*/, '')); busy = false; next(); return; }
    err(m);
  }
  finally { busy = false; $('save').disabled = false; $('save').firstChild.textContent = 'Save and next '; }
}

// ---------------------------------------------------------------- sign-in
function inAppBrowser() { return /FBAN|FBAV|FB_IAB|Instagram|Messenger|WhatsApp|Line\/|MicroMessenger|Snapchat|; wv\)|TikTok/i.test(navigator.userAgent); }

const ACK_V = 'ack-1';          // same as ACK_VERSION in the store; change both when the wording changes
function ackKey(user) { return 'ainsutro-ack|' + ACK_V + '|' + ((user && user.email) || ''); }
function ackTicked() { return $('ackBox').checked; }
function syncAck() {
  const on = ackTicked();
  $('ackBox').closest('.ack').classList.toggle('on', on);
  $('signinBtn').disabled = !on; $('ackContinue').disabled = !on;
  $('ackHint').classList.toggle('hidden', on);
  store('ainsutro-ack-ticked', on ? '1' : '0');      // survives the redirect sign-in on some phones
}

async function signIn() {
  $('signinErr').textContent = '';
  if (!ackTicked()) { $('ackHint').classList.remove('hidden'); return; }
  const p = new firebase.auth.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try {
    await auth.signInWithPopup(p);
  } catch (e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/cancelled-popup-request') {
      try { await auth.signInWithRedirect(p); return; } catch (e2) { e = e2; }
    }
    if (code === 'auth/popup-closed-by-user') return;
    $('signinErr').textContent = code === 'auth/network-request-failed' ? 'No internet connection. Check it and try again.'
      : code === 'auth/unauthorized-domain' ? 'This address is not allowed to sign in. Please use the official AinSutro Scoring Page link.'
      : 'Sign-in did not work: ' + ((e && e.message) || code);
  }
}

function showSignin() {
  $('app').classList.add('hidden'); $('signin').classList.remove('hidden');
  $('inapp').classList.toggle('hidden', !inAppBrowser());
  $('signinBtn').classList.remove('hidden'); $('ackContinue').classList.add('hidden'); $('gateWho').classList.add('hidden');
  syncAck();
}

/** Signed in, but this account has not ticked the acknowledgement yet: ask before anything else. */
function showGate(user) {
  $('app').classList.add('hidden'); $('signin').classList.remove('hidden'); $('inapp').classList.add('hidden');
  $('ackBox').checked = false; syncAck();
  $('signinBtn').classList.add('hidden'); $('ackContinue').classList.remove('hidden');
  $('gateWho').classList.remove('hidden');
  $('gateWho').innerHTML = `Signed in as <b>${esc((user && user.email) || '')}</b> · <button type="button" id="gateOut">Use another account</button>`;
  $('gateOut').onclick = () => auth.signOut();
}

/** True once the store has this rater's acknowledgement (recorded now if the box is ticked). */
async function ensureAck(user) {
  if (store(ackKey(user)) === '1') return true;
  try {
    if (ackTicked() || store('ainsutro-ack-ticked') === '1') await api('ack', { version: ACK_V });
    else if (!(await api('me')).acked) { showGate(user); return false; }
    store(ackKey(user), '1');
    return true;
  } catch (e) {
    showGate(user); $('signinErr').textContent = (e && e.message) || String(e);
    return false;
  }
}

async function start(user) {
  USER = user;
  $('signinBtn').disabled = true;
  if (!(await ensureAck(user))) return;
  $('signin').classList.add('hidden'); $('app').classList.remove('hidden'); topHeight();
  const name = user.displayName || (user.email || '').split('@')[0];
  $('meName').textContent = name; $('meEmail').textContent = user.email || '';
  $('accountBtn').innerHTML = user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(name.slice(0, 1).toUpperCase());
  $('accountBtn').title = name;
  if (store('ainsutro-guide-seen') !== '1') guide(true);
  pickSection(store('ainsutro-section') === 'file' ? 'file' : 'law');   // Law Answers unless the rater chose File
  await next();
}

/** "My scored answers", grouped like the page: Law Answers -> language, File Answers -> file type, then the model.
 *  Newest first inside each group. */
const MINE_GROUPS = { law: ['en', 'bn', 'other'], file: ['pdf', 'scan', 'photo', 'word', 'other'] };
function mineTree(list) {
  const models = MODELS.filter(m => m[0] !== 'all').map(m => m[1]);
  const answers = list.reduce((n, m) => n + Number(m.rated || 0), 0);
  const cnt = (xs) => `${xs.length} question${xs.length === 1 ? '' : 's'} · ${xs.reduce((n, m) => n + Number(m.rated || 0), 0)} answers`;
  const row = m => {
    const when = m.last ? new Date(m.last).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return `<button type="button" class="mine-row" data-b="${esc(m.bundle)}">` +
      `<span class="q" lang="${isBangla(m.question) ? 'bn' : 'en'}">${esc(m.question)}</span>` +
      `<span class="meta">${m.rated} of 9 scored · ${esc(when)}</span>` +
      `<span class="edit">See and change my scores ›</span></button>`;
  };
  let h = `<p class="mine-total">You have scored <b>${answers}</b> answers in <b>${list.length}</b> question${list.length === 1 ? '' : 's'}.</p>`;
  ['law', 'file'].forEach(sec => {
    const inSec = list.filter(m => (m.section === 'file' ? 'file' : 'law') === sec);
    if (!inSec.length) return;
    h += `<details class="mine-sec" open><summary><span class="t">${esc(SEC_NAME[sec])}</span><span class="cnt">${cnt(inSec)}</span></summary>`;
    const groups = MINE_GROUPS[sec].concat([...new Set(inSec.map(m => m.group))].filter(g => MINE_GROUPS[sec].indexOf(g) < 0));
    groups.forEach(g => {
      const inG = inSec.filter(m => (m.group || 'other') === g);
      if (!inG.length) return;
      h += `<details class="mine-grp" open><summary><span class="t">${esc(GROUP_NAME[g] || g)}</span><span class="cnt">${cnt(inG)}</span></summary>`;
      models.concat([...new Set(inG.map(m => m.model))].filter(x => models.indexOf(x) < 0)).forEach(mo => {
        const inM = inG.filter(m => m.model === mo);
        if (!inM.length) return;
        h += `<div class="mine-model"><div class="mh"><span class="t">${esc(mo)}</span><span class="cnt">${cnt(inM)}</span></div>` +
             inM.map(row).join('') + '</div>';
      });
      h += '</details>';
    });
    h += '</details>';
  });
  return h;
}

/** Choices in "My scored answers", like the main page: section, language / file type, model (remembered). */
const MINE = { list: [] };
function mineChoice() {
  const sec = ['all', 'law', 'file'].indexOf(store('ainsutro-mine-sec')) >= 0 ? store('ainsutro-mine-sec') : 'all';
  const grp = store('ainsutro-mine-grp-' + sec) || 'all', model = store('ainsutro-mine-model') || 'all';
  return { sec, grp, model };
}
function renderMine() {
  const c = mineChoice(), list = MINE.list;
  const secOf = m => (m.section === 'file' ? 'file' : 'law');
  const label = k => (MODELS.find(m => m[0] === k) || [k, k])[1];
  document.querySelectorAll('#mineFilters .seg button').forEach(b => {
    const n = b.dataset.v === 'all' ? list.length : list.filter(m => secOf(m) === b.dataset.v).length;
    b.setAttribute('aria-pressed', String(b.dataset.v === c.sec));
    let cnt = b.querySelector('.cnt'); if (!cnt) { cnt = document.createElement('span'); cnt.className = 'cnt'; b.appendChild(cnt); }
    cnt.textContent = n;
  });
  // language (Law) or file type (File); hidden for All
  const inSec = list.filter(m => c.sec === 'all' || secOf(m) === c.sec);
  $('mineGroupWrap').classList.toggle('hidden', c.sec === 'all');
  let grp = c.grp;
  if (c.sec !== 'all') {
    const groups = MINE_GROUPS[c.sec].filter(g => g !== 'other' || c.sec === 'law' || inSec.some(m => m.group === g));
    if (groups.indexOf(grp) < 0) grp = 'all';
    $('mineGroupLabel').textContent = c.sec === 'law' ? 'Language' : 'File type';
    const opts = [['all', c.sec === 'law' ? 'All languages' : 'All file types']].concat(groups.map(g => [g, GROUP_NAME[g] || g]));
    $('mineGroup').innerHTML = opts.map(([k, t]) => {
      const n = k === 'all' ? inSec.length : inSec.filter(m => (m.group || 'other') === k).length;
      return `<option value="${k}"${k === grp ? ' selected' : ''}>${esc(t)} (${n})</option>`;
    }).join('');
  } else grp = 'all';
  const inGrp = inSec.filter(m => grp === 'all' || (m.group || 'other') === grp);
  // model (the store sends the model's display name)
  const mods = MODELS.filter(m => m[0] !== 'all');
  let model = mods.some(m => m[0] === c.model) ? c.model : 'all';
  $('mineModel').innerHTML = [['all', 'All models']].concat(mods).map(([k, t]) => {
    const n = k === 'all' ? inGrp.length : inGrp.filter(m => m.model === t).length;
    return `<option value="${k}"${k === model ? ' selected' : ''}>${esc(t)} (${n})</option>`;
  }).join('');
  const shown = inGrp.filter(m => model === 'all' || m.model === label(model));
  $('mineList').innerHTML = shown.length ? mineTree(shown)
    : '<p class="fine">You have not scored any answers in this choice. Choose another section, ' +
      (c.sec === 'file' ? 'file type' : 'language') + ' or model above.</p>';
  $('mineList').querySelectorAll('.mine-row').forEach(b => b.onclick = () => {
    const d = $('mineDlg'); d.close ? d.close() : d.removeAttribute('open');
    next(api('open', { bundle: b.dataset.b }));
  });
}

// ---------------------------------------------------------------- share (one main link for everyone)
function mainLink() { return location.origin.replace(/\.firebaseapp\.com$/, '.web.app') + '/'; }
const SHARE_TEXT = 'Please help score the AinSutro chatbot\'s answers on Bangladesh law (for people with a law background; sign in with Google):';
function openShare() {
  closeMenu();
  const url = mainLink(), u = encodeURIComponent(url), t = encodeURIComponent(SHARE_TEXT), tu = encodeURIComponent(SHARE_TEXT + ' ' + url);
  $('shareUrl').value = url;
  $('shareWa').href = 'https://wa.me/?text=' + tu;
  $('shareMsg').href = 'fb-messenger://share/?link=' + u;
  $('shareTg').href = 'https://t.me/share/url?url=' + u + '&text=' + t;
  $('shareFb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + u;
  $('shareLi').href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + u;
  $('shareMail').href = 'mailto:?subject=' + encodeURIComponent('AinSutro Scoring Page') + '&body=' + tu;
  // Messenger opens only where its app is installed (phones); elsewhere it is hidden
  $('shareMsg').classList.toggle('hidden', !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  $('shareNative').classList.toggle('hidden', !navigator.share);
  const d = $('shareDlg');
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}
async function copyShareLink() {
  const url = mainLink();
  try { await navigator.clipboard.writeText(url); toast('Link copied. Paste it anywhere to share.'); }
  catch (e) { const i = $('shareUrl'); i.focus(); i.select(); toast('Press Copy (or Ctrl+C) to copy the selected link.'); }
}
async function nativeShare() {
  try { await navigator.share({ title: 'AinSutro Scoring Page', text: SHARE_TEXT, url: mainLink() }); }
  catch (e) { if (!e || e.name !== 'AbortError') copyShareLink(); }
}

async function openMine() {
  closeMenu();
  const d = $('mineDlg');
  $('mineList').innerHTML = '<p class="fine">Loading</p>'; $('mineFilters').classList.add('hidden');
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  let list;
  try { list = await api('mine'); }
  catch (e) { $('mineList').innerHTML = `<p class="err">${esc(e.message || e)}</p>`; return; }
  MINE.list = list;
  $('mineFilters').classList.toggle('hidden', !list.length);
  if (!list.length) { $('mineList').innerHTML = '<p class="fine">You have not scored any answers yet.</p>'; return; }
  renderMine();
}

function guide(open) {
  const d = $('guide');
  if (open) { if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } }
  else { d.close ? d.close() : d.removeAttribute('open'); store('ainsutro-guide-seen', '1'); }
}

// ---------------------------------------------------------------- wiring
function wire() {
  TTS.init();
  document.querySelectorAll('.spk').forEach(b => { b.innerHTML = icon('i-volume'); b.type = 'button'; b.onclick = () => B && TTS.speak(SAY[b.dataset.say](), b); });
  scale($('corr'), 'corr', CORR);
  $('rateForm').addEventListener('submit', save);
  $('rateForm').addEventListener('change', e => { if (e.target.type === 'radio') { mark(e.target.name); $('err').textContent = ''; } });
  $('rateForm').addEventListener('focusin', e => { if (e.target.type === 'radio') e.target.parentElement.classList.add('focus'); });
  $('rateForm').addEventListener('focusout', e => { if (e.target.type === 'radio') e.target.parentElement.classList.remove('focus'); });
  $('back').onclick = () => { if (cur > 0) show(cur - 1); };
  $('skipBtn').onclick = () => { if (B && confirm('Give this whole question (all 9 answers) to someone else?')) next(api('skip', { row: B.row, bundle: B.bundle, section: SECTION, filter: filterObj() })); };
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { if (SECTION === b.dataset.sec) return; pickSection(b.dataset.sec); next(); });
  $('guideBtn').onclick = () => guide(true);
  $('guideOk').onclick = () => guide(false);
  $('guide').addEventListener('close', () => store('ainsutro-guide-seen', '1'));
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('guideEn').classList.toggle('hidden', b.dataset.lang !== 'en'); $('guideBn').classList.toggle('hidden', b.dataset.lang !== 'bn');
    store('ainsutro-guide-lang', b.dataset.lang);
  });
  if (store('ainsutro-guide-lang') === 'bn') document.querySelector('.tabs button[data-lang=bn]').click();
  $('hideModel').checked = store('ainsutro-hide-model') === '1';   // model names are shown unless the rater hides them
  $('hideModel').onchange = () => { store('ainsutro-hide-model', $('hideModel').checked ? '1' : '0'); if (B && !B.empty) { renderModel(); show(cur); } };
  $('exBox').addEventListener('toggle', () => store('ainsutro-ex-open', $('exBox').open ? '1' : '0'));
  const menu = $('accountMenu');
  $('accountBtn').onclick = e => {
    e.stopPropagation();
    const open = menu.classList.toggle('hidden') === false;
    $('accountBtn').setAttribute('aria-expanded', String(open));
    if (open) placeMenu();
  };
  document.addEventListener('click', e => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.classList.contains('hidden')) { closeMenu(); $('accountBtn').focus(); } });
  const relayout = () => { topHeight(); placeMenu(); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 300));
  window.addEventListener('scroll', placeMenu, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', placeMenu);
  if (typeof ResizeObserver === 'function') new ResizeObserver(topHeight).observe(document.querySelector('.top'));
  $('signoutBtn').onclick = () => auth.signOut();
  $('switchBtn').onclick = async () => { await auth.signOut(); signIn(); };
  $('signinBtn').onclick = signIn;
  $('mineBtn').onclick = openMine;
  document.querySelectorAll('#mineFilters .seg button').forEach(b => b.onclick = () => { store('ainsutro-mine-sec', b.dataset.v); renderMine(); });
  $('mineGroup').onchange = () => { store('ainsutro-mine-grp-' + mineChoice().sec, $('mineGroup').value); renderMine(); };
  $('mineModel').onchange = () => { store('ainsutro-mine-model', $('mineModel').value); renderMine(); };
  $('shareBtn').onclick = openShare; $('shareBtn2').onclick = openShare;
  $('shareCopy').onclick = copyShareLink; $('shareNative').onclick = nativeShare;
  $('shareUrl').onfocus = () => $('shareUrl').select();
  $('shareClose').onclick = () => { const d = $('shareDlg'); d.close ? d.close() : d.removeAttribute('open'); };
  $('mineClose').onclick = () => { const d = $('mineDlg'); d.close ? d.close() : d.removeAttribute('open'); };
  $('reviewDone').onclick = () => next();
  fillModels();
  $('modelSel').onchange = () => { store('ainsutro-model', $('modelSel').value); strip(); next(); };
  $('filterSel').onchange = () => { store('ainsutro-filter-' + SECTION, $('filterSel').value); strip(); next(); };
  $('ackBox').addEventListener('change', syncAck);
  $('ackContinue').onclick = () => { if (ackTicked() && USER) start(USER); };
  $('copyLink').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied. Paste it into Chrome or Safari'); }
    catch (e) { prompt('Copy this link and open it in Chrome or Safari:', location.href); }
  };
  document.addEventListener('keydown', e => {
    if (!B || B.empty || $('work').classList.contains('hidden') || $('guide').open || $('mineDlg').open || $('shareDlg').open || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'text'))) return;
    if (/^[1-5]$/.test(e.key)) { setVal('corr', e.key); $('err').textContent = ''; }
    if (e.key === 'Enter' && !(el && el.tagName === 'BUTTON')) { e.preventDefault(); save(); }
  });
}

(function boot() {
  if (!CFG || !window.firebase) {
    document.body.innerHTML = '<div style="max-width:440px;margin:15vh auto;padding:24px;font:15px/1.6 system-ui,sans-serif">' +
      '<p><b>The AinSutro Scoring Page could not load completely.</b> The connection may be slow, or a browser extension or ' +
      'network filter blocked a part of it.</p><p><button onclick="location.reload()" style="font:inherit;padding:8px 16px">Reload</button></p></div>';
    return;
  }
  wire();
  // authSameHost (config.js): sign in through this page's own address (web.app or firebaseapp.com), so the redirect
  // sign-in also works in Safari/iPhone, Firefox and Chrome with third-party storage blocked. Needs both addresses'
  // /__/auth/handler in the Google OAuth client's redirect URIs (eval/HUMAN_GUIDE.md).
  const host = location.hostname;
  if (CFG.authSameHost && /(^|\.)(web\.app|firebaseapp\.com)$/.test(host)) CFG.firebase.authDomain = host;
  firebase.initializeApp(CFG.firebase);
  auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  auth.getRedirectResult().catch(e => { $('signinErr').textContent = 'Sign-in did not work: ' + ((e && e.message) || e); });
  let started = false;
  auth.onAuthStateChanged(user => {
    if (user) { if (!started) { started = true; start(user); } }
    else { started = false; USER = null; B = null; showSignin(); }
  });
})();
