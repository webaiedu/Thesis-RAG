"""
Search-model benchmark: how well does retrieval find the gold section/case for each test question?

    python3 eval_retrieval.py --url http://localhost:8000 --test data/test.jsonl --out runs/B0/retrieval.json

Two search scopes (both reported):
  oracle  search only the question's gold domain   -> pure embedding quality
  all     search every domain at once              -> embedding quality without routing help

Two ways to count a hit:
  chunk   the exact gold chunk id
  group   any chunk of the same statute section, or of the same court case (lenient)

Metrics at each k: Hit@k (gold found in top k), Recall@k (share of gold items found),
plus MRR@10 and nDCG@10. Broken down by domain, language, kind (act/case) and type.
Questions without gold chunks (general / out-of-scope) are skipped here.
Uses only the Python standard library.
"""
import argparse
import json
import math
import re
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from make_questions import load_chunks  # noqa: E402  (same group keys as the split)


def search(url, query, domains, k):
    body = {"query": query, "k": k}
    if domains:
        body["domains"] = domains
    req = urllib.request.Request(url.rstrip("/") + "/search", data=json.dumps(body).encode("utf-8"),
                                 headers={"content-type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())["results"]
        except Exception:
            if attempt == 2:
                raise


def metrics(ranked, gold, ks):
    """ranked: list of keys in result order; gold: set of keys."""
    out = {}
    first = next((i for i, x in enumerate(ranked) if x in gold), None)
    for k in ks:
        top = ranked[:k]
        out[f"hit@{k}"] = float(any(x in gold for x in top))
        out[f"recall@{k}"] = len(gold & set(top)) / len(gold)
    out["mrr@10"] = 1 / (first + 1) if first is not None and first < 10 else 0.0
    dcg = sum(1 / math.log2(i + 2) for i, x in enumerate(dict.fromkeys(ranked[:10])) if x in gold)
    idcg = sum(1 / math.log2(i + 2) for i in range(min(len(gold), 10)))
    out["ndcg@10"] = dcg / idcg if idcg else 0.0
    out["rank"] = first + 1 if first is not None else None
    return out


def mean(rows, key):
    xs = [r[key] for r in rows]
    return sum(xs) / len(xs) if xs else 0.0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--test", required=True)
    ap.add_argument("--k", default="1,3,5,8,10", help="cut-offs (3/5/8 = top-k of effort low/mid/high)")
    ap.add_argument("--scopes", default="oracle,all")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    ks = sorted({int(x) for x in a.k.split(",")} | {10})
    K = max(ks)

    group_of = {c["id"]: c["_group"] for c in load_chunks()}
    tests = [json.loads(l) for l in open(a.test, encoding="utf-8") if l.strip()]
    tests = [q for q in tests if q.get("gold_chunk_ids")]
    missing = {g for q in tests for g in q["gold_chunk_ids"] if g not in group_of}
    if missing:
        sys.exit(f"gold chunk ids not in backend/data: {sorted(missing)[:5]} ... (data changed since the test set?)")
    print(f"{len(tests)} questions with gold chunks, k={ks}, url={a.url}")

    rows = []
    for scope in a.scopes.split(","):
        def run(q):
            hits = search(a.url, q["question"], [q["domain"]] if scope == "oracle" else None, K)
            ids = [h["id"] for h in hits]
            gold_ids = set(q["gold_chunk_ids"])
            groups = [group_of.get(i, i) for i in ids]
            r = {"id": q["id"], "scope": scope, "domain": q["domain"], "lang": q["lang"],
                 "kind": q.get("kind", "act"), "type": q.get("type", "generated"),
                 "top": ids, "scores": [round(h["score"], 4) for h in hits]}
            for name, ranked, gold in (("chunk", ids, gold_ids),
                                       ("group", groups, {group_of[g] for g in gold_ids})):
                for m, v in metrics(ranked, gold, ks).items():
                    r[f"{name}_{m}"] = v
            return r
        with ThreadPoolExecutor(a.workers) as ex:
            rows += list(ex.map(run, tests))

    metric_keys = [f"{u}_{m}" for u in ("chunk", "group")
                   for m in [f"hit@{k}" for k in ks] + [f"recall@{k}" for k in ks] + ["mrr@10", "ndcg@10"]]
    summary = {}
    for scope in a.scopes.split(","):
        sr = [r for r in rows if r["scope"] == scope]
        summary[scope] = {"overall": {"n": len(sr), **{m: round(mean(sr, m), 4) for m in metric_keys}}}
        for dim in ("domain", "lang", "kind", "type"):
            groups = defaultdict(list)
            for r in sr:
                groups[r[dim]].append(r)
            summary[scope][dim] = {g: {"n": len(v), **{m: round(mean(v, m), 4) for m in metric_keys}}
                                   for g, v in sorted(groups.items())}

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"url": a.url, "test": a.test, "k": ks, "summary": summary, "questions": rows},
                              ensure_ascii=False, indent=1), encoding="utf-8")

    show = ["hit@1", "hit@3", "hit@5", "hit@10", "mrr@10", "ndcg@10"]
    show = [m for m in show if m.split("@")[0] in ("mrr", "ndcg") or int(m.split("@")[1]) in ks]
    for scope, s in summary.items():
        print(f"\n== scope: {scope}   (group = same section/case counts as found)")
        print(f"{'':22s} {'n':>4s} " + " ".join(f"{m:>9s}" for m in show))
        lines = [("overall", s["overall"])] + [(f"{dim}:{g}", v) for dim in ("domain", "lang", "kind")
                                               for g, v in s[dim].items()]
        for label, v in lines:
            print(f"{label:22s} {v['n']:4d} " + " ".join(f"{v['group_' + m]:9.3f}" for m in show))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
