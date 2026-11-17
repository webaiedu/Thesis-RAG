"""
Measure FALLBACK_MIN_SCORE (backend/.env) from data instead of guessing.

    python calibrate.py                    # uses calibration/questions.jsonl
    python calibrate.py my_questions.jsonl

Stop server.py first (Chroma allows one process per database folder).

Each line of the question file: {"question": "...", "domain": "<correct domain id>"}
plus optional "also": ["<other domain that is also a correct answer>", ...].

For every question the best (top-1) cosine score is taken from every domain:
  * positive = best score in the correct domain   -> should be >= threshold (no fallback)
  * negative = best score in each wrong domain    -> should be <  threshold (fallback runs)
The fallback domain itself is never counted. The script prints the score ranges,
sweeps thresholds and recommends the one with the best balanced accuracy.
Results go to calibration/results.csv (per question) and calibration/sweep.csv.
"""
import csv
import json
import os
import statistics
import sys

import chromadb

import common

FALLBACK = os.getenv("FALLBACK_DOMAIN", "uncategorized").strip().lower()
OUT = common.HERE / "calibration"


def summary(xs):
    if not xs:
        return "n=0"
    return (f"n={len(xs):3d}  min={min(xs):.3f}  median={statistics.median(xs):.3f}  "
            f"max={max(xs):.3f}")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    qfile = sys.argv[1] if len(sys.argv) > 1 else OUT / "questions.jsonl"
    with open(qfile, encoding="utf-8") as f:
        qs = [json.loads(l) for l in f if l.strip()]

    domains = json.loads(common.DOMAINS_FILE.read_text(encoding="utf-8"))
    for d, meta in domains.items():
        if meta.get("model") != common.MODEL_NAME:
            raise SystemExit(f"'{d}' was embedded with {meta.get('model')}, EMBED_MODEL is "
                             f"{common.MODEL_NAME}. Run ingest.py --force first.")
    unknown = {q["domain"] for q in qs} - set(domains)
    if unknown:
        raise SystemExit(f"Unknown domain(s) in {qfile}: {sorted(unknown)}")

    client = chromadb.PersistentClient(path=common.DB_DIR)
    cols = {d: client.get_collection(common.collection_name(d)) for d in domains}

    print(f"Model: {common.MODEL_NAME}   questions: {len(qs)}   domains: {list(domains)}")
    vecs = common.embed([q["question"] for q in qs], common.QUERY_PREFIX)

    rows, pos, neg = [], [], []
    per_domain = {d: ([], []) for d in domains}
    for q, v in zip(qs, vecs):
        ok = {q["domain"], *q.get("also", [])}
        best = {}
        for d, col in cols.items():
            r = col.query(query_embeddings=[v], n_results=1, include=["distances", "metadatas"])
            best[d] = (round(1 - r["distances"][0][0], 4), r["metadatas"][0][0].get("act", ""))
        for d, (score, act) in best.items():
            kind = "fallback" if d == FALLBACK else ("positive" if d in ok else "negative")
            rows.append({"question": q["question"], "correct": q["domain"], "domain": d,
                         "kind": kind, "score": score, "top_act": act})
            if kind == "positive" and d == q["domain"]:
                pos.append(score)
                per_domain[d][0].append(score)
            elif kind == "negative":
                neg.append(score)
                per_domain[q["domain"]][1].append(score)

    print("\nTop-1 scores")
    print(f"  correct domain : {summary(pos)}")
    print(f"  wrong domains  : {summary(neg)}")
    print("\nBy question domain (correct | best wrong-domain scores)")
    for d, (p, n) in per_domain.items():
        if p:
            print(f"  {d:15s} correct {min(p):.3f}-{max(p):.3f}   wrong {min(n):.3f}-{max(n):.3f}")

    sweep = []
    for i in range(30, 81):
        t = i / 100
        tpr = sum(s >= t for s in pos) / len(pos)  # correct domain trusted, no fallback
        tnr = sum(s < t for s in neg) / len(neg)   # wrong domain detected, fallback runs
        sweep.append({"threshold": t, "positives_kept": round(tpr, 4),
                      "negatives_caught": round(tnr, 4), "balanced_acc": round((tpr + tnr) / 2, 4)})
    top = max(s["balanced_acc"] for s in sweep)
    ties = [s["threshold"] for s in sweep if s["balanced_acc"] == top]
    best_t = round(statistics.median(ties), 2)  # middle of the best plateau

    print("\nthreshold  positives_kept  negatives_caught  balanced_acc")
    for s in sweep:
        if 0.40 <= s["threshold"] <= 0.70:
            mark = "  <-" if s["threshold"] == best_t else ""
            print(f"   {s['threshold']:.2f}        {s['positives_kept']:6.1%}          "
                  f"{s['negatives_caught']:6.1%}         {s['balanced_acc']:6.1%}{mark}")
    gap = min(pos) > max(neg)
    print(f"\nClasses {'fully separate' if gap else 'overlap'}: lowest correct {min(pos):.3f}, "
          f"highest wrong {max(neg):.3f}")
    print(f"Recommended FALLBACK_MIN_SCORE = {best_t}  (balanced accuracy {top:.1%})")

    OUT.mkdir(exist_ok=True)
    with open(OUT / "results.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    with open(OUT / "sweep.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(sweep[0]))
        w.writeheader()
        w.writerows(sweep)
    print(f"Wrote {OUT / 'results.csv'} and {OUT / 'sweep.csv'}")


if __name__ == "__main__":
    main()
