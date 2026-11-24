"""
Find answers that were cut off, and (with --remove) take them out so the normal run command re-does them.

    python3 cut_check.py runs/B0/qwen3-30b runs/B0/qwen3-30b-files            # report only
    python3 cut_check.py runs/B0/qwen3-30b runs/B0/qwen3-30b-files --remove   # back up + remove, then re-run

An answer counts as cut when any of these is true:
  - it reached the OLD effort cap (baseline-v1: low 700 / mid 1500 / high 3000 tokens). Tokens are counted
    exactly with the model's own tokenizer through LM Studio (/v1/completions, usage.prompt_tokens), so the
    answer model (or one with the same tokenizer) must be loaded; --model picks it (default: the loaded one);
  - it ends mid-sentence (no final punctuation, emoji or table edge): catches answers cut by a context
    overflow ("Context size has been exceeded"), which can stop below the cap;
  - the runner marked it ("cut": true / finishReason "length"; runners from 24 Nov on).
A few complete answers also end without punctuation; re-running them is harmless (temperature 0).

--remove keeps backups (answers.before-cap-fix.jsonl, and judgments/scores the same way if the run was
judged), removes the flagged keys from answers.jsonl and judgments.jsonl, and lists them in
cut-removed.jsonl. Then run the usual runner command (it re-does missing keys) and, if judged, score.py judge.
See benchmark/README.md, "Cut-off answers". Standard library only.
"""
import argparse
import json
import re
import shutil
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OLD_CAP = {"low": 700, "mid": 1500, "high": 3000}
ENDS_OK = re.compile(r'([.!?।)\]"”\'*:|>]|[\U0001F300-\U0001FAFF☀-➿])\s*$')
LM = "http://localhost:1234"


def loaded_model():
    data = json.loads(urllib.request.urlopen(f"{LM}/api/v0/models", timeout=30).read())["data"]
    ids = [m["id"] for m in data if m.get("state") == "loaded" and m.get("type", "llm") != "embeddings"]
    if len(ids) != 1:
        sys.exit(f"pass --model: loaded models are {ids}")
    return ids[0]


def count_tokens(model, text):
    body = {"model": model, "prompt": text, "max_tokens": 1, "temperature": 0}
    req = urllib.request.Request(f"{LM}/v1/completions", data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())["usage"]["prompt_tokens"]


def read_jsonl(p):
    return [json.loads(line) for line in open(p, encoding="utf-8") if line.strip()]


def write_jsonl(p, rows):
    with open(p, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def check(run, model, workers):
    rows = read_jsonl(run / "answers.jsonl")
    with ThreadPoolExecutor(workers) as ex:
        tokens = list(ex.map(lambda a: count_tokens(model, a.get("reply") or " "), rows))
    flagged = []
    for a, n in zip(rows, tokens):
        reply = (a.get("reply") or "").rstrip()
        why = []
        if n >= OLD_CAP[a["settings"]["effort"]] - 8:
            why.append(f"old cap ({n} tokens)")
        if reply and not ENDS_OK.search(reply):
            why.append("ends mid-sentence")
        if a.get("cut") or a.get("finishReason") == "length":
            why.append("runner: cut")
        if why:
            flagged.append({"key": a["key"], "effort": a["settings"]["effort"], "tokens": n, "why": why,
                            "end": reply[-60:]})
    return rows, flagged


def remove(run, rows, flagged):
    keys = {f["key"] for f in flagged}
    for name in ("answers", "judgments", "scores"):
        p = run / f"{name}.jsonl"
        if not p.exists():
            continue
        backup = run / f"{name}.before-cap-fix.jsonl"
        if not backup.exists():
            shutil.copy2(p, backup)
        kept = [r for r in read_jsonl(p) if r.get("key") not in keys]
        write_jsonl(p, kept)
    rc = run / "run-config.json"
    if rc.exists() and not (run / "run-config.before-cap-fix.json").exists():
        shutil.copy2(rc, run / "run-config.before-cap-fix.json")
    with open(run / "cut-removed.jsonl", "a", encoding="utf-8") as f:
        for x in flagged:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(f"  removed {len(keys)} answers (backup: answers.before-cap-fix.jsonl); re-run the same runner command"
          + (", then score.py judge" if (run / "judgments.jsonl").exists() else ""))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs", nargs="+", help="run folders with answers.jsonl")
    ap.add_argument("--model", help="LM Studio model id whose tokenizer counts the tokens (default: the loaded one)")
    ap.add_argument("--remove", action="store_true", help="back up, then remove the flagged answers")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    model = a.model or loaded_model()
    print(f"counting tokens with {model}")
    for run in map(Path, a.runs):
        rows, flagged = check(run, model, a.workers)
        by = {}
        for f in flagged:
            for w in f["why"]:
                k = (f["effort"], w.split(" (")[0])
                by[k] = by.get(k, 0) + 1
        print(f"{run}: {len(flagged)} of {len(rows)} answers flagged  {dict(sorted(by.items()))}")
        for f in flagged[:5]:
            print(f"    {f['key']}  {', '.join(f['why'])}  …{f['end']!r}")
        if a.remove and flagged:
            remove(run, rows, flagged)


if __name__ == "__main__":
    main()
