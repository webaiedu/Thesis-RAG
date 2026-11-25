"""
Human scoring of EVERY model and setting, shared through a Google Sheet + web page (HUMAN_GUIDE.md),
with Claude scoring the same answers and the 80B judge compared on them.

    python3 human.py export --model gemma         # CSVs for the Sheet -> data/human/upload/ (drag into Drive)
    python3 human.py pull                         # ratings from the AinSutro store (or: pull Ratings.csv) -> ratings.jsonl
    python3 human.py status                       # human progress + what Claude still has to score
    python3 human.py claude-batch --size 20       # next answers for Claude to score (prints them)
    python3 human.py claude-add claude_out.jsonl  # store Claude's scores (JSONL: key, correctness, ...)
    python3 human.py analyze                      # humans vs 80B judge vs Claude -> data/human/report.md

Design:
  - Unit of work = a "bundle": one question x one model, i.e. its 9 answers (3 effort x 3 technicality).
    The web app hands each bundle to one rater only; nobody gets an answer that is done or being done.
  - Questions get a fixed priority rank (seed 23, balanced over domain x language, special types spread out),
    so whatever has been rated so far is a fair sample. Every 20th question (rank 20, 40, ...) is rated by a
    second rater too (~5%), for human-human agreement.
  - Rubric = the 80B judge's prompt j1 (score.py): correctness 1-5, faithfulness 1-5|null,
    technicality_fit 1-5|null, language_ok, refused.
  - Claude scores exactly the answers humans scored, plus the same question x setting for the other models.
Uses only the Python standard library, plus helpers from score.py and gold.py.
"""
import argparse
import csv
import hashlib
import json
import math
import random
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import score as S  # noqa: E402
import gold as G   # noqa: E402

OUT = HERE / "data" / "human"
UPLOAD = OUT / "upload"
RUNS = HERE / "runs"
MODELS = {"gemma": "B0/gemma", "qwen3-30b": "B0/qwen3-30b", "qwen3-next-80b": "B0/qwen3-next-80b"}
MODEL_ORDER = list(MODELS)
SELF_MODEL = "qwen3-next-80b"
TESTS = (("law", HERE / "data" / "test.jsonl", ""), ("file", HERE / "data" / "test_files.jsonl", "-files"))
EFFORTS, TECHS = ["low", "mid", "high"], ["low", "auto", "high"]
METRICS = ["correctness", "faithfulness", "technicality_fit"]
OVERLAP_EVERY = 20
SEED = 23
CELL_LIMIT = 49000                     # Google Sheets: 50,000 chars per cell
PART_BYTES = 7_000_000                 # answers CSVs are split into parts below ~8 MB


# ---------------------------------------------------------------- helpers
def write_csv(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")      # Apps Script's Utilities.parseCsv wants \n
        w.writerow(header)
        for r in rows:
            w.writerow(["" if v is None else v for v in r])


def cell(v):
    v = "" if v is None else str(v).replace("\r\n", "\n").replace("\r", "\n")
    if len(v) > CELL_LIMIT:
        print(f"warning: text cut to {CELL_LIMIT} chars (was {len(v)})")
        v = v[:CELL_LIMIT]
    return v


def history_text(q):
    """Earlier turns of a follow-up question, as plain text."""
    msgs = q.get("messages") or []
    if isinstance(msgs, str):
        return msgs
    return "\n".join(f"{m.get('role', '?').upper()}: {m.get('content', '')}" for m in msgs
                     if m.get("content") != q.get("question"))


def load_questions():
    """qid -> question record (+ test name), for both test sets."""
    out = {}
    for name, path, _ in TESTS:
        for qid, q in S.load_test(path).items():
            out[qid] = {**q, "_test": name}
    return out


def priority(questions):
    """Fixed order of all questions; special types and domain x language cells spread round-robin."""
    rng = random.Random(SEED)

    def cell_of(qid):
        q = questions[qid]
        t = q.get("type", "generated")
        if t not in ("generated", None, ""):
            return ("special", t)
        return (q["_test"], q.get("domain") or "-", q.get("lang") or "-")
    order = G.pick_balanced(sorted(questions), cell_of, len(questions), rng)
    return {qid: n for n, qid in enumerate(order, 1)}


def run_answers(model):
    """key -> answer for a model's law + file runs (whatever exists)."""
    out = {}
    for _, _, suffix in TESTS:
        p = RUNS / (MODELS[model] + suffix) / "answers.jsonl"
        if p.exists():
            for a in S.read_jsonl(p):
                out[a["key"]] = a
    return out


def setting(a):
    return a["settings"]["effort"], a["settings"]["technicality"]


def source_label(s):
    if s.get("kind") == "case":
        return f"{s.get('caseTitle', '')} ({s.get('citation', '')})"
    sec = f", s. {s['section']}" if s.get("section") else ""
    return f"{s.get('act', '')}{sec}"


# ---------------------------------------------------------------- export
def export(args):
    questions = load_questions()
    rank = priority(questions)
    UPLOAD.mkdir(parents=True, exist_ok=True)

    qrows = []
    for qid in sorted(questions, key=rank.get):
        q = questions[qid]
        truth = S.file_truth(q["file"]) if q.get("file") else ""
        qrows.append([qid, rank[qid], int(rank[qid] % OVERLAP_EVERY == 0), q["_test"], q.get("lang", ""),
                      q.get("domain", ""), q.get("type", "generated"), q.get("expected_route", "law"),
                      q.get("file") or "", cell(history_text(q)), cell(q["question"]),
                      cell(q.get("reference_answer") or "(none)"), cell(truth or "")])
    write_csv(UPLOAD / "questions.csv",
              ["qid", "rank", "overlap", "test", "lang", "domain", "type", "expected_route", "file", "history",
               "question", "reference", "file_truth"], qrows)
    print(f"questions.csv: {len(qrows)} questions, {sum(r[2] for r in qrows)} double-rated (every {OVERLAP_EVERY}th)")

    ch = S.chunks()
    used = set()
    for model in args.model:
        ans = run_answers(model)
        want = {(qid, e, t) for qid in questions for e in EFFORTS for t in TECHS}
        have = {(a["id"], *setting(a)) for a in ans.values() if a.get("reply")}
        missing = want - have
        if missing and not args.allow_partial:
            by_test = Counter(questions[m[0]]["_test"] for m in missing)
            sys.exit(f"{model}: {len(missing)} answers missing ({dict(by_test)}); the run isn't finished. "
                     "Export it when it is (or --allow-partial for a test).")
        rows = []
        for a in sorted(ans.values(), key=lambda a: (rank.get(a["id"], 10**6), EFFORTS.index(setting(a)[0]),
                                                     TECHS.index(setting(a)[1]))):
            if a["id"] not in questions or not a.get("reply"):
                continue
            srcs = []
            for s in a.get("sources", []):
                srcs.append({"id": s["id"], "label": source_label(s), "kind": s.get("kind", "act")})
                used.add(s["id"])
            route = a.get("route") or {}
            route_txt = route.get("type", "") + (": " + ", ".join(d.get("label", d.get("id", ""))
                                                                  for d in route.get("domains", []))
                                                 if route.get("domains") else "")
            e, t = setting(a)
            rows.append([a["key"], a["id"], model, (a.get("meta") or {}).get("modelLabel", model), e, t,
                         route_txt, cell(a.get("corrected") or ""), cell(a["reply"]),
                         json.dumps(srcs, ensure_ascii=False), a.get("file") or ""])
        # parts under PART_BYTES (Drive upload limit from Claude Code is 10 MB; also keeps each Sheet import short),
        # split only between questions so a question's 9 answers stay together and in order
        for old in UPLOAD.glob(f"answers-{model}*.csv"):
            old.unlink()
        head = ["key", "qid", "model", "model_label", "effort", "technicality", "route", "corrected", "reply",
                "sources", "file"]
        parts, part, size = [], [], 0
        for i, r in enumerate(rows):
            new_q = i == 0 or r[1] != rows[i - 1][1]
            if new_q and part and size > PART_BYTES:
                parts.append(part)
                part, size = [], 0
            part.append(r)
            size += sum(len(str(v).encode()) for v in r) + 30
        if part:
            parts.append(part)
        for n, p in enumerate(parts, 1):
            write_csv(UPLOAD / f"answers-{model}-{n}.csv", head, p)
        print(f"answers-{model}-1..{len(parts)}.csv: {len(rows)} answers, {len({r[1] for r in rows})} questions, "
              f"{len(rows) // 9 if rows else 0} bundles")

    # chunks: everything any exported model cited (the sheet appends only new ids)
    prev = UPLOAD / "chunks.csv"
    if prev.exists():
        with open(prev, encoding="utf-8", newline="") as f:
            used |= {r["id"] for r in csv.DictReader(f)}
    missing_chunks = sorted(i for i in used if i not in ch)
    write_csv(prev, ["id", "text"], [[i, cell(ch[i].get("text", ""))] for i in sorted(used) if i in ch])
    print(f"chunks.csv: {len(used) - len(missing_chunks)} chunks"
          + (f" ({len(missing_chunks)} cited ids not in the database: {missing_chunks[:3]})" if missing_chunks else ""))
    print(f"-> {UPLOAD}/  Drag these files into the Drive folder 'Gold Judge', then AinSutro -> Import files from Gold Judge folder in the Sheet.")


# ---------------------------------------------------------------- ratings in
def boolish(v, default):
    if v in (None, ""):
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "y")


def score_or_none(v):
    if v in (None, "", "null", "n/a", "na", "NA"):
        return None
    v = int(round(float(v)))
    if not 1 <= v <= 5:
        raise ValueError(f"score {v} not in 1-5")
    return v


def clean(r, rater):
    out = {"key": r["key"].strip(), "rater": rater,
           "correctness": score_or_none(r.get("correctness")),
           "faithfulness": score_or_none(r.get("faithfulness")),
           "technicality_fit": score_or_none(r.get("technicality_fit")),
           "language_ok": boolish(r.get("language_ok"), True), "refused": boolish(r.get("refused"), False),
           "note": (r.get("note") or r.get("reason") or "").strip(), "time": r.get("time", "")}
    if out["correctness"] is None:
        raise ValueError("correctness is required")
    return out


def all_answers():
    """key -> (model, answer) for every model run on disk."""
    out = {}
    for m in MODELS:
        for k, a in run_answers(m).items():
            out[k] = (m, a)
    return out


def pseudonym(rater):
    """Rater ids in the repo are anonymous: r-<hash of the Google email>. Names/emails stay in the private Sheet."""
    return "r-" + hashlib.sha256(rater.strip().lower().encode()).hexdigest()[:10]


def fetch_ratings():
    """All rows of the Sheet's Ratings tab, straight from the AinSutro store (data/human/api.json, not committed)."""
    cfg = json.loads((OUT / "api.json").read_text(encoding="utf-8"))
    req = urllib.request.Request(cfg["url"], data=json.dumps({"secret": cfg["secret"], "action": "admin_ratings"}).encode(),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:     # follows Google's redirect to the result
        out = json.loads(r.read())
    if out.get("error"):
        sys.exit("store refused: " + out["error"])
    return out["result"]


def store_call(action, data=None, timeout=360):
    """One admin call to the AinSutro store (data/human/api.json, not committed)."""
    cfg = json.loads((OUT / "api.json").read_text(encoding="utf-8"))
    body = {"secret": cfg["secret"], "action": action, "data": data or {}}
    for attempt in range(3):
        try:
            req = urllib.request.Request(cfg["url"], data=json.dumps(body, ensure_ascii=False).encode(),
                                         headers={"content-type": "text/plain;charset=utf-8"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                out = json.loads(r.read())
            break
        except Exception as e:  # noqa: BLE001 (Google sometimes answers 500 once; the import skips rows already in)
            if attempt == 2:
                raise
            print(f"  store call failed ({e}); retrying")
    if out.get("error"):
        sys.exit("store refused: " + out["error"])
    return out["result"]


def push(args):
    """Send the exported CSVs straight to the store (instead of the Drive folder), then build the queue."""
    names = ["questions.csv", "chunks.csv"] + sorted(p.name for p in UPLOAD.glob("answers-*.csv")
                                                    if not args.model or any(p.name.startswith(f"answers-{m}-") for m in args.model))
    for name in names:
        p = UPLOAD / name
        if not p.exists():
            sys.exit(f"missing {p}: run export first")
        with open(p, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.reader(f))
        head, body = rows[0], rows[1:]
        added, part, size = 0, [], 0
        for i, r in enumerate(body + [None]):
            if r is not None:
                part.append(r)
                size += sum(len(v.encode()) for v in r) + 20
            if part and (r is None or size > 1_500_000):
                res = store_call("admin_import_rows", {"name": name.split("-")[0].replace(".csv", ""), "rows": [head] + part})
                if res.get("left"):
                    sys.exit(f"{name}: the store stopped early ({res}); run push again (rows already in are skipped)")
                added += res["added"]
                part, size = [], 0
        print(f"{name}: {len(body)} rows, {added} new")
    print("new questions in the queue:", store_call("admin_build_queue")["added"])


def pull(args):
    if args.file:
        with open(args.file, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
    else:
        rows = fetch_ratings()
    known = all_answers()
    good, bad = [], []
    for r in rows:
        try:
            if not (r.get("rater") or "").strip():
                raise ValueError("no rater")
            c = clean(r, pseudonym(r["rater"]))
            if c["key"] not in known:
                raise ValueError("unknown key")
            good.append(c)
        except (ValueError, KeyError, TypeError) as e:
            bad.append((r.get("key"), str(e)))
    OUT.mkdir(parents=True, exist_ok=True)
    G.write_jsonl(OUT / "ratings.jsonl", good)       # the sheet is the source of truth: replace, don't append
    print(f"pulled {len(good)} human ratings from {len(rows)} rows"
          + (f", skipped {len(bad)}: {bad[:5]}" if bad else "") + f" -> {OUT}/ratings.jsonl")
    print("raters:", dict(Counter(c["rater"] for c in good)))


def load_human():
    """(key, rater) -> rating; later rows win (a rater who went Back and re-rated)."""
    latest = {}
    for r in S.read_jsonl(OUT / "ratings.jsonl") if (OUT / "ratings.jsonl").exists() else []:
        latest[(r["key"], r["rater"])] = r
    return latest


def load_claude():
    latest = {}
    for r in S.read_jsonl(OUT / "claude.jsonl") if (OUT / "claude.jsonl").exists() else []:
        latest[r["key"]] = r
    return latest


# ---------------------------------------------------------------- Claude
def claude_todo(known=None):
    """Keys Claude must score: every human-rated answer + the same question x setting for the other models."""
    known = known or all_answers()
    human = load_human()
    done = load_claude()
    cells = {(known[k][1]["id"], *setting(known[k][1])) for k, _ in human if k in known}
    by_cell = defaultdict(list)
    for k, (m, a) in known.items():
        if a.get("reply"):
            by_cell[(a["id"], *setting(a))].append((MODEL_ORDER.index(m), k))
    rank = priority(load_questions())
    todo = []
    for c in sorted(cells, key=lambda c: (rank.get(c[0], 10**6), EFFORTS.index(c[1]), TECHS.index(c[2]))):
        todo += [k for _, k in sorted(by_cell[c]) if k not in done]
    return todo


def claude_batch(args):
    known = all_answers()
    todo = claude_todo(known)
    if not todo:
        sys.exit("nothing for Claude to score (pull the human ratings first).")
    questions = load_questions()
    chunk = todo[: args.size]
    print(f"# Claude batch: {len(chunk)} of {len(todo)} answers still to score\n"
          "Score each answer with the j1 rubric (HUMAN_GUIDE.md). You don't see any human or judge scores.\n"
          "Output one JSON line per answer:\n"
          '{"key": "...", "correctness": 1-5, "faithfulness": 1-5 or null, "technicality_fit": 1-5 or null, '
          '"language_ok": true, "refused": false, "reason": "..."}\n')
    for k in chunk:
        m, a = known[k]
        q = questions[a["id"]]
        e, t = setting(a)
        print(f"=== {k}\n(expected handling: {q.get('expected_route', 'law')}"
              f"{', the user attached a file' if a.get('file') else ''}; language {q.get('lang')}; "
              f"technicality {t} = {S.TECH_HINT[t]}; effort {e})")
        h = history_text(q)
        if h:
            print("EARLIER CONVERSATION:", h)
        print("QUESTION:", q["question"])
        print("REFERENCE ANSWER:", q.get("reference_answer") or "(none)")
        print("SOURCE EXCERPTS:", S.excerpts_for(a, S.CONFIG["judge"]["excerpt_chars"]))
        print(f"--- ANSWER:\n{a.get('reply') or ''}\n")


def claude_add(args):
    known = all_answers()
    good, bad = [], []
    for r in S.read_jsonl(args.file):
        try:
            c = clean(r, "claude")
            if c["key"] not in known:
                raise ValueError("unknown key")
            c["time"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            good.append(c)
        except (ValueError, KeyError, TypeError) as e:
            bad.append((r.get("key"), str(e)))
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "claude.jsonl", "a", encoding="utf-8") as f:
        for c in good:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"claude: added {len(good)}" + (f", skipped {len(bad)}: {bad[:5]}" if bad else "")
          + f"; {len(claude_todo(known))} still to score")


# ---------------------------------------------------------------- status
def status(args):
    known = all_answers()
    human = load_human()
    keys = {k for k, _ in human}
    print(f"human ratings: {len(human)} (on {len(keys)} different answers), raters: "
          f"{dict(Counter(r for _, r in human))}")
    print("\nanswers rated by humans, per model (of answers on disk):")
    for m in MODELS:
        tot = sum(1 for k, (mm, _) in known.items() if mm == m)
        n = sum(1 for k in keys if k in known and known[k][0] == m)
        print(f"  {m:16s} {n:5d} / {tot}")
    twice = defaultdict(set)
    for k, r in human:
        twice[k].add(r)
    print(f"answers rated by 2+ people (agreement): {sum(len(v) >= 2 for v in twice.values())}")
    todo = claude_todo(known)
    print(f"\nClaude: {len(load_claude())} scored, {len(todo)} still to score "
          f"(~{len(todo) * 3 / 1000:.1f}M tokens at ~3k per answer)")


# ---------------------------------------------------------------- analyze
def judge80_by_key():
    h = S.judge_config_hash()
    out = {}
    for p in MODELS.values():
        for _, _, suffix in TESTS:
            f = RUNS / (p + suffix) / "judgments.jsonl"
            if f.exists():
                for j in S.read_jsonl(f):
                    if j.get("judge") == h and "error" not in j:
                        out[j["key"]] = j
    return out


def analyze(args):
    known = all_answers()
    human = load_human()
    claude = load_claude()
    j80 = judge80_by_key()
    model_of = {k: m for k, (m, _) in known.items()}
    qid_of = {k: a["id"] for k, (_, a) in known.items()}
    set_of = {k: setting(a) for k, (_, a) in known.items()}
    models = [m for m in MODEL_ORDER if any(model_of.get(k) == m for k, _ in human)]
    L = ["# Human scoring report\n",
         f"Human ratings: {len(human)} on {len({k for k, _ in human})} answers; Claude: {len(claude)}; "
         f"80B judge `{S.judge_config_hash()}`: {len(j80)} answers judged.\n"]
    res = {"judge_hash": S.judge_config_hash(), "metrics": {}}

    # coverage
    L.append("## Coverage (answers with at least one human rating)\n\n| model | "
             + " | ".join(f"{e}/{t}" for e in EFFORTS for t in TECHS) + " | total |\n|" + "---|" * 11)
    rated = {k for k, _ in human if k in known}
    for m in models:
        c = Counter(set_of[k] for k in rated if model_of[k] == m)
        L.append(f"| {m} | " + " | ".join(str(c[(e, t)]) for e in EFFORTS for t in TECHS) + f" | {sum(c.values())} |")

    for met in METRICS:
        R = res["metrics"][met] = {}
        hs = defaultdict(dict)                      # key -> rater -> score
        for (k, rater), r in human.items():
            if r.get(met) is not None and k in known:
                hs[k][rater] = r[met]
        gold = {k: sum(v.values()) / len(v) for k, v in hs.items() if v}
        if not gold:
            continue
        L.append(f"\n## {met}\n")

        # 1) human-human agreement (answers rated by 2+ people; first two raters)
        pairs = [tuple(v[r] for r in sorted(v)[:2]) for v in hs.values() if len(v) >= 2]
        if pairs:
            xs, ys = zip(*pairs)
            R["humans"] = {"n": len(pairs), "kappa": G.qwk(xs, ys),
                           "exact": sum(x == y for x, y in pairs) / len(pairs),
                           "within1": sum(abs(x - y) <= 1 for x, y in pairs) / len(pairs)}
            h = R["humans"]
            L.append("### Agreement between human raters\n\n| n | weighted κ | exact | within 1 |\n|---|---|---|---|\n"
                     f"| {h['n']} | {G.f2(h['kappa'])} | {h['exact']:.0%} | {h['within1']:.0%} |")

        # 2) judges vs human
        judges = {"80B judge": {k: j.get(met) for k, j in j80.items()},
                  "Claude": {k: r.get(met) for k, r in claude.items()}}
        L.append("\n### Judges vs humans (human score = mean of the raters)\n\n"
                 "| judge | n | Spearman ρ | weighted κ | mean diff (judge − human) | MAE |\n|---|---|---|---|---|---|")
        R["judges"] = {}
        for name, js in judges.items():
            both = [(js[k], gold[k], k) for k in gold if js.get(k) is not None]
            if len(both) < 3:
                L.append(f"| {name} | {len(both)} | | | | |")
                continue
            jv, gv, _ = zip(*both)
            d = [x - y for x, y in zip(jv, gv)]
            row = {"n": len(both), "spearman": G.spearman(list(jv), list(gv)),
                   "kappa": G.qwk(list(jv), [min(5, max(1, int(math.floor(g + 0.5)))) for g in gv]),
                   "mean_diff": sum(d) / len(d), "mae": sum(map(abs, d)) / len(d)}
            by_q = defaultdict(list)
            for x, y, k in both:
                by_q[qid_of[k]].append((x - y, model_of[k] == SELF_MODEL))

            def self_bias(groups):
                s = [d for g in groups for d, own in g if own]
                o = [d for g in groups for d, own in g if not own]
                return None if not s or not o else sum(s) / len(s) - sum(o) / len(o)
            groups = list(by_q.values())
            row["self_bias"], row["self_bias_ci"] = self_bias(groups), G.boot(groups, self_bias)
            row["diff_by_model"] = {}
            for mo in models:
                v = [x - y for x, y, k in both if model_of[k] == mo]
                row["diff_by_model"][mo] = sum(v) / len(v) if v else None
            R["judges"][name] = row
            L.append(f"| {name} | {row['n']} | {G.f2(row['spearman'])} | {G.f2(row['kappa'])} | "
                     f"{row['mean_diff']:+.2f} | {row['mae']:.2f} |")
        if R["judges"]:
            L.append(f"\n### Self-preference: does a judge over-rate the {SELF_MODEL} answers?\n\n"
                     "bias = mean(judge − human) on the 80B's answers − mean(judge − human) on the others; "
                     "95% CI by resampling questions. Empty until humans have rated 80B answers.\n\n"
                     "| judge | " + " | ".join(f"judge − human on {mo}" for mo in models)
                     + " | self-bias [95% CI] |\n|" + "---|" * (len(models) + 2))
            for name, row in R["judges"].items():
                L.append(f"| {name} | " + " | ".join(G.f2(row["diff_by_model"][mo]) for mo in models)
                         + f" | {G.f2(row['self_bias'])}{G.ci2(row['self_bias_ci'])} |")

        # 3) model means, on the PAIRED set: question x setting cells that humans rated for every model shown
        cells = defaultdict(dict)
        for k in gold:
            cells[(qid_of[k], *set_of[k])][model_of[k]] = k
        paired = {c: v for c, v in cells.items() if all(m in v for m in models)}
        sources = [("humans", gold)] + [(n, {k: v for k, v in js.items() if v is not None})
                                        for n, js in judges.items()]
        L.append(f"\n### Model means on the same answers ({len(paired)} question×setting cells rated for all of "
                 f"{', '.join(models)}), 95% CI over questions\n\n| source | " + " | ".join(models) + " |\n|"
                 + "---|" * (len(models) + 1))
        R["ranking"] = {}
        for name, src in sources:
            row, R["ranking"][name] = [], {}
            for mo in models:
                by_q = defaultdict(list)
                for c, v in paired.items():
                    if src.get(v[mo]) is not None:
                        by_q[c[0]].append(src[v[mo]])
                groups = list(by_q.values())
                mean = G.mean_of_groups(groups)
                ci = G.boot(groups, G.mean_of_groups) if groups else None
                R["ranking"][name][mo] = {"mean": mean, "ci": ci, "n": sum(map(len, groups))}
                row.append(f"{G.f2(mean)}{G.ci2(ci)}")
            L.append(f"| {name} | " + " | ".join(row) + " |")

        # 4) human means by setting, per model (all rated answers)
        L.append(f"\n### Human means by setting ({met})\n\n| model | "
                 + " | ".join([f"effort {e}" for e in EFFORTS] + [f"tech {t}" for t in TECHS]) + " |\n|" + "---|" * 7)
        for mo in models:
            cellsv = []
            for i, val in enumerate(EFFORTS + TECHS):
                pos = 0 if i < 3 else 1
                v = [g for k, g in gold.items() if model_of[k] == mo and set_of[k][pos] == val]
                cellsv.append(f"{G.f2(sum(v) / len(v) if v else None)} (n={len(v)})")
            L.append(f"| {mo} | " + " | ".join(cellsv) + " |")

    (OUT / "report.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    print("\n".join(L))
    print(f"\n-> {OUT}/report.md")


# ---------------------------------------------------------------- cli
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("export")
    p.add_argument("--model", action="append", choices=list(MODELS), required=True)
    p.add_argument("--allow-partial", action="store_true", help="export an unfinished run (testing only)")
    p = sub.add_parser("pull")
    p.add_argument("file", nargs="?", help="the Sheet's Ratings tab saved as CSV (default: fetch it from the store)")
    p = sub.add_parser("push", help="send the exported CSVs straight to the store (no Drive upload)")
    p.add_argument("--model", action="append", choices=list(MODELS), help="only this model's answers (default: all exported)")
    sub.add_parser("status")
    p = sub.add_parser("claude-batch")
    p.add_argument("--size", type=int, default=20)
    p = sub.add_parser("claude-add")
    p.add_argument("file")
    sub.add_parser("analyze")
    a = ap.parse_args()
    {"export": export, "push": push, "pull": pull, "status": status, "claude-batch": claude_batch, "claude-add": claude_add,
     "analyze": analyze}[a.cmd](a)


if __name__ == "__main__":
    main()
