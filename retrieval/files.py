"""
Text from uploaded files, fully local.

- Digital PDF pages: text layer via PyMuPDF.
- Scanned PDF pages and images: EasyOCR with Bangla + English models (GPU when available).
  Photos of any common format (incl. iPhone HEIC) are also returned as a small JPEG for
  the vision model.
- Office files, HTML, e-books, Outlook mail: MarkItDown (local converters only).
- Text and code files: decoded directly.
- rank(): splits a long document into passages and returns the ones closest to a
  question, using the same embedding model as the law search.
"""
import base64
import hashlib
import io
import os
import threading
from collections import OrderedDict
from pathlib import PurePath

import numpy as np

import common

OCR_LANGS = os.getenv("OCR_LANGS", "bn,en").split(",")
MAX_PAGES = int(os.getenv("MAX_PDF_PAGES", "60"))
MAX_OCR_PAGES = int(os.getenv("MAX_OCR_PAGES", "30"))
OCR_DPI = int(os.getenv("OCR_DPI", "200"))
MIN_PAGE_TEXT = 40  # fewer characters than this on a page -> treat it as scanned

_reader = None
_ocr_lock = threading.Lock()


def _ocr_reader():
    global _reader
    if _reader is None:
        import easyocr
        import torch

        _reader = easyocr.Reader(OCR_LANGS, gpu=torch.cuda.is_available(), verbose=False)
    return _reader


def ocr(image) -> str:
    """image: encoded bytes (png/jpg/...) or an HxWxC uint8 array."""
    with _ocr_lock:  # one OCR job at a time keeps GPU memory predictable
        lines = _ocr_reader().readtext(image, detail=0, paragraph=True)
    return "\n".join(l.strip() for l in lines if l.strip())


def _clean(text: str) -> str:
    lines = [" ".join(l.split()) for l in text.splitlines()]
    out, blank = [], False
    for l in lines:
        if l:
            out.append(l)
            blank = False
        elif not blank:
            out.append("")
            blank = True
    return "\n".join(out).strip()


def extract_pdf(data: bytes) -> dict:
    import pymupdf

    doc = pymupdf.open(stream=data, filetype="pdf")
    total = doc.page_count
    parts, ocr_pages, skipped = [], 0, 0
    for i, page in enumerate(doc):
        if i >= MAX_PAGES:
            break
        text = page.get_text("text").strip()
        if len(text) < MIN_PAGE_TEXT:
            if ocr_pages >= MAX_OCR_PAGES:
                skipped += 1
                continue
            pix = page.get_pixmap(dpi=OCR_DPI)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 4:
                img = img[:, :, :3]
            text = ocr(np.ascontiguousarray(img))
            ocr_pages += 1
        if text:
            parts.append(f"[Page {i + 1}]\n{_clean(text)}")
    method = "text" if ocr_pages == 0 else ("ocr" if ocr_pages == len(parts) else "text+ocr")
    notes = []
    if total > MAX_PAGES:
        notes.append(f"Only the first {MAX_PAGES} of {total} pages were read.")
    if skipped:
        notes.append(f"{skipped} scanned page(s) were skipped (OCR limit {MAX_OCR_PAGES}).")
    return {"text": "\n\n".join(parts), "pages": total, "method": method, "notes": notes}


# ---------------- file types ----------------

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".heic", ".heif", ".avif"}
# Converted by MarkItDown. (No zip: it could hold audio, which MarkItDown transcribes online.)
DOC_EXT = {".docx", ".pptx", ".xlsx", ".xls", ".html", ".htm", ".epub", ".msg", ".ipynb"}
MEDIA_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv"}
OLD_OFFICE = {".doc": "Word", ".ppt": "PowerPoint"}


class Unsupported(ValueError):
    """The file type can't be read; the message is shown to the user."""


def detect(content_type: str, filename: str) -> str:
    """pdf | image | doc | text, or raises Unsupported."""
    ext = PurePath(filename.lower()).suffix
    ctype = (content_type or "").lower()
    if ext == ".pdf" or ctype == "application/pdf":
        return "pdf"
    if ext in IMAGE_EXT or ctype.startswith("image/"):
        return "image"
    if ext in MEDIA_EXT or ctype.startswith(("audio/", "video/")):
        raise Unsupported("Audio and video files aren't supported. Upload a PDF, photo, document or text file.")
    if ext in OLD_OFFICE:
        raise Unsupported(f"Old {OLD_OFFICE[ext]} files ({ext}) aren't supported. Save it as {ext}x or PDF and try again.")
    if ext in DOC_EXT:
        return "doc"
    return "text"  # anything else: read it if it is text, otherwise refuse


# ---------------- images ----------------

_heif_ready = False


def _open_image(data: bytes):
    global _heif_ready
    from PIL import Image, ImageOps

    if not _heif_ready:
        try:
            import pillow_heif

            pillow_heif.register_heif_opener()  # iPhone photos
        except ImportError:
            pass
        _heif_ready = True
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # phone photos: apply the rotation
        return img.convert("RGB")
    except Exception as e:
        raise Unsupported(f"This image could not be opened ({e}).")


def extract_image(data: bytes) -> dict:
    img = _open_image(data)
    # Very large photos: OCR a downscaled copy (faster, same accuracy for normal text).
    ocr_img = img.copy()
    ocr_img.thumbnail((2600, 2600))
    text = _clean(ocr(np.asarray(ocr_img)))
    # A small JPEG for the vision model (works for any input format).
    small = img.copy()
    small.thumbnail((1600, 1600))
    buf = io.BytesIO()
    small.save(buf, "JPEG", quality=88)
    return {
        "text": text,
        "pages": 1,
        "method": "ocr",
        "notes": [],
        "image": base64.b64encode(buf.getvalue()).decode("ascii"),
    }


# ---------------- documents and text ----------------

_md = None


def extract_doc(data: bytes, filename: str) -> dict:
    global _md
    from markitdown import MarkItDown, StreamInfo

    if _md is None:
        _md = MarkItDown(enable_plugins=False)
    ext = PurePath(filename.lower()).suffix
    result = _md.convert_stream(io.BytesIO(data), stream_info=StreamInfo(extension=ext, filename=filename))
    return {"text": _clean(result.text_content or ""), "pages": 0, "method": "converted", "notes": []}


def extract_text(data: bytes) -> dict:
    for enc in ("utf-8-sig", "utf-16"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise Unsupported("This file type can't be read. Upload a PDF, photo, document (Word, Excel, PowerPoint) or text file.")
    sample = text[:5000]
    printable = sum(c.isprintable() or c in "\n\r\t" for c in sample)
    if not sample or printable / len(sample) < 0.9:
        raise Unsupported("This file type can't be read. Upload a PDF, photo, document (Word, Excel, PowerPoint) or text file.")
    # Keep indentation (code, tables); only drop trailing spaces and long blank runs.
    lines = [l.rstrip() for l in text.replace("\r\n", "\n").split("\n")]
    kept = [l for i, l in enumerate(lines) if l or (i and lines[i - 1])]
    return {"text": "\n".join(kept).strip("\n"), "pages": 0, "method": "text", "notes": []}


def extract(data: bytes, content_type: str, filename: str) -> dict:
    """{kind, text, pages, method, notes[, image]} for any supported file."""
    kind = detect(content_type, filename)
    if kind == "pdf":
        return {"kind": "pdf", **extract_pdf(data)}
    if kind == "image":
        return {"kind": "image", **extract_image(data)}
    if kind == "doc":
        return {"kind": "file", **extract_doc(data, filename)}
    return {"kind": "file", **extract_text(data)}


# ---------------- passages for a question ----------------

_cache: "OrderedDict[str, tuple[list[str], np.ndarray]]" = OrderedDict()
_cache_lock = threading.Lock()


def chunk(text: str, size: int = 900, overlap: int = 150) -> list:
    """Split on paragraph boundaries into passages of about `size` characters."""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        while len(p) > size:  # very long paragraph: hard split
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(p[:size])
            p = p[size - overlap :]
        if len(cur) + len(p) + 2 > size and cur:
            chunks.append(cur)
            cur = cur[-overlap:] + "\n" + p if overlap else p
        else:
            cur = f"{cur}\n\n{p}" if cur else p
    if cur:
        chunks.append(cur)
    return chunks


def _embedded(text: str):
    key = hashlib.sha1(text.encode("utf-8")).hexdigest()
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    passages = chunk(text)
    vecs = np.asarray(common.embed(passages, common.DOC_PREFIX), dtype=np.float32)
    with _cache_lock:
        _cache[key] = (passages, vecs)
        while len(_cache) > 16:
            _cache.popitem(last=False)
    return passages, vecs


def rank(text: str, query: str, k: int) -> list:
    """Top-k passages of `text` for `query`, returned in document order."""
    passages, vecs = _embedded(text)
    if len(passages) <= k:
        return passages
    q = np.asarray(common.embed([query], common.QUERY_PREFIX), dtype=np.float32)[0]
    scores = vecs @ q / (np.linalg.norm(vecs, axis=1) * np.linalg.norm(q) + 1e-9)
    # Always keep the first passage: it usually says what the document is.
    best = [i for i in np.argsort(-scores).tolist() if i != 0][: k - 1]
    return [passages[i] for i in sorted([0, *best])]
