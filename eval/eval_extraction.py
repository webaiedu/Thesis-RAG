"""
File-extraction benchmark: send every benchmark file to the retrieval service's /extract (the same call the
app makes on upload) and compare the text with the known ground truth.

    python3 eval_extraction.py --url http://localhost:8000 --out runs/extraction-before.json

Per file: method (text layer / ocr / markitdown), seconds, characters, CER and WER against the ground
truth (whitespace-normalised). Summary by format (text / scan / photo) and language.
The photo path's vision-model description is not part of this (it is an LLM, measured in the answers).
Uses only the Python standard library.
"""
import argparse
import json
import mimetypes
import re
import time
import urllib.request
import uuid
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
FILES = HERE / "data" / "files"


def post_file(url, path):
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix == ".docx":
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(url.rstrip("/") + "/extract", data=body,
                                 headers={"content-type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.loads(r.read())


def norm(s):
    s = re.sub(r"[#*_>|`]", " ", s or "")
    return re.sub(r"\s+", " ", s).strip()


def edit_distance(a, b):
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def rates(truth, got):
    t, g = norm(truth), norm(got)
    cer = edit_distance(t, g) / max(1, len(t))
    tw, gw = t.split(), g.split()
    wer = edit_distance(tw, gw) / max(1, len(tw))
    return round(cer, 4), round(wer, 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--out", default=str(HERE / "runs" / "extraction.json"))
    a = ap.parse_args()
    manifest = [json.loads(l) for l in open(FILES / "manifest.jsonl", encoding="utf-8")]
    rows = []
    for m in manifest:
        t0 = time.time()
        try:
            ex = post_file(a.url, FILES / m["file"])
            err = None
        except Exception as e:  # noqa: BLE001
            ex, err = {"text": "", "method": "error", "kind": "?"}, str(e)
        sec = round(time.time() - t0, 2)
        cer, wer = rates(m["truth"], ex.get("text", ""))
        rows.append({"file": m["file"], "doc": m["doc"], "format": m["format"], "lang": m["lang"],
                     "kind": ex.get("kind"), "method": ex.get("method"), "seconds": sec,
                     "chars": len(ex.get("text") or ""), "cer": cer, "wer": wer, "error": err})
        print(f"{m['file']:32s} {m['format']:5s} {m['lang']}  {ex.get('method','?'):10s} {sec:6.1f}s  CER {cer:.3f}  WER {wer:.3f}"
              + (f"  ERROR {err[:80]}" if err else ""))
    groups = defaultdict(list)
    for r in rows:
        groups[(r["format"], r["lang"])].append(r)
    summary = []
    print("\nformat lang  n   CER    WER    seconds")
    for k in sorted(groups):
        g = groups[k]
        s = {"format": k[0], "lang": k[1], "n": len(g),
             "cer": round(sum(r["cer"] for r in g) / len(g), 4), "wer": round(sum(r["wer"] for r in g) / len(g), 4),
             "seconds": round(sum(r["seconds"] for r in g) / len(g), 2)}
        summary.append(s)
        print(f"{k[0]:6s} {k[1]:4s} {s['n']:2d}  {s['cer']:.3f}  {s['wer']:.3f}  {s['seconds']:.1f}")
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"files": rows, "summary": summary}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
