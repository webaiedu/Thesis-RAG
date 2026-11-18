"""
prepare_cases.py - turn the downloaded Supreme Court PDFs into backend/data/cases.jsonl.

    python fetch_cases.py          # first: download (see that file)
    python prepare_cases.py        # writes ../backend/data/cases.jsonl + raw_cases/cases_report.csv
    python prepare_cases.py --no-ocr   # faster test run: skip OCR (legacy-font Bangla pages are dropped)

Then embed it:  cd ../retrieval && python ingest.py cases

How it works
  * SCOB volumes: every judgment page carries a running header
        "19 SCOB [2024] AD   Shahin Vs. The State   (Md. Abu Zafor Siddique, J)   148"
    Consecutive pages with the same header title are one case. The citation is the
    volume, year, division and the case's first page number: "19 SCOB [2024] AD 148".
    Front matter and the summary tables ("Cases of the Appellate Division") are skipped;
    the same editor's note / key words appear at the start of each judgment.
  * Single judgments (raw_cases/judgments/*.pdf): one PDF = one case; the parties,
    case number and date are read from the first page.
  * Text comes from the PDF text layer. Pages that are scanned, or typed in old
    non-Unicode Bangla fonts (SutonnyMJ / AdarshaLipi, which extract as gibberish such as
    "wePvicwZ"), are read with OCR (EasyOCR, Bangla + English) instead; their chunks are
    marked text_source = "ocr".
  * Only whitespace is normalised. The wording of judgments is never changed.

Each output line is one chunk (about 1,500 characters) of one judgment:
  id, kind="case", case_title, citation, court, judge, decided, case_no, key_words,
  source, source_url (official PDF, opened at the case's page), part, parts_total,
  text_source, text
"""
import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np
import pymupdf

HERE = Path(__file__).parent
RAW = HERE / "raw_cases"
OUT = HERE.parent / "backend" / "data" / "cases.jsonl"
REPORT = RAW / "cases_report.csv"
sys.path.insert(0, str(HERE.parent / "retrieval"))  # reuse the OCR of the retrieval service

MAX_CHARS = 1500
COURTS = {"AD": "Appellate Division", "HCD": "High Court Division"}
HEADER_BAND = 0.075  # running header lives in the top 7.5% of the page
OCR_DPI = 250

HEADER = re.compile(r"(\d+)\s*SCOB\s*\[\s*(\d{4})\s*\]\s*(AD|HCD)\b\s*(.*)", re.S)
LEGACY_FONT = re.compile(r"SutonnyMJ|SutonnyOMJ|AdarshaLipi|MJ$|MJ[-,]|Bijoy|Sulekha|Boishakhi", re.I)
BROKEN_GLYPH = re.compile(r"[ǀ-ɏ]")  # e.g. "Ǯনৗ": Unicode Bangla font with a bad ToUnicode map
BANGLA = re.compile(r"[ঀ-৿]")


def norm(s: str) -> str:
    return unicodedata.normalize("NFC", " ".join(s.split()))


# ---------------- reading pages ----------------

_ocr = None


def ocr_clip(page, clip) -> str:
    global _ocr
    if _ocr is None:
        import files  # retrieval/files.py: EasyOCR bn+en, GPU when available

        _ocr = files.ocr
    pix = page.get_pixmap(dpi=OCR_DPI, clip=clip)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        img = img[:, :, :3]
    return _ocr(np.ascontiguousarray(img))


MOSTLY_LEGACY = 0.3  # above this share of old-font text the whole page is OCR'd


def read_page(page, use_ocr: bool):
    """(header text, body text, how the body was read, header in an old Bangla font?).
    how: text | text+ocr (a few old-font lines OCR'd) | ocr (whole page) | skipped."""
    H = page.rect.height
    band = HEADER_BAND * H
    head, body, legacy, chars, head_legacy = [], [], 0, 0, 0
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        para = []  # one text block below the header = one paragraph; items: str or line bbox to OCR
        for l in b["lines"]:
            text = "".join(s["text"] for s in l["spans"])
            old = sum(len(s["text"].strip()) for s in l["spans"] if LEGACY_FONT.search(s["font"]))
            if l["bbox"][1] < band:  # line by line: a block can start in the header band
                head.append(text)
                head_legacy += old
                continue
            chars += len(text.strip())
            legacy += old
            para.append(pymupdf.Rect(l["bbox"]) if old > 2 else text)
        if para:
            body.append(para)
    head_text = norm(" ".join(head))
    head_legacy = head_legacy > 10
    plain = "\n".join(norm(" ".join(x for x in p if isinstance(x, str))) for p in body)
    broken = len(BROKEN_GLYPH.findall(plain)) > 5
    whole_page = chars < 40 or broken or (legacy > 40 and legacy / max(chars, 1) > MOSTLY_LEGACY)
    if whole_page:  # scanned, mostly old-font Bangla, or broken glyphs: OCR the page
        if not use_ocr:
            return head_text, "", "skipped", head_legacy
        clip = pymupdf.Rect(0, band, page.rect.width, H)
        return head_text, norm_paragraphs(ocr_clip(page, clip)), "ocr", head_legacy

    # Mostly good text: keep it, OCR only the lines typed in an old Bangla font.
    used_ocr, paras = False, []
    for p in body:
        parts = []
        for x in p:
            if isinstance(x, str):
                parts.append(x)
            elif use_ocr:
                used_ocr = True
                parts.append(ocr_clip(page, x + (-2, -2, 2, 2)).replace("\n", " "))
            # without OCR an old-font line is dropped rather than kept as gibberish
        t = norm(" ".join(parts))
        if t:
            paras.append(t)
    return head_text, "\n".join(paras), "text+ocr" if used_ocr else "text", head_legacy


def norm_paragraphs(text: str) -> str:
    return "\n".join(norm(p) for p in text.split("\n") if p.strip())


def parse_header(text: str):
    """'19 SCOB [2024] AD Shahin Vs. The State (Md. Abu Zafor Siddique, J) 148'
    -> (vol, year, div, title, judge, page_no) or None."""
    m = HEADER.search(text)
    if not m:
        return None
    vol, year, div, rest = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
    nums = re.findall(r"(?<![\d.])(\d{1,4})(?![\d.])", text[: m.start()] + " " + rest)
    page_no = int(nums[-1]) if nums else None
    rest = re.sub(r"\s*\d{1,4}\s*$", "", rest).strip()
    # "(Muhammad Imman Ali, J)", "(Hasan Foez Siddique, CJ)", "(Minority View)" are not part of
    # the case name; "(Rtd)", "(Saudi)", "(BTRC)" are.
    judges, ends = [], []

    def drop(m):
        inner = norm(m.group(1)).rstrip(", ")
        if re.search(r"(,|\b)\s*C\.?\s*J\.?$|,\s*J\.?$|\bJJ?\.?$|Majority|Minority|View|Justice|বিচারপতি", inner, re.I):
            if not re.search(r"Majority|Minority|View", inner, re.I):
                judges.append(inner)
            ends.append(m.end())
            return "\x00" * len(m.group(0))  # same length, so positions stay valid
        return m.group(0)

    marked = re.sub(r"[(\[]([^()\[\]]{2,80})(?:[)\]]|\s*$)", drop, rest)
    if ends:  # anything after the judge's name is the page number or body text
        marked = marked[: max(ends)]
    title = norm(marked.replace("\x00", " "))
    title = norm(re.sub(r"\s*\d{1,4}\s*$", "", title))
    return vol, year, div, title, "; ".join(dict.fromkeys(judges)), page_no


def title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9ঀ-৿]", "", title.lower())[:40]


# ---------------- facts from the judgment text ----------------

DATE = (
    r"(\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}"
    r"|\d{1,2}(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?[A-Z][a-z]+,?\s+\d{4}"
    r"|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})"
)
DECIDED = re.compile(
    r"(?:Date\s+of\s+(?:the\s+)?(?:judgment|delivery\s+of\s+judgment)|Judgment\s+(?:delivered\s+|pronounced\s+)?on"
    r"|Judgment\s*:\s*(?:on)?|Judgment\s+dated|Delivered\s+on|Decided\s+on)\s*(?:and\s+order)?\s*[:.\-]*\s*(?:the\s+)?" + DATE,
    re.I,
)
BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def facts(text: str) -> dict:
    head = text[:8000]
    out = {}
    m = DECIDED.search(head) or DECIDED.search(head.translate(BN_DIGITS))
    if not m:  # Bangla judgments: "রায় প্রদানের তারিখ: ১২.০৩.২০২৩"
        m = re.search(r"রায়[^\n:]{0,25}তারিখ\s*[:ঃ]?\s*" + DATE, head.translate(BN_DIGITS))
    if m:
        out["decided"] = re.sub(r"\s*([./-])\s*", r"\1", norm(m.group(1)))
    m = re.search(
        r"((?:CIVIL|CRIMINAL|CRIMINAL MISCELLANEOUS|WRIT|JAIL|CIVIL REVIEW|CRIMINAL REVIEW|CIVIL MISCELLANEOUS|DEATH|COMPANY|ADMIRALTY|ARBITRATION|FIRST|ELECTION|TAX|VAT|CONTEMPT|SUO MOTU)"
        r"[A-Z ().,]*?(?:APPEAL|PETITION|REVISION|REFERENCE|RULE|MATTER|CASE|PROCEEDING)S?[A-Z ().,]*?\bNOS?\b\.?\s*[\d\-–,& ]+(?:OF|of)\s*\d{4})",
        head,
        re.I,
    )
    if m:
        out["case_no"] = norm(m.group(1))
    m = re.search(r"Key\s*Words?\s*[:.]\s*([^\n]+)", head)
    if m:
        kw = m.group(1)[:500]
        # The key words are a ";"-separated list; the PDF sometimes runs the next paragraph on.
        if ";" in kw:
            kw = kw[: kw.rfind(";") + 1] if len(kw) > 200 else kw
        out["key_words"] = norm(kw).rstrip(";").strip()
    return out


# ---------------- chunks ----------------

def split_long(p: str) -> list:
    if len(p) <= MAX_CHARS:
        return [p]
    out, cur = [], ""
    for s in re.split(r"(?<=[.?!।])\s+", p):
        if cur and len(cur) + len(s) + 1 > MAX_CHARS:
            out.append(cur)
            cur = ""
        while len(s) > MAX_CHARS:  # one huge "sentence" (tables, lists)
            out.append(s[:MAX_CHARS])
            s = s[MAX_CHARS:]
        cur = f"{cur} {s}".strip()
    if cur:
        out.append(cur)
    return out


def chunk(body: str) -> list:
    out, cur = [], ""
    for p in body.split("\n"):
        for piece in split_long(p):
            if cur and len(cur) + len(piece) + 1 > MAX_CHARS:
                out.append(cur)
                cur = ""
            cur = f"{cur}\n{piece}".strip()
    if cur:
        out.append(cur)
    return out


def load_overrides() -> dict:
    """case_overrides.csv: details checked by hand against the official PDF, for cases whose
    header is typed in a non-Unicode Bangla font (unreadable without OCR)."""
    f = HERE / "case_overrides.csv"
    if not f.exists():
        return {}
    with f.open(encoding="utf-8", newline="") as fh:
        return {r["citation"]: r for r in csv.DictReader(fh)}


OVERRIDES = load_overrides()


def case_records(case: dict) -> list:
    body = "\n".join(case["pages"])
    f = facts(body)
    fix = OVERRIDES.get(case["citation"])
    if fix:
        case["title"] = fix["case_title"] or case["title"]
        case["judge"] = fix["judge"] or case["judge"]
        f.update({k: fix[k] for k in ("decided", "case_no") if fix.get(k)})
    parts = chunk(body)
    sources = Counter(case["how"])
    ocr_pages = sources["ocr"] + sources["text+ocr"]
    text_source = "ocr" if sources["ocr"] > sources["text"] else ("text+ocr" if ocr_pages else "text")
    case["skipped"] = sources["skipped"]
    title = case["title"] or "Untitled case"
    cite = case["citation"]
    head1 = f"{title}\n{cite} — {COURTS.get(case['div'], case['div'])}"
    if case["judge"]:
        head1 += f" ({case['judge']})"
    if f.get("decided"):
        head1 += f", judgment dated {f['decided']}"
    recs = []
    for i, part in enumerate(parts, 1):
        lines = [head1]
        if i == 1 and f.get("key_words"):
            lines.append(f"Key words: {f['key_words']}")
        lines += ["---", part]
        recs.append(
            {
                "id": f"{case['id']}-p{i}",
                "kind": "case",
                "case_title": title,
                "citation": cite,
                "court": COURTS.get(case["div"], case["div"]),
                "judge": case["judge"],
                "decided": f.get("decided", ""),
                "case_no": f.get("case_no", ""),
                "key_words": f.get("key_words", ""),
                "source": case["source"],
                "source_url": case["url"],
                "part": i,
                "parts_total": len(parts),
                "text_source": text_source,
                "text": "\n".join(lines),
            }
        )
    return recs


# ---------------- SCOB volumes ----------------

def scob_cases(pdf: Path, url: str, use_ocr: bool) -> list:
    doc = pymupdf.open(pdf)
    cases, cur = [], None
    for i, page in enumerate(doc):
        head, body, how, head_legacy = read_page(page, use_ocr)
        h = parse_header(head)
        if not h or not h[3] or h[3].lower().startswith("cases of the"):
            cur = None  # front matter / summary tables / index
            continue
        vol, year, div, title, judge, page_no = h
        key = (div, title_key(title))
        if cur is None or cur["key"] != key:
            if head_legacy and use_ocr:  # title typed in an old Bangla font: read it by OCR
                band = pymupdf.Rect(0, 0, page.rect.width, HEADER_BAND * page.rect.height)
                oh = parse_header(norm(ocr_clip(page, band).replace("\n", " ")))
                if oh:
                    title, judge = oh[3], oh[4]
            cite = f"{vol} SCOB [{year}] {div}" + (f" {page_no}" if page_no else "")
            cur = {
                "key": key,
                "id": f"scob-{vol}-{div.lower()}-{page_no or i + 1}",
                "title": title,
                "judge": judge,
                "div": div,
                "citation": cite,
                "source": f"Supreme Court Online Bulletin, Vol. {vol} ({year})",
                "url": f"{url}#page={i + 1}",
                "pages": [],
                "how": [],
                "pdf_pages": [i + 1, i + 1],
            }
            cases.append(cur)
        cur["pdf_pages"][1] = i + 1
        cur["how"].append(how)
        if body:
            cur["pages"].append(body)
    return cases


# ---------------- single judgments ----------------

def judgment_case(pdf: Path, url: str, division: str, use_ocr: bool) -> dict:
    doc = pymupdf.open(pdf)
    pages, how = [], []
    for page in doc:
        _, body, h, _ = read_page(page, use_ocr)
        how.append(h)
        if body:
            pages.append(body)
    first = "\n".join(pages[:2])
    div = "AD" if re.search(r"APPELLATE\s+DIVISION", first[:800], re.I) else (
        "HCD" if re.search(r"HIGH\s+COURT\s+DIVISION", first[:800], re.I) else division or "")
    title = ""
    m = re.search(r"\n([^\n]{3,200}?)\s*[:.…]*\s*\.{2,}\s*(?:Appellant|Petitioner)s?.*?(?:-?\s*Versus\s*-?|\bVs\.?)\s*\n([^\n]{3,200}?)\s*[:.…]*\s*\.{2,}\s*(?:Respondent|Opposite)", first, re.S | re.I)
    if m:
        a = re.split(r",\s*(?:represented|son of|wife of|daughter of)|,", m.group(1), maxsplit=1)[0]
        b = re.split(r",\s*(?:represented|son of|wife of|daughter of)|,", m.group(2), maxsplit=1)[0]
        title = norm(f"{a} Vs. {b}")
    f = facts(first)
    cite = f.get("case_no") or pdf.stem
    return {
        "id": "sc-" + re.sub(r"[^a-z0-9]+", "-", pdf.stem.lower()).strip("-"),
        "title": title or f.get("case_no") or pdf.stem,
        "judge": "",
        "div": div,
        "citation": cite,
        "source": "Supreme Court of Bangladesh, judgment (supremecourt.gov.bd)",
        "url": url,
        "pages": pages,
        "how": how,
        "pdf_pages": [1, doc.page_count],
    }


# ---------------- main ----------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-ocr", action="store_true", help="skip OCR (test run)")
    ap.add_argument("--only", nargs="*", default=[], help="only these PDF file names")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    use_ocr = not args.no_ocr

    manifest = {}
    mf = RAW / "manifest.csv"
    if mf.exists():
        with mf.open(encoding="utf-8", newline="") as f:
            manifest = {r["file"]: r for r in csv.DictReader(f)}
    if not manifest:
        sys.exit("raw_cases/manifest.csv not found. Run fetch_cases.py first.")

    records, report, seen = [], [], set()
    for key, row in sorted(manifest.items()):
        pdf = RAW / key
        if args.only and pdf.name not in args.only:
            continue
        if not pdf.exists():
            print(f"missing {pdf}, skipped")
            continue
        print(f"{key} ...", flush=True)
        if row["source"] == "SCOB":
            cases = scob_cases(pdf, row["url"], use_ocr)
        else:
            cases = [judgment_case(pdf, row["url"], row.get("division", ""), use_ocr)]
        for c in cases:
            if not c["pages"]:
                continue
            while c["id"] in seen:  # two cases on one page number: keep ids unique
                c["id"] += "x"
            seen.add(c["id"])
            recs = case_records(c)
            records += recs
            report.append(
                {
                    "file": key,
                    "id": c["id"],
                    "citation": c["citation"],
                    "case_title": c["title"],
                    "judge": c["judge"],
                    "pdf_pages": f"{c['pdf_pages'][0]}-{c['pdf_pages'][1]}",
                    "chunks": len(recs),
                    "text_source": recs[0]["text_source"],
                    "pages_skipped": c["skipped"],  # old-font Bangla / scanned pages left out (--no-ocr)
                    "decided": recs[0]["decided"],
                    "url": c["url"],
                }
            )
        print(f"   {len(cases)} cases", flush=True)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with REPORT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(report[0]) if report else ["file"])
        w.writeheader()
        w.writerows(report)
    src = Counter(r["text_source"] for r in report)
    print(f"\n{len(report)} cases, {len(records)} chunks -> {out}")
    print(f"text sources: {dict(src)}   report: {REPORT}")


if __name__ == "__main__":
    main()
