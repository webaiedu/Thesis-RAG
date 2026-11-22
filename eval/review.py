"""
Hand-check the generated test questions in a spreadsheet, then build the final test set.

1. Export the candidates to a sheet (opens in LibreOffice Calc / Excel / Google Sheets):
       python review.py export data/test_candidates.jsonl data/review/test_review.csv
   Also creates data/review/handwritten.csv (empty template) for your own questions.

2. The team fills in the sheets (see eval/REVIEW_GUIDE.md):
   - decision: keep | fix | drop      (every row needs one; empty = not reviewed yet)
   - question_fixed / answer_fixed:   only when decision = fix
   - extra_gold_chunk_ids:            other chunks that also answer it, separated by ";"
   - reviewer, notes
   - recheck = yes: rows a second reviewer must check; they fill team_decision
     (agree = keep the first decision | keep | fix | drop). import prefers team_decision.

   Older sheets without recheck/team_decision:   python review.py add-cols data/review/test_review.csv
   Mark rows for the recheck (all fix/drop + a reproducible random share of keeps):
       python review.py mark-recheck data/review/test_review.csv --handwritten data/review/handwritten.csv --keep-frac 0.2 --seed 42

3. Find chunk ids for extra gold sections or hand-written questions (retrieval server running):
       python review.py find "punishment for theft" --domain criminal

4. Build the final test set (writes data/test.jsonl + data/test.stats.txt with its sha256):
       python review.py import data/review/test_review.csv --handwritten data/review/handwritten.csv
   Add --partial to build from the rows reviewed so far (for a trial run).

Save the sheets as CSV (UTF-8, comma separated) when you're done.
"""
import argparse
import csv
import hashlib
import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "retrieval"))
from common import domain_id  # noqa: E402

DATA_DIR = HERE.parent / "backend" / "data"

REVIEW_COLS = ["id", "domain", "kind", "lang", "law_or_case", "section", "question", "reference_answer",
               "decision", "question_fixed", "answer_fixed", "extra_gold_chunk_ids", "reviewer", "notes",
               "recheck", "team_decision", "source_text", "gold_chunk_ids"]

HAND_COLS = ["question", "lang", "type", "expected_route", "domain", "gold_chunk_ids", "reference_answer",
             "reviewer", "notes", "recheck", "team_decision"]
HAND_TYPES = "typo | colloquial | multi_section | follow_up | case_law | general (non-law) | out_of_scope (law, not in our data)"


def read_jsonl(p):
    return [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()]


def export(src, dst):
    rows = read_jsonl(src)
    rows.sort(key=lambda q: (q["domain"], q["chunk_id"], q["lang"] != "bn"))
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(dst, "w", encoding="utf-8-sig", newline="") as f:  # BOM: Excel shows Bangla correctly
        w = csv.DictWriter(f, fieldnames=REVIEW_COLS)
        w.writeheader()
        for q in rows:
            w.writerow({
                "id": q["id"], "domain": q["domain"], "kind": q["kind"], "lang": q["lang"],
                "law_or_case": q["act"] or f"{q['case_title']} ({q['citation']})",
                "section": q["section"], "question": q["question"],
                "reference_answer": q["reference_answer"], "source_text": q["source_text"],
                "gold_chunk_ids": ";".join(q["gold_chunk_ids"]),
            })
    hand = dst.parent / "handwritten.csv"
    if not hand.exists():
        with open(hand, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=HAND_COLS)
            w.writeheader()
            w.writerow({"question": "wat is the punisment for theft in bangladesh?", "lang": "en", "type": "typo",
                        "expected_route": "law", "domain": "criminal",
                        "gold_chunk_ids": "the-penal-code-1860-1860-s379",
                        "reference_answer": "Under Section 379 of the Penal Code, 1860, theft is punishable with "
                                            "imprisonment up to three years, or fine, or both.",
                        "reviewer": "", "notes": "EXAMPLE ROW: replace or delete"})
    print(f"wrote {len(rows)} rows to {dst}")
    print(f"template for hand-written questions: {hand}  (types: {HAND_TYPES})")


def all_chunk_ids():
    ids = {}
    for p in DATA_DIR.glob("*.jsonl"):
        dom = domain_id(p)
        for line in open(p, encoding="utf-8"):
            if line.strip():
                ids[json.loads(line)["id"]] = dom
    return ids


def read_csv(p):
    with open(p, encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames, list(r)


def write_csv(p, cols, rows):
    tmp = Path(str(p) + ".tmp")
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})
    tmp.replace(p)


def add_cols(review_csv):
    cols, rows = read_csv(review_csv)
    missing = [c for c in REVIEW_COLS if c not in cols]
    if not missing:
        print("nothing to add")
        return
    new = [c for c in REVIEW_COLS if c in cols or c in missing] + [c for c in cols if c not in REVIEW_COLS]
    write_csv(review_csv, new, rows)
    print(f"added {missing} to {review_csv} ({len(rows)} rows kept)")


def mark_recheck(review_csv, keep_frac, seed, handwritten=None):
    import random
    cols, rows = read_csv(review_csv)
    keeps = [i for i, r in enumerate(rows) if (r.get("decision") or "").strip().lower() == "keep"]
    picked = set(random.Random(seed).sample(keeps, round(len(keeps) * keep_frac)))
    for i, r in enumerate(rows):
        d = (r.get("decision") or "").strip().lower()
        r["recheck"] = "yes" if d in ("fix", "drop") or i in picked else ""
    write_csv(review_csv, cols, rows)
    n = sum(r["recheck"] == "yes" for r in rows)
    print(f"recheck = yes on {n} rows ({len(picked)} of {len(keeps)} keeps, seed {seed})")
    if handwritten and Path(handwritten).exists():  # every hand-written row gets a second look
        hcols, hrows = read_csv(handwritten)
        hcols += [c for c in ("recheck", "team_decision") if c not in hcols]
        for r in hrows:
            if (r.get("question") or "").strip() and "EXAMPLE ROW" not in (r.get("notes") or ""):
                r["recheck"] = "yes"
        write_csv(handwritten, hcols, hrows)
        print(f"recheck = yes on all {sum(r.get('recheck') == 'yes' for r in hrows)} hand-written rows")


def split_ids(s):
    return [x.strip() for x in (s or "").replace(",", ";").split(";") if x.strip()]


def do_import(review_csv, handwritten, out, partial, candidates):
    known = all_chunk_ids()
    cands = {q["id"]: q for q in read_jsonl(candidates)} if Path(candidates).exists() else {}
    problems, final, stats = [], [], Counter()
    agree = Counter()  # first reviewer vs team, on rows the team checked

    with open(review_csv, encoding="utf-8-sig", newline="") as f:
        for n, r in enumerate(csv.DictReader(f), 2):
            d = (r.get("decision") or "").strip().lower()
            t = (r.get("team_decision") or "").strip().lower()
            if t:
                if t not in ("agree", "keep", "fix", "drop"):
                    problems.append(f"row {n}: team_decision must be agree/keep/fix/drop, got {t!r}")
                    continue
                agree["checked"] += 1
                if t in ("agree", d):
                    agree["agree"] += 1
                else:
                    agree[f"{d or '-'} -> {t}"] += 1
                if t != "agree":
                    d = t
            elif (r.get("recheck") or "").strip().lower() == "yes":
                stats["recheck pending"] += 1
            if not d:
                stats["not reviewed"] += 1
                if not partial:
                    problems.append(f"row {n}: no decision")
                continue
            if d not in ("keep", "fix", "drop"):
                problems.append(f"row {n}: decision must be keep/fix/drop, got {d!r}")
                continue
            stats[d] += 1
            if d == "drop":
                continue
            base = dict(cands.get(r["id"], {"split": "test"}))
            q = (r["question_fixed"].strip() if d == "fix" and r["question_fixed"].strip() else r["question"].strip())
            a = (r["answer_fixed"].strip() if d == "fix" and r["answer_fixed"].strip() else r["reference_answer"].strip())
            gold = split_ids(r["gold_chunk_ids"]) + split_ids(r["extra_gold_chunk_ids"])
            for g in gold:
                if g not in known:
                    problems.append(f"row {n}: unknown chunk id {g!r}")
            base.update({"id": r["id"], "question": q, "lang": "bn" if any("ঀ" <= c <= "৿" for c in q) else "en",
                         "domain": r["domain"], "kind": r["kind"], "type": "generated", "expected_route": "law",
                         "gold_chunk_ids": gold, "reference_answer": a, "review": d,
                         "reviewer": r.get("reviewer", ""), "notes": r.get("notes", "")})
            base.pop("source_text", None)
            final.append(base)

    if handwritten and Path(handwritten).exists():
        with open(handwritten, encoding="utf-8-sig", newline="") as f:
            for n, r in enumerate(csv.DictReader(f), 2):
                q = (r.get("question") or "").strip()
                if not q or "EXAMPLE ROW" in (r.get("notes") or ""):
                    continue
                t = (r.get("team_decision") or "").strip().lower()
                if t:  # the first reviewer wrote the row, so their implicit decision is keep
                    if t not in ("agree", "keep", "fix", "drop"):
                        problems.append(f"handwritten row {n}: team_decision must be agree/keep/fix/drop, got {t!r}")
                        continue
                    agree["checked"] += 1
                    if t in ("agree", "keep"):
                        agree["agree"] += 1
                    else:
                        agree[f"handwritten keep -> {t}"] += 1
                    if t == "drop":
                        stats["handwritten dropped"] += 1
                        continue
                elif (r.get("recheck") or "").strip().lower() == "yes":
                    stats["recheck pending"] += 1
                route = (r.get("expected_route") or "law").strip().lower()
                if route not in ("law", "general", "unsupported"):
                    problems.append(f"handwritten row {n}: expected_route must be law/general/unsupported")
                gold = split_ids(r.get("gold_chunk_ids"))
                for g in gold:
                    if g not in known:
                        problems.append(f"handwritten row {n}: unknown chunk id {g!r}")
                if route == "law" and not gold:
                    problems.append(f"handwritten row {n}: law question needs gold_chunk_ids")
                final.append({
                    "id": "h-" + hashlib.sha1(q.encode("utf-8")).hexdigest()[:12], "split": "test",
                    "question": q, "lang": (r.get("lang") or ("bn" if any("ঀ" <= c <= "৿" for c in q) else "en")).strip(),
                    "domain": (r.get("domain") or (known.get(gold[0]) if gold else "")).strip(),
                    "kind": "case" if gold and gold[0].startswith("scob-") else "act",
                    "type": (r.get("type") or "handwritten").strip(), "expected_route": route,
                    "gold_chunk_ids": gold, "reference_answer": (r.get("reference_answer") or "").strip(),
                    "review": "handwritten", "reviewer": r.get("reviewer", ""), "notes": r.get("notes", ""),
                })
                stats["handwritten"] += 1

    if agree["checked"]:
        rate = agree["agree"] / agree["checked"]
        changes = {k: v for k, v in agree.items() if k not in ("checked", "agree")}
        print(f"first reviewer vs team: {agree['agree']}/{agree['checked']} agree ({rate:.1%}); changes: {changes or 'none'}")
    if problems:
        print("Fix these first:")
        for p in problems[:50]:
            print("  -", p)
        if len(problems) > 50:
            print(f"  ... and {len(problems) - 50} more")
        sys.exit(1)

    out = Path(out)
    with open(out, "w", encoding="utf-8") as f:
        for q in final:
            f.write(json.dumps(q, ensure_ascii=False) + "\n")
    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    by = Counter((q["domain"] or "-", q["lang"]) for q in final)
    lines = [f"test set: {out.name}", f"sha256: {sha}", f"questions: {len(final)}", f"review: {dict(stats)}",
             "team recheck: " + (f"{agree['agree']}/{agree['checked']} agree ({agree['agree'] / agree['checked']:.1%})"
                                 if agree["checked"] else "not done"),
             "by domain/lang:"] + [f"  {k[0]:15s} {k[1]}  {v}" for k, v in sorted(by.items())]
    lines.append("by type: " + str(dict(Counter(q.get("type", "generated") for q in final))))
    (out.with_suffix(".stats.txt")).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


def find(query, domain, k, url):
    body = {"query": query, "k": k}
    if domain:
        body["domains"] = [domain]
    req = urllib.request.Request(url.rstrip("/") + "/search", data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read())["results"]
    for h in res:
        label = h.get("caseTitle") or f"{h['act']} s.{h['section']}"
        print(f"{h['score']:.3f}  {h['id']}\n       {label}\n       {h.get('excerpt', '')[:160]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export"); e.add_argument("src"); e.add_argument("dst")
    i = sub.add_parser("import"); i.add_argument("review_csv"); i.add_argument("--handwritten")
    i.add_argument("--out", default=str(HERE / "data" / "test.jsonl")); i.add_argument("--partial", action="store_true")
    i.add_argument("--candidates", default=str(HERE / "data" / "test_candidates.jsonl"))
    c = sub.add_parser("add-cols"); c.add_argument("review_csv")
    m = sub.add_parser("mark-recheck"); m.add_argument("review_csv")
    m.add_argument("--keep-frac", type=float, default=0.2); m.add_argument("--seed", type=int, default=42)
    m.add_argument("--handwritten")
    f = sub.add_parser("find"); f.add_argument("query"); f.add_argument("--domain"); f.add_argument("-k", type=int, default=5)
    f.add_argument("--url", default="http://localhost:8000")
    a = ap.parse_args()
    if a.cmd == "export":
        export(a.src, a.dst)
    elif a.cmd == "import":
        do_import(a.review_csv, a.handwritten, a.out, a.partial, a.candidates)
    elif a.cmd == "add-cols":
        add_cols(a.review_csv)
    elif a.cmd == "mark-recheck":
        mark_recheck(a.review_csv, a.keep_frac, a.seed, a.handwritten)
    else:
        find(a.query, a.domain, a.k, a.url)
