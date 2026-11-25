"""Build the AinSutro page for Firebase Hosting (eval/HUMAN_GUIDE.md, "How it is built").

Run with the retrieval venv (it has PyMuPDF), from anywhere:
    retrieval/.venv/bin/python eval/human_app/site/build.py
Then deploy from eval/human_app/site:  npx -y firebase-tools@13 deploy --only hosting

Writes (all generated, not committed):
  public/config.js         Firebase web config (eval/data/human/firebase.json, not committed) + the store URL (eval/data/human/api.json)
  public/files/<name>      every benchmark file as uploaded (eval/data/files, synthetic documents)
  public/files/pages/...   each file as page images (PDF pages; Word files via LibreOffice; photos as they are)
  public/files/index.json  {file: {original, pages: [...]}} for the page
"""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import pymupdf

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PUB = HERE / "public"
SRC = ROOT / "eval" / "data" / "files"
PAGE_WIDTH = 1240          # px; sharp on phones and laptops, ~150 KB per page as JPEG



def write_config():
    # AinSutro has its own free Firebase project (AinSutro project, name on PC A only), separate from the chatbot's.
    fb = json.loads((ROOT / "eval" / "data" / "human" / "firebase.json").read_text())
    api = json.loads((ROOT / "eval" / "data" / "human" / "api.json").read_text())
    cfg = {"firebase": {k: fb[k] for k in ("apiKey", "authDomain", "projectId", "appId")}, "store": api["url"]}
    (PUB / "config.js").write_text("window.AINSUTRO_CONFIG = " + json.dumps(cfg, indent=1) + ";\n", encoding="utf-8")


def pdf_pages(pdf, stem, out):
    pages = []
    with pymupdf.open(pdf) as doc:
        for i, page in enumerate(doc):
            zoom = PAGE_WIDTH / page.rect.width
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
            name = f"{stem}-p{i + 1}.jpg"
            pix.save(out / name, jpg_quality=82)
            pages.append("files/pages/" + name)
    return pages


def build_files():
    out = PUB / "files"
    if out.exists():
        shutil.rmtree(out)
    (out / "pages").mkdir(parents=True)
    index = {}
    with tempfile.TemporaryDirectory() as tmp:
        for m in map(json.loads, (SRC / "manifest.jsonl").open(encoding="utf-8")):
            name = m["file"]
            src = SRC / name
            shutil.copy2(src, out / name)
            stem, ext = src.stem, src.suffix.lower()
            if ext in (".jpg", ".jpeg", ".png", ".webp"):
                pages = ["files/" + name]
            elif ext == ".pdf":
                pages = pdf_pages(src, stem, out / "pages")
            elif ext in (".docx", ".doc", ".odt"):
                subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, str(src)],
                               check=True, capture_output=True, timeout=180)
                pages = pdf_pages(Path(tmp) / (stem + ".pdf"), stem, out / "pages")
            else:
                pages = []
            index[name] = {"original": "files/" + name, "pages": pages, "format": m.get("format"), "lang": m.get("lang")}
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"files: {len(index)} documents, {sum(len(v['pages']) for v in index.values())} page images, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    write_config()
    build_files()
    print("built", PUB)
