"""
Gold standard: humans + Claude rate a BLIND sample of the three models' answers, to check the 80B judge
(eval/config.json) and to measure whether it favours its own answers (self-preference bias).

    python3 gold.py sample                      # build data/gold/sample.jsonl + key.json (once; fixed seed)
    python3 gold.py batch 1 --size 10           # print questions 1-10 for Claude to rate (blind)
    python3 gold.py add claude ratings.jsonl    # add Claude's ratings  (JSONL: aid, correctness, ...)
    python3 gold.py import R1 ratings_R1.csv    # add a human rater's CSV, exported from gold.html
    python3 gold.py status                      # who has rated how much
    python3 gold.py analyze                     # agreement, judge accuracy, self-preference -> report.md

Design (see GOLD_GUIDE.md):
  - 150 questions (120 law from test.jsonl, 30 from test_files.jsonl), one setting: effort mid, technicality auto.
  - Each question shows its 3 answers (Gemma 4 E4B, Qwen3 30B, Qwen3-Next 80B) in random order as A/B/C.
    Model names never appear in sample.jsonl; the mapping is only in key.json (don't open it while rating).
  - Every question is rated by 2 of the 3 human raters (R1+R2, R2+R3 or R1+R3) and by Claude.
  - Same rubric as the 80B judge (prompt j1): correctness 1-5, faithfulness 1-5 or null, language_ok, refused.
Uses only the Python standard library, plus helpers from score.py.
"""
import argparse
import csv
import json
import math
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import score as S  # noqa: E402

GOLD = HERE / "data" / "gold"
RUNS = HERE / "runs"
MODELS = {"gemma": "B0/gemma", "qwen3-30b": "B0/qwen3-30b", "qwen3-next-80b": "B0/qwen3-next-80b"}
SELF_MODEL = "qwen3-next-80b"          # the model that is also the judge
RATERS = ["R1", "R2", "R3"]
PAIRS = [("R1", "R2"), ("R2", "R3"), ("R1", "R3")]
EFFORT, TECH = "mid", "auto"
METRICS = ["correctness", "faithfulness"]
SEED = 23


# ---------------------------------------------------------------- helpers
def write_jsonl(p, rows):
    with open(p, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def answers_at_setting(run_dir):
    out = {}
    for a in S.read_jsonl(Path(run_dir) / "answers.jsonl"):
        st = a["settings"]
        if st["effort"] == EFFORT and st["technicality"] == TECH:
            out[a["id"]] = a
    return out


def pick_balanced(ids, cell_of, n, rng):
    """Round-robin over strata cells so every cell is represented as evenly as possible."""
    cells = defaultdict(list)
    for i in ids:
        cells[cell_of(i)].append(i)
    for c in cells.values():
        rng.shuffle(c)
    order = sorted(cells)
    picked = []
    while len(picked) < n and any(cells.values()):
        for c in order:
            if cells[c] and len(picked) < n:
                picked.append(cells[c].pop())
    return picked


def model_runs(args):
    runs = dict(MODELS)
    for spec in args.models or []:          # --models name=path (tests / other runs)
        k, v = spec.split("=", 1)
        runs[k] = v
    return runs


# ---------------------------------------------------------------- sample
def sample(args):
    gold = Path(args.gold_dir)
    if (gold / "sample.jsonl").exists() and not args.force:
        sys.exit(f"{gold}/sample.jsonl exists; the sample is fixed once made. Use --force only if nobody rated yet.")
    gold.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    runs = model_runs(args)
    items, key = [], {}
    for test_name, test_path, suffix, n in (("law", HERE / "data" / "test.jsonl", "", args.law),
                                            ("files", HERE / "data" / "test_files.jsonl", "-files", args.files)):
        tests = S.load_test(test_path)
        per_model = {m: answers_at_setting(RUNS / (p + suffix)) for m, p in runs.items()}
        common = [i for i in tests if all(i in per_model[m] and per_model[m][i].get("reply") for m in runs)]
        if len(common) < n:
            print(f"warning: {test_name}: only {len(common)} questions have answers from all models")
        if test_name == "law":
            special = [i for i in common if tests[i].get("type", "generated") != "generated"]
            gen = [i for i in common if i not in set(special)]
            n_special = min(len(special), max(3 * len({tests[i]["type"] for i in special}), n // 6))
            chosen = pick_balanced(special, lambda i: tests[i]["type"], n_special, rng)
            chosen += pick_balanced(gen, lambda i: (tests[i].get("domain") or "-", tests[i]["lang"]),
                                    n - len(chosen), rng)
        else:
            chosen = pick_balanced(common, lambda i: (tests[i].get("domain") or "-", tests[i]["lang"]), n, rng)
        for qid in chosen:
            q = tests[qid]
            answers = [(m, per_model[m][qid]) for m in runs]
            rng.shuffle(answers)
            ex = [S.excerpts_for(a, S.CONFIG["judge"]["excerpt_chars"]) for _, a in answers]
            items.append({"test": test_name, "qid_test": qid, "question": q["question"], "lang": q["lang"],
                          "expected_route": q.get("expected_route", "law"), "file": q.get("file"),
                          "reference": q.get("reference_answer") or "(none)", "technicality": TECH,
                          "excerpts": ex[0], "same_excerpts": all(e == ex[0] for e in ex),
                          "answers": [{"label": "ABC"[k], "answer": a.get("reply") or "",
                                       **({} if ex[k] == ex[0] else {"excerpts": ex[k]})}
                                      for k, (_, a) in enumerate(answers)],
                          "_models": [m for m, _ in answers], "_keys": [a["key"] for _, a in answers]})
    rng.shuffle(items)
    out = []
    for n, it in enumerate(items, 1):
        gid = f"G{n:03d}"
        key[gid] = {"test": it["test"], "test_id": it.pop("qid_test"),
                    "answers": {f"{gid}-{a['label']}": {"model": m, "key": k}
                                for a, m, k in zip(it["answers"], it.pop("_models"), it.pop("_keys"))}}
        for a in it["answers"]:
            a["aid"] = f"{gid}-{a['label']}"
        out.append({"gid": gid, "raters": list(PAIRS[(n - 1) % 3]), **it})
    write_jsonl(gold / "sample.jsonl", out)
    (gold / "key.json").write_text(json.dumps(key, indent=1, ensure_ascii=False), encoding="utf-8")
    load = Counter(r for it in out for r in it["raters"])
    print(f"sample: {len(out)} questions, {3 * len(out)} answers -> {gold}/sample.jsonl (+ key.json)")
    print("  by test:", dict(Counter(it["test"] for it in out)), " by language:", dict(Counter(it["lang"] for it in out)))
    print("  questions per rater:", dict(load), " (each question has 3 answers)")
    print("  different excerpts between answers:", sum(not it["same_excerpts"] for it in out))


# ---------------------------------------------------------------- Claude batches
def batch(args):
    items = S.read_jsonl(Path(args.gold_dir) / "sample.jsonl")
    lo = (args.n - 1) * args.size
    chunk = items[lo: lo + args.size]
    if not chunk:
        sys.exit(f"no batch {args.n} (sample has {len(items)} questions)")
    print(f"# Gold batch {args.n}: questions {lo + 1}-{lo + len(chunk)} of {len(items)}\n"
          "Rate every answer with the j1 rubric (GOLD_GUIDE.md). Output one JSON line per answer:\n"
          '{"aid": "G001-A", "correctness": 1-5, "faithfulness": 1-5 or null, "language_ok": true, '
          '"refused": false, "reason": "..."}\n')
    for it in chunk:
        print(f"=== {it['gid']}  (expected handling: {it['expected_route']}"
              f"{', the user attached a file' if it.get('file') else ''}; language {it['lang']})")
        print("QUESTION:", it["question"])
        print("REFERENCE ANSWER:", it["reference"])
        print("SOURCE EXCERPTS:", it["excerpts"])
        for a in it["answers"]:
            if a.get("excerpts"):
                print(f"(answer {a['label']} was given different excerpts:)", a["excerpts"])
            print(f"--- ANSWER {a['aid']}:\n{a['answer']}\n")


# ---------------------------------------------------------------- ratings in
def clean_rating(r, rater):
    def score_or_none(v):
        if v in (None, "", "null", "n/a", "na"):
            return None
        v = int(round(float(v)))
        if not 1 <= v <= 5:
            raise ValueError(f"score {v} not in 1-5")
        return v

    def boolish(v, default):
        if v in (None, ""):
            return default
        return str(v).strip().lower() in ("1", "true", "yes", "y")

    out = {"aid": r["aid"].strip(), "rater": rater, "correctness": score_or_none(r.get("correctness")),
           "faithfulness": score_or_none(r.get("faithfulness")),
           "language_ok": boolish(r.get("language_ok"), True), "refused": boolish(r.get("refused"), False),
           "notes": (r.get("notes") or r.get("reason") or "").strip()}
    if out["correctness"] is None:
        raise ValueError("correctness is required")
    return out


def store(args, rater, rows):
    gold = Path(args.gold_dir)
    valid = {a["aid"] for it in S.read_jsonl(gold / "sample.jsonl") for a in it["answers"]}
    good, bad = [], []
    for r in rows:
        try:
            c = clean_rating(r, rater)
            if c["aid"] not in valid:
                raise ValueError("unknown aid")
            good.append(c)
        except (ValueError, KeyError, TypeError) as e:
            bad.append((r.get("aid"), str(e)))
    with open(gold / "ratings.jsonl", "a", encoding="utf-8") as f:
        for c in good:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"{rater}: added {len(good)} ratings" + (f", skipped {len(bad)}: {bad[:5]}" if bad else ""))


def add(args):
    store(args, args.rater, S.read_jsonl(args.file))


def import_csv(args):
    if args.rater not in RATERS:
        sys.exit(f"rater must be one of {RATERS}")
    with open(args.file, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("correctness") or "").strip()]
    store(args, args.rater, rows)


def load_ratings(gold):
    latest = {}
    for r in S.read_jsonl(gold / "ratings.jsonl"):
        latest[(r["aid"], r["rater"])] = r          # later lines win (re-imports)
    return latest


def status(args):
    gold = Path(args.gold_dir)
    items = S.read_jsonl(gold / "sample.jsonl")
    rat = load_ratings(gold)
    for rater in RATERS + ["claude"]:
        todo = [a["aid"] for it in items for a in it["answers"] if rater == "claude" or rater in it["raters"]]
        done = sum((aid, rater) in rat for aid in todo)
        print(f"{rater:7s} {done:4d}/{len(todo)}")


# ---------------------------------------------------------------- statistics
def qwk(xs, ys, k=5):
    """Quadratic weighted Cohen's kappa for paired ratings on 1..k."""
    n = len(xs)
    if n == 0:
        return None
    obs = [[0] * k for _ in range(k)]
    for x, y in zip(xs, ys):
        obs[x - 1][y - 1] += 1
    hx = [sum(r) for r in obs]
    hy = [sum(obs[i][j] for i in range(k)) for j in range(k)]
    num = den = 0.0
    for i in range(k):
        for j in range(k):
            w = (i - j) ** 2 / (k - 1) ** 2
            num += w * obs[i][j]
            den += w * hx[i] * hy[j] / n
    return 1.0 if den == 0 else 1 - num / den


def ranks(v):
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(v):
        j = i
        while j + 1 < len(v) and v[order[j + 1]] == v[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def pearson(x, y):
    n = len(x)
    if n < 3:
        return None
    mx, my = sum(x) / n, sum(y) / n
    sx = math.sqrt(sum((a - mx) ** 2 for a in x))
    sy = math.sqrt(sum((b - my) ** 2 for b in y))
    return None if sx == 0 or sy == 0 else sum((a - mx) * (b - my) for a, b in zip(x, y)) / (sx * sy)


def spearman(x, y):
    return pearson(ranks(x), ranks(y))


def boot(groups, stat, resamples=1000, seed=7):
    """95% CI of stat(list_of_groups) resampling question groups."""
    rng = random.Random(seed)
    vals = []
    for _ in range(resamples):
        v = stat([groups[rng.randrange(len(groups))] for _ in groups])
        if v is not None:
            vals.append(v)
    if not vals:
        return None
    vals.sort()
    return vals[int(0.025 * len(vals))], vals[int(0.975 * len(vals)) - 1]


def f2(v):
    return "–" if v is None else f"{v:.2f}"


def ci2(c):
    return "" if not c else f" [{c[0]:.2f}, {c[1]:.2f}]"


def mean_of_groups(groups):
    flat = [x for g in groups for x in g]
    return sum(flat) / len(flat) if flat else None


# ---------------------------------------------------------------- analyze
def judge80(key, runs):
    """aid -> the 80B judge's scores (current judge config only)."""
    h = S.judge_config_hash()
    by_key = {}
    for p in set(runs.values()):
        for suffix in ("", "-files"):
            for j in S.read_jsonl(RUNS / (p + suffix) / "judgments.jsonl"):
                if j.get("judge") == h and "error" not in j:
                    by_key[j["key"]] = j
    out = {}
    for g in key.values():
        for aid, a in g["answers"].items():
            if a["key"] in by_key:
                out[aid] = by_key[a["key"]]
    return out


def analyze(args):
    gold = Path(args.gold_dir)
    key = json.loads((gold / "key.json").read_text(encoding="utf-8"))
    items = {it["gid"]: it for it in S.read_jsonl(gold / "sample.jsonl")}
    rat = load_ratings(gold)
    model_of = {aid: a["model"] for g in key.values() for aid, a in g["answers"].items()}
    gid_of = {aid: aid.split("-")[0] for aid in model_of}
    j80 = judge80(key, model_runs(args))
    models = sorted(set(model_of.values()))
    L = ["# Gold-standard report\n",
         f"Sample: {len(items)} questions × 3 answers = {len(model_of)} answers (effort {EFFORT}, technicality {TECH}). "
         f"80B judge config `{S.judge_config_hash()}`: {len(j80)} answers judged.\n"]
    res = {"n_items": len(items), "judge_hash": S.judge_config_hash(), "metrics": {}}

    for m in METRICS:
        R = res["metrics"][m] = {}
        human = defaultdict(dict)                     # aid -> rater -> score
        for (aid, rater), r in rat.items():
            if rater in RATERS and r.get(m) is not None:
                human[aid][rater] = r[m]
        gold_score = {aid: sum(v.values()) / len(v) for aid, v in human.items() if v}

        # 1) agreement between the human raters
        L.append(f"\n## {m}\n\n### Agreement between human raters\n\n"
                 "| pair | n | weighted κ | exact | within 1 |\n|---|---|---|---|---|")
        R["humans"] = {}
        for a, b in PAIRS:
            pairs = [(v[a], v[b]) for v in human.values() if a in v and b in v]
            if pairs:
                xs, ys = zip(*pairs)
                k = qwk(xs, ys)
                ex = sum(x == y for x, y in pairs) / len(pairs)
                w1 = sum(abs(x - y) <= 1 for x, y in pairs) / len(pairs)
                R["humans"][f"{a}-{b}"] = {"n": len(pairs), "kappa": k, "exact": ex, "within1": w1}
                L.append(f"| {a}–{b} | {len(pairs)} | {f2(k)} | {ex:.0%} | {w1:.0%} |")

        # 2) each judge against the human gold score
        judges = {"80B judge": {aid: j.get(m) for aid, j in j80.items()},
                  "Claude": {aid: r.get(m) for (aid, rr), r in rat.items() if rr == "claude"}}
        L.append("\n### Judges vs human gold (mean of the 2 raters)\n\n"
                 "| judge | n | Spearman ρ | weighted κ (vs rounded gold) | mean diff (judge − gold) | MAE |\n"
                 "|---|---|---|---|---|---|")
        R["judges"] = {}
        for name, js in judges.items():
            both = [(js[aid], gold_score[aid], aid) for aid in gold_score if js.get(aid) is not None]
            if not both:
                L.append(f"| {name} | 0 | | | | |")
                continue
            jv, gv, _ = zip(*both)
            d = [x - y for x, y in zip(jv, gv)]
            row = {"n": len(both), "spearman": spearman(list(jv), list(gv)),
                   "kappa": qwk(list(jv), [min(5, max(1, int(math.floor(g + 0.5)))) for g in gv]),
                   "mean_diff": sum(d) / len(d), "mae": sum(map(abs, d)) / len(d)}
            # 3) self-preference: (judge - gold) on the 80B's answers minus on the other models' answers
            by_g = defaultdict(list)
            for x, y, aid in both:
                by_g[gid_of[aid]].append((x - y, model_of[aid] == SELF_MODEL))

            def self_bias(groups):
                s = [d for g in groups for d, own in g if own]
                o = [d for g in groups for d, own in g if not own]
                return None if not s or not o else sum(s) / len(s) - sum(o) / len(o)
            groups = list(by_g.values())
            row["self_bias"], row["self_bias_ci"] = self_bias(groups), boot(groups, self_bias)
            row["diff_by_model"] = {}
            for mo in models:
                v = [x - y for x, y, aid in both if model_of[aid] == mo]
                row["diff_by_model"][mo] = sum(v) / len(v) if v else None
            R["judges"][name] = row
            L.append(f"| {name} | {row['n']} | {f2(row['spearman'])} | {f2(row['kappa'])} | "
                     f"{row['mean_diff']:+.2f} | {row['mae']:.2f} |")
        L.append(f"\n### Self-preference: does a judge over-rate the {SELF_MODEL} answers?\n\n"
                 "bias = mean(judge − gold) on the 80B's answers − mean(judge − gold) on the other answers; "
                 "95% CI by resampling questions. A CI that excludes 0 means a real bias. Claude is the control.\n\n"
                 "| judge | " + " | ".join(f"judge − gold on {mo}" for mo in models) + " | self-bias [95% CI] |\n|"
                 + "---|" * (len(models) + 2))
        for name, row in R["judges"].items():
            L.append(f"| {name} | " + " | ".join(f2(row["diff_by_model"][mo]) for mo in models)
                     + f" | {f2(row['self_bias'])}{ci2(row['self_bias_ci'])} |")

        # 4) model means by each source (human gold, 80B judge, Claude)
        L.append(f"\n### Model means ({m}), 95% CI over questions\n\n| source | " + " | ".join(models) + " |\n|"
                 + "---|" * (len(models) + 1))
        R["ranking"] = {}
        sources = [("human gold", gold_score)] + [(n, {a: v for a, v in js.items() if v is not None})
                                                  for n, js in judges.items()]
        for name, src in sources:
            cells, R["ranking"][name] = [], {}
            for mo in models:
                by_g = defaultdict(list)
                for aid, v in src.items():
                    if model_of.get(aid) == mo:
                        by_g[gid_of[aid]].append(v)
                groups = list(by_g.values())
                mean, ci = mean_of_groups(groups), boot(groups, mean_of_groups) if groups else None
                R["ranking"][name][mo] = {"mean": mean, "ci": ci, "n": sum(map(len, groups))}
                cells.append(f"{f2(mean)}{ci2(ci)}")
            L.append(f"| {name} | " + " | ".join(cells) + " |")

    (gold / "report.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    (gold / "report.json").write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    print("\n".join(L))
    print(f"\n-> {gold}/report.md")


# ---------------------------------------------------------------- cli
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gold-dir", default=str(GOLD))
    ap.add_argument("--model", dest="models", action="append",
                    help="override a run folder: name=B0/xyz (relative to runs/); repeatable")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("sample")
    p.add_argument("--law", type=int, default=120)
    p.add_argument("--files", type=int, default=30)
    p.add_argument("--force", action="store_true")
    p = sub.add_parser("batch")
    p.add_argument("n", type=int)
    p.add_argument("--size", type=int, default=10)
    p = sub.add_parser("add")
    p.add_argument("rater")
    p.add_argument("file")
    p = sub.add_parser("import")
    p.add_argument("rater")
    p.add_argument("file")
    sub.add_parser("status")
    sub.add_parser("analyze")
    a = ap.parse_args()
    {"sample": sample, "batch": batch, "add": add, "import": import_csv, "status": status, "analyze": analyze}[a.cmd](a)


if __name__ == "__main__":
    main()
