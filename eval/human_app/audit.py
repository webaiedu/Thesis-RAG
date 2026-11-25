"""Audit the AinSutro Scoring Page against the run files the 80B judge used (read-only).

    cd eval && python3 human_app/audit.py                 # gemma and qwen3-30b
    cd eval && python3 human_app/audit.py qwen3-next-80b  # one model

For every answer the store returns MD5 fingerprints of the reply and of the excerpt texts a rater sees
(store action admin_audit); this script recomputes them from runs/B0/<model>[-files]/answers.jsonl, with the
excerpts built exactly as score.py excerpts_for builds them for the judge. It also checks the questions and that
every queue entry points at its own question and its own 9 answers. Expected: "TOTAL PROBLEMS: 0".
"""
import csv, json, hashlib, sys, time
from pathlib import Path
MODELS_ARG = sys.argv[1:] or ['gemma', 'qwen3-30b']
sys.argv = ['x']; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import human as H, score as S
md5 = lambda s: hashlib.md5(str(s).encode('utf-8')).hexdigest()
SEP = '␞'
ch = S.chunks()
LIMIT = S.CONFIG['judge']['excerpt_chars']

def judge_texts(a):
    """Excerpt texts exactly as score.excerpts_for builds them for the 80B judge."""
    texts, used = [], 0
    truth = S.file_truth(a['file']) if a.get('file') else ''
    if a.get('file') and truth:
        texts.append(truth); used += len('[attached file, its true content] ' + truth)
    for i, s in enumerate(a.get('sources', []), 1):
        t = ch.get(s['id'], {}).get('text', '')[: max(0, LIMIT - used)]
        if not t:
            break
        texts.append(t); used += len(t)
    # cross-check with the judge's own function
    rebuilt = '\n\n'.join(([f'[attached file, its true content] {texts[0]}'] if a.get('file') and truth else []) +
                          [f'[{i}] {t}' for i, t in enumerate(texts[1:] if (a.get('file') and truth) else texts, 1)]) or '(none: no excerpts were given)'
    assert rebuilt == S.excerpts_for(a, LIMIT), a['key']
    return texts

total_bad = 0
exp_overlap = sorted(r['qid'] for r in csv.DictReader(open('data/human/upload/questions.csv', encoding='utf-8')) if r['overlap'] == '1')
for model in MODELS_ARG:
    t0 = time.time(); res = H.store_call('admin_audit', {'model': model}, timeout=600); got = res['answers']
    rows = [json.loads(l) for run in (f'runs/B0/{model}', f'runs/B0/{model}-files') for l in open(f'{run}/answers.jsonl')]
    bad = {'missing': [], 'extra': [], 'reply': [], 'excerpts': [], 'count': []}
    keys = {r['key'] for r in rows}
    bad['extra'] = [k for k in got if k not in keys]
    for a in rows:
        g = got.get(a['key'])
        if not g: bad['missing'].append(a['key']); continue
        texts = judge_texts(a)
        if g[0] != md5(H.cell(a.get('reply') or '')): bad['reply'].append(a['key'])
        if g[1] != md5(SEP.join(H.cell(t) if False else t for t in texts)): bad['excerpts'].append(a['key'])
        if g[2] != len(texts): bad['count'].append(a['key'])
    qq = res.get('queue') or {}
    bad['queue'] = qq.get('bad', [])
    if qq.get('need2') != exp_overlap: bad['overlap'] = ['overlap questions differ from the export']
    n = sum(len(v) for v in bad.values()); total_bad += n
    print(f"{model}: {len(rows)} answers in the runs, {len(got)} in the scoring page ({time.time()-t0:.0f} s) -> "
          + ', '.join(f"{k} {len(v)}" for k, v in bad.items()) + ('  OK' if n == 0 else '  PROBLEM'))
    for k, v in bad.items():
        if v: print('   ', k, v[:3])
# questions
qs = H.load_questions()
qbad = []
for qid, q in qs.items():
    truth = S.file_truth(q['file']) if q.get('file') else ''
    exp = md5(SEP.join([H.cell(q['question']), H.cell(q.get('reference_answer') or '(none)'), H.cell(truth or ''), q.get('lang', ''),
                         q['_test'], q.get('file') or '', q.get('expected_route', 'law'), H.cell(H.history_text(q))]))
    if res['questions'].get(qid) != exp: qbad.append(qid)
print(f"questions: {len(qs)} in the test sets, {len(res['questions'])} in the scoring page, mismatched {len(qbad)}", qbad[:5])
print('TOTAL PROBLEMS:', total_bad + len(qbad))
