"""
fetch_cases.py - download official Bangladesh Supreme Court case law (for the "cases" database).

Sources (both published by the Supreme Court of Bangladesh, supremecourt.gov.bd):
  1. Supreme Court Online Bulletin (SCOB), the Court's own law report:
         https://www.supremecourt.gov.bd/resources/bulletin/{vol}_SCOB_{year}.pdf
     Every volume is found automatically (vol 1 = 2015, then one or more volumes a year).
  2. Full judgments of the Appellate / High Court Division. Their list pages only open in
     a browser session, so save them from the browser (Ctrl+S, "Webpage, HTML only") and
     pass the saved files:
         Appellate Division: https://www.supremecourt.gov.bd/web/indexn.php?page=judgments.php&menu=00&div_id=1&type_id=5
         High Court Division: https://www.supremecourt.gov.bd/web/indexn.php?page=judgments.php&menu=00&div_id=2&type_id=5

Usage:
    python fetch_cases.py                              # all SCOB volumes
    python fetch_cases.py --listing ad.html hcd.html   # + every judgment PDF linked in saved list pages
    python fetch_cases.py --pdf <url> [<url> ...]      # + single judgment PDFs by URL

Writes PDFs to raw_cases/scob/ and raw_cases/judgments/ and records each download in
raw_cases/manifest.csv (url, sha256, size, date, source, division). The manifest is the
provenance record for the thesis; the PDFs themselves are copyright of the Supreme Court
of Bangladesh, so share the manifest + scripts, not the PDFs.
Files already downloaded are skipped. Requests are spaced out (1 s) to be polite.
"""
import argparse
import csv
import datetime as dt
import hashlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw_cases"
MANIFEST = RAW / "manifest.csv"
SITE = "https://www.supremecourt.gov.bd"
SCOB_URL = SITE + "/resources/bulletin/{vol}_SCOB_{year}.pdf"
FIELDS = ["file", "url", "sha256", "bytes", "downloaded", "source", "division"]
DELAY = 1.0
UA = "Ainkhoj-thesis-research (Python urllib)"


def load_manifest() -> dict:
    if not MANIFEST.exists():
        return {}
    with MANIFEST.open(encoding="utf-8", newline="") as f:
        return {r["file"]: r for r in csv.DictReader(f)}


def save_manifest(rows: dict):
    RAW.mkdir(parents=True, exist_ok=True)
    with MANIFEST.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for k in sorted(rows):
            w.writerow(rows[k])


def get(url: str, timeout=120) -> bytes | None:
    """Body of url, or None when it does not exist (404)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def exists(url: str) -> bool:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False


def download(url: str, dest: Path, source: str, division: str, rows: dict) -> bool:
    key = str(dest.relative_to(RAW))
    if dest.exists() and key in rows:
        print(f"  have {key}")
        return True
    time.sleep(DELAY)
    data = get(url)
    if data is None:
        print(f"  404  {url}")
        return False
    if not data.startswith(b"%PDF"):
        print(f"  !! not a PDF, skipped: {url}")
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    rows[key] = {
        "file": key,
        "url": url,
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "downloaded": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "division": division,
    }
    save_manifest(rows)  # after every file, so an interrupted run keeps its record
    print(f"  got  {key} ({len(data) / 1e6:.1f} MB)")
    return True


def fetch_scob(rows: dict):
    """Volumes are numbered 1, 2, 3 ... across years; find each volume's year by trying
    the previous volume's year and the next two."""
    print("SCOB volumes:")
    vol, year, misses = 1, 2015, 0
    this_year = dt.date.today().year
    while misses < 2 and year <= this_year + 1:
        found = None
        for y in (year, year + 1, year + 2):
            time.sleep(DELAY / 4)
            if exists(SCOB_URL.format(vol=vol, year=y)):
                found = y
                break
        if found is None:
            misses += 1
            vol += 1
            continue
        misses, year = 0, found
        url = SCOB_URL.format(vol=vol, year=year)
        download(url, RAW / "scob" / f"{vol:02d}_SCOB_{year}.pdf", "SCOB", "AD+HCD", rows)
        vol += 1


def judgment_links(html: str) -> list[tuple[str, str]]:
    """(absolute pdf url, division) for every PDF linked in a saved judgments list page."""
    division = "AD" if re.search(r"div_id=1\b|Appellate Division", html) else "HCD"
    out = []
    for href in re.findall(r"""href\s*=\s*["']([^"']+\.pdf)["']""", html, re.I):
        url = urllib.parse.urljoin(SITE + "/web/", href.replace("\\", "/"))
        if "/resources/documents/" in url:
            out.append((url, division))
    return list(dict.fromkeys(out))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--listing", nargs="*", default=[], help="saved judgments list pages (.html)")
    ap.add_argument("--pdf", nargs="*", default=[], help="judgment PDF urls")
    ap.add_argument("--no-scob", action="store_true", help="skip the SCOB volumes")
    args = ap.parse_args()

    rows = load_manifest()
    if not args.no_scob:
        fetch_scob(rows)

    links: list[tuple[str, str]] = []
    for f in args.listing:
        found = judgment_links(Path(f).read_text(encoding="utf-8", errors="replace"))
        print(f"{f}: {len(found)} judgment PDFs")
        links += found
    links += [(u, "AD" if "/AD" in u.upper() else "") for u in args.pdf]
    if links:
        print("Judgments:")
    for url, division in dict.fromkeys(links):
        name = urllib.parse.unquote(Path(urllib.parse.urlparse(url).path).name)
        download(url, RAW / "judgments" / name, "SC judgment", division, rows)

    print(f"\n{len(rows)} files recorded in {MANIFEST}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nStopped. Run again to continue; finished files are kept.")
