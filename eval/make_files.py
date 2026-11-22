"""
Build the file-upload benchmark from file_docs.py (run with the retrieval venv: needs PyMuPDF, Pillow, numpy,
python-docx):

    python make_files.py                 # -> data/files/*.{pdf,docx,jpg}, data/files/manifest.jsonl,
                                         #    data/review/file_questions.csv (for the team check)

Each law document is made in 3 formats so the same questions test 3 extraction paths:
  text   .docx (MarkItDown) or .pdf with a real text layer (PyMuPDF)
  scan   .pdf whose pages are images only (EasyOCR)
  photo  .jpg of the page: tilted, uneven light, slight blur (EasyOCR + the vision model)
The ground-truth text of every file is kept in the manifest, so OCR accuracy (CER) can be measured.
Deterministic: fixed random seed, so the files can be rebuilt identically.
"""
import csv
import io
import json
import random
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageEnhance, ImageFilter

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from file_docs import DOCS, GENERAL_DOCS  # noqa: E402

OUT = HERE / "data" / "files"
QCSV = HERE / "data" / "review" / "file_questions.csv"
BN_FONT_DIR = "/usr/share/fonts/truetype/lohit-bengali"
BN_FONT = "Lohit-Bengali.ttf"
QCOLS = ["question", "lang", "type", "expected_route", "domain", "gold_chunk_ids", "reference_answer",
         "reviewer", "notes", "file", "doc", "format", "recheck", "team_decision", "file_text", "gold_text"]


def truth_text(d):
    return (d["title"] + "\n\n" + d["body"]).strip()


def html_of(d):
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    lines = "".join(f"<p>{esc(l) if l.strip() else '&nbsp;'}</p>" for l in d["body"].split("\n"))
    return f"<h2>{esc(d['title'])}</h2>{lines}"


CSS = (f"@font-face {{font-family: bn; src: url({BN_FONT});}} "
       "* {font-family: bn, sans-serif; font-size: 10.5pt; line-height: 1.35;} "
       "h2 {font-size: 14pt; text-align: center; margin-bottom: 10pt;} p {margin: 0 0 3pt 0;}")


def text_pdf(d):
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)  # A4
    arch = pymupdf.Archive(BN_FONT_DIR)
    rc = page.insert_htmlbox(pymupdf.Rect(56, 56, 539, 800), html_of(d), css=CSS, archive=arch)
    if isinstance(rc, tuple) and rc[0] < 0:
        raise ValueError(f"{d['doc']}: text does not fit on one page")
    return doc


def page_image(d, dpi):
    pdf = text_pdf(d)
    pix = pdf[0].get_pixmap(dpi=dpi)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def scanned(img, rnd):
    g = img.convert("L").rotate(rnd.uniform(-0.8, 0.8), expand=False, fillcolor=255, resample=Image.BICUBIC)
    a = np.asarray(g).astype(np.float32)
    a = a + np.random.default_rng(rnd.randint(0, 9999)).normal(0, 9, a.shape)  # scanner noise
    a = np.clip(a * 0.95 + 8, 0, 255).astype(np.uint8)
    return Image.fromarray(a).filter(ImageFilter.GaussianBlur(0.4))


def photo(img, rnd):
    w, h = img.size
    # paper on a darker desk, slightly rotated and in perspective
    canvas = Image.new("RGB", (int(w * 1.12), int(h * 1.08)), (92, 78, 64))
    canvas.paste(img, (int(w * 0.06), int(h * 0.04)))
    canvas = canvas.rotate(rnd.uniform(-3.5, 3.5), expand=False, fillcolor=(92, 78, 64), resample=Image.BICUBIC)
    W, H = canvas.size
    dx, dy = W * 0.035, H * 0.02
    coeffs = _persp([(rnd.uniform(0, dx), rnd.uniform(0, dy)), (W - rnd.uniform(0, dx), rnd.uniform(0, dy)),
                     (W - rnd.uniform(0, dx), H - rnd.uniform(0, dy)), (rnd.uniform(0, dx), H - rnd.uniform(0, dy))],
                    [(0, 0), (W, 0), (W, H), (0, H)])
    canvas = canvas.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(92, 78, 64))
    # uneven light: darker towards one corner
    yy, xx = np.mgrid[0:H, 0:W]
    shade = 1.0 - 0.28 * ((xx / W) * 0.6 + (yy / H) * 0.4)
    a = np.asarray(canvas).astype(np.float32) * shade[..., None]
    canvas = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    canvas = ImageEnhance.Color(canvas).enhance(0.9)
    return canvas.resize((int(W * 0.8), int(H * 0.8)), Image.LANCZOS)


def _persp(src, dst):
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    a = np.array(m, dtype=np.float64)
    b = np.array(src, dtype=np.float64).reshape(8)
    return np.linalg.solve(a, b).tolist()


def save_docx(d, path):
    import docx
    from docx.shared import Pt
    doc = docx.Document()
    doc.add_heading(d["title"], level=1)
    for line in d["body"].split("\n"):
        p = doc.add_paragraph(line)
        for r in p.runs:
            r.font.size = Pt(11)
            r.font.name = "Lohit Bengali" if d["lang"] == "bn" else "Calibri"
    doc.save(path)


def save_scan_pdf(img, path):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, stream=buf.getvalue())
    doc.save(path, deflate=True)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(20261122)
    manifest, qrows = [], []

    def add(d, fmt, fname):
        manifest.append({"file": fname, "doc": d["doc"], "format": fmt, "lang": d["lang"], "truth": truth_text(d)})

    for d in DOCS:
        base = d["doc"]
        if d["text_format"] == "docx":
            fname = f"{base}.docx"
            save_docx(d, OUT / fname)
        else:
            fname = f"{base}.pdf"
            text_pdf(d).save(OUT / fname, deflate=True)
        files = {"text": fname}
        add(d, "text", fname)
        save_scan_pdf(scanned(page_image(d, 150), rnd), OUT / f"{base}-scan.pdf")
        files["scan"] = f"{base}-scan.pdf"
        add(d, "scan", files["scan"])
        photo(page_image(d, 170), rnd).save(OUT / f"{base}-photo.jpg", "JPEG", quality=82)
        files["photo"] = f"{base}-photo.jpg"
        add(d, "photo", files["photo"])
        for fmt, f in files.items():
            for q, gold, ans in d["questions"]:
                qrows.append({"question": q, "lang": d["lang"], "type": "file", "expected_route": "law",
                              "domain": d["domain"], "gold_chunk_ids": gold, "reference_answer": ans,
                              "reviewer": "claude", "notes": "", "file": f, "doc": base, "format": fmt})

    for d in GENERAL_DOCS:
        base, fmt = d["doc"], d["format"]
        if fmt == "pdf":
            fname = f"{base}.pdf"
            text_pdf(d).save(OUT / fname, deflate=True)
            fmt = "text"
        elif fmt == "docx":
            fname = f"{base}.docx"
            save_docx(d, OUT / fname)
            fmt = "text"
        elif fmt == "scan":
            fname = f"{base}-scan.pdf"
            save_scan_pdf(scanned(page_image(d, 150), rnd), OUT / fname)
        else:
            fname = f"{base}-photo.jpg"
            photo(page_image(d, 170), rnd).save(OUT / fname, "JPEG", quality=82)
        add(d, fmt, fname)
        qrows.append({"question": d["question"], "lang": d["lang"], "type": "file_general",
                      "expected_route": "general", "domain": "", "gold_chunk_ids": "",
                      "reference_answer": d["answer"], "reviewer": "claude", "notes": "", "file": fname,
                      "doc": base, "format": fmt})

    with open(OUT / "manifest.jsonl", "w", encoding="utf-8") as f:
        for m in manifest:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    # keep the team's recheck columns if the sheet already exists
    old = {}
    if QCSV.exists():
        with open(QCSV, encoding="utf-8-sig", newline="") as f:
            old = {(r["file"], r["question"]): r for r in csv.DictReader(f)}
    texts = {}
    for p in (HERE.parent / "backend" / "data").glob("*.jsonl"):
        for line in open(p, encoding="utf-8"):
            if line.strip():
                c = json.loads(line)
                texts[c["id"]] = c["text"]
    truth = {m["file"]: m["truth"] for m in manifest}
    for r in qrows:
        r["file_text"] = truth[r["file"]]
        r["gold_text"] = "\n\n".join(texts[g] for g in r["gold_chunk_ids"].split(";") if g)
    with open(QCSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=QCOLS)
        w.writeheader()
        for r in qrows:
            prev = old.get((r["file"], r["question"]), {})
            r["recheck"] = prev.get("recheck") or ("yes" if r["format"] == "text" else "")
            r["team_decision"] = prev.get("team_decision", "")
            w.writerow(r)
    print(f"{len(manifest)} files in {OUT}, {len(qrows)} questions in {QCSV}")


if __name__ == "__main__":
    build()
