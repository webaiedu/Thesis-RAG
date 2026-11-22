"""
Score benchmark answers (from backend `npm run eval`) and build the results tables.

    python3 score.py judge   runs/B0/gemma            # LLM judge -> judgments.jsonl (resumable)
    python3 score.py report  runs/B0/gemma            # all metrics -> scores.jsonl, summary.md, summary.json
    python3 score.py compare runs/B0/gemma runs/E3/gemma   # paired before/after differences with 95% CIs

Judge: eval/config.json (model, prompt version). The judge model must be loaded in LM Studio
(only for `judge`). Never change config.json between the before and after runs.

Per answer:
  route_ok         route type == expected_route (law / general / unsupported)
  domain_ok        a gold domain is among the routed domains (law questions)
  ctx_hit          a gold chunk / same section-or-case chunk was given to the model (sources)
  cite_recall      the reply cites the gold section number (or the case) by name
  cite_precision   share of section numbers cited in the reply that were in the given excerpts
  judge_*          correctness, faithfulness, technicality fit (1-5), language_ok, refused
  length, readability (English: Flesch reading ease; Bangla: words per sentence), latency, tokens
Summaries: mean and bootstrap 95% CI (resampling questions), by setting, domain, language and type.
Uses only the Python standard library.
"""
import argparse
import hashlib
import json
import random
import re
import sys
import time
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from make_questions import load_chunks  # noqa: E402

CONFIG = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
BN_LETTERS = {"ক": "ka", "খ": "kha", "গ": "ga", "ঘ": "gha", "ঙ": "nga", "চ": "ca"}


# ---------------------------------------------------------------- io
def read_jsonl(p):
    p = Path(p)
    return [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()] if p.exists() else []


def load_test(path):
    return {q["id"]: q for q in read_jsonl(path)}


_CHUNKS = None


def chunks():
    global _CHUNKS
    if _CHUNKS is None:
        _CHUNKS = {c["id"]: c for c in load_chunks()}
    return _CHUNKS


# ---------------------------------------------------------------- deterministic metrics
def norm_sec(s):
    """'৯খ' -> '9kha', '24A' -> '24a', '161' -> '161'."""
    s = (s or "").translate(BN_DIGITS).strip().lower()
    return "".join(BN_LETTERS.get(ch, ch) for ch in s)


SEC_RE = re.compile(r"(?:section|sec\.?|s\.|ধারা|অনুচ্ছেদ|article|art\.?)\s*([0-9০-৯]+[a-zA-Zকখগঘঙচ]{0,3})", re.I)


def cited_sections(text):
    return {norm_sec(m.group(1)).split("(")[0] for m in SEC_RE.finditer(text or "")}


def gold_info(q):
    ch = chunks()
    golds = [ch[g] for g in q.get("gold_chunk_ids", []) if g in ch]
    return golds, {g["_group"] for g in golds}


def ctx_hit(q, ans):
    golds, groups = gold_info(q)
    if not golds:
        return None, None
    ids = {s["id"] for s in ans.get("sources", [])}
    ch = chunks()
    got_groups = {ch[i]["_group"] for i in ids if i in ch}
    return float(bool(ids & set(q["gold_chunk_ids"]))), float(bool(groups & got_groups))


def cite_recall(q, ans):
    golds, _ = gold_info(q)
    if not golds:
        return None
    reply = ans.get("reply") or ""
    secs = cited_sections(reply)
    for g in golds:
        if g.get("kind") == "case" or str(g["id"]).startswith("scob-"):
            title = (g.get("case_title") or "").split(" Vs")[0].split(" vs")[0].strip()
            cit = (g.get("citation") or "").split(" ")[0]
            if (title and title[:12].lower() in reply.lower()) or (cit and cit in reply):
                return 1.0
        elif norm_sec(g.get("section_no")) in secs:
            return 1.0
    return 0.0


def cite_precision(ans):
    secs = cited_sections(ans.get("reply"))
    if not secs:
        return None
    given = {norm_sec(s.get("section")) for s in ans.get("sources", [])}
    return sum(s in given for s in secs) / len(secs)


def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    n = len(re.findall(r"[aeiouy]+", w))
    return max(1, n - (1 if w.endswith("e") and n > 1 else 0))


def readability(text):
    text = re.sub(r"[*#>`_|]", " ", text or "")
    sents = [s for s in re.split(r"[.!?।]+", text) if s.strip()]
    words = text.split()
    if not words or not sents:
        return {"words": len(words), "words_per_sentence": None, "flesch": None}
    out = {"words": len(words), "words_per_sentence": round(len(words) / len(sents), 1), "flesch": None}
    if not re.search(r"[ঀ-৿]", text):
        syl = sum(syllables(w) for w in words)
        out["flesch"] = round(206.835 - 1.015 * len(words) / len(sents) - 84.6 * syl / len(words), 1)
    return out


# ---------------------------------------------------------------- LLM judge
JUDGE_SYSTEM = ("You are a strict, fair grader for a Bangladesh legal-assistant benchmark. "
                "You compare a chatbot answer with a reference answer and with the source excerpts the "
                "chatbot was given. Reply with one JSON object only, no other text.")

JUDGE_TEMPLATE = """QUESTION (expected handling: {route}{file_note}):
{question}

REFERENCE ANSWER (written by the test-set authors from the law; may be shorter than a good answer):
{reference}

SOURCE EXCERPTS GIVEN TO THE CHATBOT:
{excerpts}

REQUESTED STYLE: technicality = {tech} ({tech_hint})

CHATBOT ANSWER:
{answer}

Score the CHATBOT ANSWER:
- "correctness" 1-5: does it give the same legal result as the reference (punishments, periods, amounts,
  conditions, who/where)? 5 = all key points right and nothing wrong; 3 = main point right but a key detail
  missing or wrong; 1 = wrong or no answer. Extra correct detail is fine. For expected handling "general",
  judge plain helpfulness and accuracy. For "unsupported", 5 = it clearly declines or says this is outside
  Bangladesh law it covers, 1 = it answers from outside knowledge as if certain.
- "faithfulness" 1-5: are its legal claims supported by the SOURCE EXCERPTS (not outside knowledge)?
  5 = everything supported; 1 = mostly unsupported or invented sections. Use null if no excerpts were given.
- "technicality_fit" 1-5 for technicality low or high (low = plain everyday words, little jargon; high =
  precise legal terms and section references); null for auto.
- "language_ok": true if it answers in the language of the question (Bangla in Latin letters may be answered
  in Bangla or English).
- "refused": true if it declined to answer.
- "reason": one short sentence.
Return exactly: {{"correctness": n, "faithfulness": n|null, "technicality_fit": n|null, "language_ok": bool, "refused": bool, "reason": "..."}}"""

TECH_HINT = {"low": "plain language for a layperson", "high": "precise legal language", "auto": "no requirement"}


def judge_config_hash():
    j = {k: v for k, v in CONFIG["judge"].items() if k != "url"}  # where it runs doesn't change the judge
    return hashlib.sha256((json.dumps(j, sort_keys=True) + JUDGE_SYSTEM + JUDGE_TEMPLATE).encode()).hexdigest()[:12]


_TRUTH = None


def file_truth(name):
    """Ground-truth text of a benchmark file (data/files/manifest.jsonl)."""
    global _TRUTH
    if _TRUTH is None:
        _TRUTH = {m["file"]: m["truth"] for m in read_jsonl(HERE / "data" / "files" / "manifest.jsonl")}
    return _TRUTH.get(name)


def excerpts_for(ans, limit):
    ch, parts, used = chunks(), [], 0
    if ans.get("file") and file_truth(ans["file"]):
        parts.append("[attached file, its true content] " + file_truth(ans["file"]))
        used += len(parts[0])
    for i, s in enumerate(ans.get("sources", []), 1):
        t = ch.get(s["id"], {}).get("text", "")
        t = t[: max(0, limit - used)]
        if not t:
            break
        parts.append(f"[{i}] {t}")
        used += len(t)
    return "\n\n".join(parts) or "(none: no excerpts were given)"


def call_judge(prompt):
    j = CONFIG["judge"]
    body = {"model": j["model"], "temperature": j["temperature"], "max_tokens": j["max_tokens"],
            "messages": [{"role": "system", "content": JUDGE_SYSTEM}, {"role": "user", "content": prompt}]}
    if j.get("reasoning_effort"):
        body["reasoning_effort"] = j["reasoning_effort"]
    req = urllib.request.Request(j["url"].rstrip("/") + "/chat/completions", data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        txt = json.loads(r.read())["choices"][0]["message"]["content"]
    txt = re.sub(r"<think>.*?</think>", "", txt, flags=re.S)
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        raise ValueError(f"no JSON in judge reply: {txt[:200]}")
    out = json.loads(m.group(0))
    for k in ("correctness", "faithfulness", "technicality_fit"):
        v = out.get(k)
        out[k] = None if v in (None, "null", "") else max(1, min(5, int(round(float(v)))))
    return out


def judge(run_dir, test_path, workers, limit):
    run = Path(run_dir)
    tests = load_test(test_path)
    answers = read_jsonl(run / "answers.jsonl")
    out_path = run / "judgments.jsonl"
    h = judge_config_hash()
    done = {(r["key"], r["judge"]) for r in read_jsonl(out_path)}
    todo = [a for a in answers if (a["key"], h) not in done and a["id"] in tests]
    if limit:
        todo = todo[:limit]
    print(f"judge {CONFIG['judge']['model']} ({h}): {len(answers) - len(todo)} done, {len(todo)} to do")
    t0, n, errs = time.time(), 0, 0

    def work(a):
        q = tests[a["id"]]
        prompt = JUDGE_TEMPLATE.format(
            route=q.get("expected_route", "law"),
            file_note=", the user attached a file" if q.get("file") else "",
            question=a["question"], reference=q.get("reference_answer") or "(none)",
            excerpts=excerpts_for(a, CONFIG["judge"]["excerpt_chars"]),
            tech=a["settings"]["technicality"], tech_hint=TECH_HINT[a["settings"]["technicality"]],
            answer=(a.get("reply") or "")[:8000])
        for attempt in range(3):
            try:
                return {"key": a["key"], "judge": h, **call_judge(prompt)}
            except Exception as e:  # noqa: BLE001
                err = e
                time.sleep(2 * (attempt + 1))
        return {"key": a["key"], "judge": h, "error": str(err)}

    with ThreadPoolExecutor(workers) as ex, open(out_path, "a", encoding="utf-8") as f:
        for r in ex.map(work, todo):
            if "error" in r:
                errs += 1
                print("  judge error:", r["key"], r["error"][:120])
                continue
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            f.flush()
            n += 1
            if n % 25 == 0:
                rate = n / (time.time() - t0)
                print(f"  judged {n}/{len(todo)}  {rate * 60:.1f}/min  eta {(len(todo) - n) / rate / 60:.0f} min")
    print(f"done: {n} judged, {errs} errors (run again to retry)")


# ---------------------------------------------------------------- report
METRICS = ["route_ok", "domain_ok", "ctx_hit_chunk", "ctx_hit_group", "cite_recall", "cite_precision",
           "judge_correctness", "judge_faithfulness", "judge_technicality_fit", "judge_language_ok",
           "judge_refused", "words", "words_per_sentence", "flesch", "seconds", "first_token_s", "tokens"]


def score_rows(run_dir, test_path):
    run = Path(run_dir)
    tests = load_test(test_path)
    h = judge_config_hash()
    judged = {r["key"]: r for r in read_jsonl(run / "judgments.jsonl") if r.get("judge") == h}
    rows = []
    for a in read_jsonl(run / "answers.jsonl"):
        q = tests.get(a["id"])
        if not q:
            continue
        exp = q.get("expected_route", "law")
        route = (a.get("route") or {}).get("type")
        golds, _ = gold_info(q)
        gdoms = {g["_domain"] if "_domain" in g else q.get("domain") for g in golds} or {q.get("domain")}
        rdoms = {d["id"] for d in (a.get("route") or {}).get("domains", [])}
        c_chunk, c_group = ctx_hit(q, a)
        jd = judged.get(a["key"], {})
        s = a["settings"]
        r = {"key": a["key"], "id": a["id"], "variant": a["variant"], "mode": a.get("mode"),
             "model": s["model"], "effort": s["effort"], "tech": s["technicality"],
             "domain": q.get("domain") or "-", "lang": q.get("lang"), "type": q.get("type", "generated"),
             "kind": q.get("kind"), "expected_route": exp, "route": route,
             "format": q.get("format") or "-", "doc": q.get("doc") or "-",
             "route_ok": float(route == exp) if a.get("mode") != "general" else None,
             "domain_ok": (float(bool(gdoms & rdoms)) if exp == "law" and route == "law" and golds else None),
             "ctx_hit_chunk": c_chunk, "ctx_hit_group": c_group,
             "cite_recall": cite_recall(q, a) if exp == "law" else None,
             "cite_precision": cite_precision(a) if exp == "law" else None,
             "seconds": round(a["ms"] / 1000, 2), "first_token_s": round(a["firstTokenMs"] / 1000, 2) if a.get("firstTokenMs") else None,
             "tokens": a.get("tokens")}
        r.update(readability(a.get("reply")))
        for k in ("correctness", "faithfulness", "technicality_fit"):
            r["judge_" + k] = jd.get(k)
        r["judge_language_ok"] = float(jd["language_ok"]) if "language_ok" in jd else None
        r["judge_refused"] = float(jd["refused"]) if "refused" in jd else None
        rows.append(r)
    return rows


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def boot_ci(rows, metric, resamples, seed):
    """95% CI of the mean, resampling questions (all settings of a question move together)."""
    byq = defaultdict(list)
    for r in rows:
        if r.get(metric) is not None:
            byq[r["id"]].append(r[metric])
    ids = list(byq)
    if len(ids) < 2:
        return None, None
    rnd, ms = random.Random(seed), []
    for _ in range(resamples):
        vals = [v for i in (rnd.choice(ids) for _ in ids) for v in byq[i]]
        ms.append(sum(vals) / len(vals))
    ms.sort()
    return ms[int(0.025 * len(ms))], ms[int(0.975 * len(ms)) - 1]


def summarize(rows, by, metrics, ci=True):
    groups = defaultdict(list)
    for r in rows:
        groups[tuple(r[b] for b in by)].append(r)
    b = CONFIG["bootstrap"]
    out = []
    for k in sorted(groups, key=str):
        g = groups[k]
        rec = {"group": dict(zip(by, k)), "n": len(g)}
        for m in metrics:
            rec[m] = mean(r.get(m) for r in g)
            if ci and m.startswith(("judge_correctness", "judge_faithfulness", "ctx_hit_group", "cite_recall", "route_ok")):
                rec[m + "_ci"] = boot_ci(g, m, b["resamples"], b["seed"])
        out.append(rec)
    return out


def fmt(v, ci=None):
    if v is None:
        return "–"
    s = f"{v:.2f}" if abs(v) < 100 else f"{v:.0f}"
    if ci and ci[0] is not None:
        s += f" [{ci[0]:.2f}, {ci[1]:.2f}]"
    return s


def table(recs, cols, title):
    if not recs:
        return ""
    keys = list(recs[0]["group"])
    lines = [f"### {title}", "", "| " + " | ".join(keys + ["n"] + cols) + " |", "|" + "---|" * (len(keys) + 1 + len(cols))]
    for r in recs:
        lines.append("| " + " | ".join([str(r["group"][k]) for k in keys] + [str(r["n"])] +
                                       [fmt(r.get(c), r.get(c + "_ci")) for c in cols]) + " |")
    return "\n".join(lines) + "\n"


MAIN_COLS = ["judge_correctness", "judge_faithfulness", "judge_technicality_fit", "route_ok", "ctx_hit_group",
             "cite_recall", "cite_precision", "words", "seconds"]


def report(run_dir, test_path):
    run = Path(run_dir)
    rows = score_rows(run, test_path)
    if not rows:
        sys.exit(f"no answers in {run}/answers.jsonl")
    with open(run / "scores.jsonl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    judged = sum(r["judge_correctness"] is not None for r in rows)
    cfg = json.loads((run / "run-config.json").read_text()) if (run / "run-config.json").exists() else {}
    parts = [f"# Results: {run}", "",
             f"- answers: {len(rows)}, judged: {judged} (judge {CONFIG['judge']['model']}, {judge_config_hash()})",
             f"- test set sha256: {cfg.get('test', {}).get('sha256', '?')}, git: {cfg.get('git', {}).get('sha', '?')}",
             "- values: mean; [95% bootstrap CI over questions]; scores 1-5, rates 0-1", ""]
    summary = {}
    for by, title in [(["variant"], "Overall"), (["model", "effort", "tech"], "By setting"),
                      (["domain"], "By domain"), (["lang"], "By language"), (["type"], "By question type"),
                      (["format", "lang"], "By file format (file questions only; '-' = no file)"),
                      (["expected_route", "route"], "Routing (expected vs actual)")]:
        recs = summarize(rows, by, METRICS)
        summary["/".join(by)] = recs
        parts.append(table(recs, MAIN_COLS if by != ["expected_route", "route"] else ["judge_correctness"], title))
    (run / "summary.md").write_text("\n".join(parts), encoding="utf-8")
    (run / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(parts[:8]))
    print(table(summary["model/effort/tech"], MAIN_COLS, "By setting"))
    print(f"wrote {run / 'scores.jsonl'}, summary.md, summary.json")


def compare(run_a, run_b, test_path):
    a = {(r["id"], r["model"], r["effort"], r["tech"]): r for r in score_rows(run_a, test_path)}
    b = {(r["id"], r["model"], r["effort"], r["tech"]): r for r in score_rows(run_b, test_path)}
    keys = sorted(set(a) & set(b))
    if not keys:
        sys.exit("no common (question, setting) pairs")
    bs = CONFIG["bootstrap"]
    lines = [f"# {run_b} minus {run_a} (paired, {len(keys)} question-setting pairs)", "",
             "| metric | A | B | B - A [95% CI] |", "|---|---|---|---|"]
    for m in ["judge_correctness", "judge_faithfulness", "judge_technicality_fit", "route_ok", "ctx_hit_group",
              "cite_recall", "cite_precision", "words", "seconds"]:
        diffs = [{"id": k[0], "d": b[k][m] - a[k][m]} for k in keys if a[k].get(m) is not None and b[k].get(m) is not None]
        if not diffs:
            continue
        ci = boot_ci(diffs, "d", bs["resamples"], bs["seed"])
        lines.append(f"| {m} | {fmt(mean(a[k][m] for k in keys))} | {fmt(mean(b[k][m] for k in keys))} | "
                     f"{fmt(mean(x['d'] for x in diffs), ci)} |")
    wins = sum((b[k]["judge_correctness"] or 0) > (a[k]["judge_correctness"] or 0) for k in keys)
    loss = sum((b[k]["judge_correctness"] or 0) < (a[k]["judge_correctness"] or 0) for k in keys)
    lines += ["", f"correctness: B better {wins}, worse {loss}, equal {len(keys) - wins - loss}"]
    text = "\n".join(lines)
    print(text)
    out = Path(run_b) / f"compare-vs-{Path(run_a).parent.name}-{Path(run_a).name}.md"
    out.write_text(text + "\n", encoding="utf-8")
    print("wrote", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("judge", "report"):
        p = sub.add_parser(name)
        p.add_argument("run_dir")
        p.add_argument("--test", default=str(HERE / "data" / "test.jsonl"))
        if name == "judge":
            p.add_argument("--workers", type=int, default=4)
            p.add_argument("--limit", type=int, default=0)
    c = sub.add_parser("compare")
    c.add_argument("run_a"); c.add_argument("run_b")
    c.add_argument("--test", default=str(HERE / "data" / "test.jsonl"))
    a = ap.parse_args()
    if a.cmd == "judge":
        judge(a.run_dir, a.test, a.workers, a.limit)
    elif a.cmd == "report":
        report(a.run_dir, a.test)
    else:
        compare(a.run_a, a.run_b, a.test)
