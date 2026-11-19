"""
Generate benchmark / training questions from the law data with an LLM (LM Studio).

    python make_questions.py --split test  --per-domain 34 --out data/test_candidates.jsonl
    python make_questions.py --split val   --per-domain 34 --out data/val.jsonl
    python make_questions.py --split train --per-domain 600 --out data/train.jsonl
    python make_questions.py --split test  --limit 20 --out data/trial.jsonl   # quick look
    python make_questions.py --check data/test_candidates.jsonl data/val.jsonl data/train.jsonl

Split (no leakage): every chunk belongs to a *group* (a statute section, or a whole court
case). The group decides the split by a fixed hash: 80% train / 10% val / 10% test.
So no question in train/val is about the same section or case as a test question.

Per sampled chunk the LLM writes 2 questions (one Bangla, one English) a citizen might ask,
each with a short reference answer taken only from that chunk. The LLM may skip chunks with
nothing worth asking (repealed sections, headers, procedural text).

Resumable: re-running the same command skips chunks already done (written or skipped).
Uses only the Python standard library.
"""
import argparse
import hashlib
import json
import os
import random
import re
import sys
import threading
import time
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "retrieval"))
from common import domain_id  # noqa: E402  (same domain ids as ingest.py / server.py)

DATA_DIR = HERE.parent / "backend" / "data"
LM_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1").rstrip("/")
MODEL = os.getenv("GEN_MODEL", "qwen3-next-80b-a3b-instruct")
SPLITS = {"train": (0, 80), "val": (80, 90), "test": (90, 100)}
MIN_BODY_CHARS = 150  # chunks shorter than this rarely answer a real question
SKIP_PATTERNS = re.compile(r"\[?\s*(Repealed|Omitted|বিলুপ্ত|রহিত)\b", re.I)


# ---------------- data ----------------

def body_of(rec):
    """Chunk text without the heading lines (acts: after 'Section ...' line; cases: after ---)."""
    t = rec["text"]
    if rec.get("kind") == "case" and "\n---\n" in t:
        return t.split("\n---\n", 1)[1]
    lines = t.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("Section"):
            return "\n".join(lines[i + 1:])
    return t


def group_key(rec, domain):
    if rec.get("kind") == "case":
        return "case|" + (rec.get("citation") or rec["id"].rsplit("-p", 1)[0])
    return f"act|{domain}|{rec.get('act_title', '')}|{rec.get('section_no', '')}"


def split_of(key):
    h = int(hashlib.sha256(key.encode("utf-8")).hexdigest(), 16) % 100
    for name, (lo, hi) in SPLITS.items():
        if lo <= h < hi:
            return name


def load_chunks():
    chunks = []
    for path in sorted(DATA_DIR.glob("*.jsonl")):
        dom = domain_id(path)
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                rec = json.loads(line)
                rec["_domain"] = dom
                rec["_group"] = group_key(rec, dom)
                rec["_split"] = split_of(rec["_group"])
                chunks.append(rec)
    return chunks


def usable(rec):
    b = body_of(rec).strip()
    return len(b) >= MIN_BODY_CHARS and not SKIP_PATTERNS.search(b[:120])


# ---------------- LLM ----------------

PROMPT_ACT = """You write evaluation questions for "Ainkhoj", a chatbot that answers questions about the laws of Bangladesh.

Below is one section of a Bangladesh law. Write exactly 2 questions that an ordinary person in Bangladesh might really ask, which THIS text answers:
- question 1 in Bangla (natural, everyday Bangla),
- question 2 in English, about a different point if the text has one.

Rules:
- Ask like a citizen with a real problem. Do NOT mention "this section", "this text" or the section number. Mentioning the law's name is fine sometimes, not always.
- The question must make sense ON ITS OWN to someone who has not seen the text: never write "this law", "the Board", "the chairman" or "the committee" without saying which one (e.g. "the board of the Child and Maternal Health Institute").
- The answer must be fully supported by the text. Write it in the question's language, 1-3 sentences, and mention the law and section.
- If the text has nothing a citizen would ask about (only a title, commencement date, repeal, amendment wording, or a cross-reference), return {{"items": []}}.

Return ONLY JSON, no other text:
{{"items": [{{"question": "...", "lang": "bn", "answer": "..."}}, {{"question": "...", "lang": "en", "answer": "..."}}]}}

LAW: {act}, Section {section}
TEXT:
{text}"""

PROMPT_CASE = """You write evaluation questions for "Ainkhoj", a chatbot that answers questions about Bangladesh law, including Supreme Court decisions.

Below is one passage from a Supreme Court of Bangladesh judgment. Write exactly 2 questions that a law student, lawyer or affected citizen might ask, which THIS passage answers (a legal principle, what the court held, or how a law was interpreted):
- question 1 in Bangla, question 2 in English.

Rules:
- Do NOT mention "this passage" or "this judgment". You may name the case or the legal issue.
- The question must make sense ON ITS OWN to someone who has not read the passage: name the law, office or issue instead of writing "the Act", "the petitioner" or "the respondent".
- The answer must be fully supported by the passage. Write it in the question's language, 1-3 sentences, and name the case.
- If the passage has no legal point (only a cover page, list of lawyers, procedural history, dates, or OCR noise), return {{"items": []}}.

Return ONLY JSON, no other text:
{{"items": [{{"question": "...", "lang": "bn", "answer": "..."}}, {{"question": "...", "lang": "en", "answer": "..."}}]}}

CASE: {case} ({citation}), {court}
PASSAGE:
{text}"""


def build_prompt(rec):
    if rec.get("kind") == "case":
        return PROMPT_CASE.format(case=rec.get("case_title", ""), citation=rec.get("citation", ""),
                                  court=rec.get("court", ""), text=body_of(rec).strip())
    return PROMPT_ACT.format(act=rec.get("act_title", ""), section=rec.get("section_no", ""),
                             text=body_of(rec).strip())


def call_llm(prompt, retries=3):
    body = json.dumps({
        "model": MODEL, "temperature": 0.7, "max_tokens": 1200, "reasoning_effort": "none",
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(LM_URL + "/chat/completions", data=body,
                                         headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.loads(r.read().decode("utf-8"))
            content = d["choices"][0]["message"]["content"]
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.S)
            s = content[content.find("{"): content.rfind("}") + 1]
            return json.loads(s)["items"], d.get("usage", {})
        except Exception as e:  # network, server busy, bad JSON: retry
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"LLM failed after {retries} tries: {last}")


BN = re.compile(r"[ঀ-৿]")


def clean_items(items):
    out = []
    for it in items or []:
        q, a = str(it.get("question", "")).strip(), str(it.get("answer", "")).strip()
        if len(q) < 8 or len(a) < 8:
            continue
        lang = "bn" if BN.search(q) else "en"  # trust the text, not the label
        out.append({"question": q, "lang": lang, "answer": a})
    return out


# ---------------- main ----------------

def sample(chunks, split, per_domain, seed):
    by_dom = defaultdict(list)
    for c in chunks:
        if c["_split"] == split and usable(c):
            by_dom[c["_domain"]].append(c)
    rng = random.Random(f"{split}-{seed}")
    picked = []
    for dom in sorted(by_dom):
        pool = by_dom[dom]
        rng.shuffle(pool)
        seen_groups, take = set(), []
        for c in pool:  # prefer one chunk per group, so questions cover more sections/cases
            if c["_group"] not in seen_groups:
                seen_groups.add(c["_group"])
                take.append(c)
            if len(take) >= per_domain:
                break
        picked += take
    return picked


def done_ids(out_path):
    done = set()
    for p in (out_path, out_path.with_suffix(".skipped.jsonl")):
        if p.exists():
            for line in open(p, encoding="utf-8"):
                if line.strip():
                    done.add(json.loads(line)["chunk_id"])
    return done


def run(args):
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    chunks = load_chunks()
    todo = sample(chunks, args.split, args.per_domain, args.seed)
    if args.limit:
        todo = todo[: args.limit]
    done = done_ids(out)
    todo = [c for c in todo if c["id"] not in done]
    print(f"{args.split}: {len(todo)} chunks to do ({len(done)} already done), model {MODEL}")
    lock = threading.Lock()
    stats = Counter()
    t0 = time.time()

    def work(rec):
        items, usage = call_llm(build_prompt(rec))
        return rec, clean_items(items), usage

    with ThreadPoolExecutor(max_workers=args.workers) as ex, \
            open(out, "a", encoding="utf-8") as fo, \
            open(out.with_suffix(".skipped.jsonl"), "a", encoding="utf-8") as fs:
        futures = [ex.submit(work, c) for c in todo]
        for n, fut in enumerate(as_completed(futures), 1):
            try:
                rec, items, usage = fut.result()
            except Exception as e:
                stats["errors"] += 1
                print("  error:", e)
                continue
            with lock:
                if not items:
                    fs.write(json.dumps({"chunk_id": rec["id"], "domain": rec["_domain"]}) + "\n")
                    stats["skipped"] += 1
                for i, it in enumerate(items):
                    q = {
                        "id": "q-" + hashlib.sha1(f"{rec['id']}|{i}|{it['question']}".encode()).hexdigest()[:12],
                        "split": args.split,
                        "question": it["question"],
                        "lang": it["lang"],
                        "domain": rec["_domain"],
                        "kind": rec.get("kind", "act"),
                        "gold_chunk_ids": [rec["id"]],
                        "gold_group": rec["_group"],
                        "act": rec.get("act_title", ""),
                        "section": rec.get("section_no", ""),
                        "case_title": rec.get("case_title", ""),
                        "citation": rec.get("citation", ""),
                        "reference_answer": it["answer"],
                        "source_text": rec["text"],
                        "chunk_id": rec["id"],
                        "generator": MODEL,
                        "created": time.strftime("%Y-%m-%d"),
                    }
                    fo.write(json.dumps(q, ensure_ascii=False) + "\n")
                    stats["questions"] += 1
                fo.flush()
                fs.flush()
            if n % 10 == 0 or n == len(futures):
                el = time.time() - t0
                print(f"  {n}/{len(futures)} chunks  {dict(stats)}  {el / 60:.1f} min, "
                      f"~{el / n * (len(futures) - n) / 60:.0f} min left", flush=True)
    print("done:", dict(stats))


def check(paths):
    """Leakage check: no gold_group may appear in two different splits."""
    where = defaultdict(set)
    counts = Counter()
    for p in paths:
        for line in open(p, encoding="utf-8"):
            if line.strip():
                q = json.loads(line)
                where[q["gold_group"]].add(q["split"])
                counts[(q["split"], q["domain"], q["lang"])] += 1
    leaks = {g: s for g, s in where.items() if len(s) > 1}
    for k in sorted(counts):
        print(f"  {k[0]:5s} {k[1]:15s} {k[2]}  {counts[k]}")
    if leaks:
        print(f"LEAKAGE: {len(leaks)} groups in more than one split, e.g. {list(leaks.items())[:3]}")
        sys.exit(1)
    print(f"OK: no leakage across {len(where)} groups")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--split", choices=SPLITS)
    ap.add_argument("--per-domain", type=int, default=34, help="chunks per domain (2 questions each)")
    ap.add_argument("--limit", type=int, default=0, help="only this many chunks (trial)")
    ap.add_argument("--workers", type=int, default=4, help="parallel requests (LM Studio 'Parallel')")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out")
    ap.add_argument("--check", nargs="+", metavar="FILE")
    a = ap.parse_args()
    if a.check:
        check(a.check)
    elif a.split and a.out:
        run(a)
    else:
        ap.error("give --split and --out, or --check FILE...")
