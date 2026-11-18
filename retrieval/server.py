"""
Search service used by the NestJS backend.

    python -m uvicorn server:app --port 8000

Serves one vector database per domain (one per .jsonl file). After running
ingest.py the server notices the change by itself; no restart needed.
"""
import json
import threading
from contextlib import asynccontextmanager
from typing import List, Optional

import chromadb
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import common
import files

state = {"client": None, "mtime": None, "domains": {}, "cols": {}}
lock = threading.Lock()


def refresh(force: bool = False):
    """(Re)load domains.json and reopen the database when ingest.py changed it."""
    f = common.DOMAINS_FILE
    mtime = f.stat().st_mtime if f.exists() else None
    with lock:
        if not force and mtime == state["mtime"] and state["client"] is not None:
            return
        try:  # make sure we see data written by another process
            from chromadb.api.client import SharedSystemClient

            SharedSystemClient.clear_system_cache()
        except Exception:
            pass
        state["client"] = chromadb.PersistentClient(path=common.DB_DIR)
        state["cols"] = {}
        state["domains"] = json.loads(f.read_text(encoding="utf-8")) if mtime else {}
        state["mtime"] = mtime
        for d, meta in state["domains"].items():
            if meta.get("model") != common.MODEL_NAME:
                print(f"!! '{d}' was embedded with '{meta.get('model')}' but EMBED_MODEL is "
                      f"'{common.MODEL_NAME}'. Run: python ingest.py --force")
        print(f"Domains loaded: {list(state['domains']) or 'none (run ingest.py)'}")


def collection(domain: str):
    if domain not in state["cols"]:
        state["cols"][domain] = state["client"].get_collection(common.collection_name(domain))
    return state["cols"][domain]


@asynccontextmanager
async def lifespan(app: FastAPI):
    refresh(force=True)
    common.get_model()  # load now so the first request is fast
    yield


app = FastAPI(lifespan=lifespan)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    k: int = Field(default=5, ge=1, le=20)
    domains: Optional[List[str]] = None  # None = search every domain


def excerpt(text: str, limit: int = 450) -> str:
    """The chunk without its heading lines: after "Section ..." (Acts) or "---" (cases)."""
    lines = text.split("\n")
    idx = next((i for i, l in enumerate(lines) if l.startswith("Section") or l == "---"), -1)
    body = " ".join(lines[idx + 1 :])
    return body if len(body) <= limit else body[:limit] + "…"


def source(id_: str, domain: str, meta: dict, score: float, doc: str) -> dict:
    """One search hit. Act sections and court decisions share the same shape; the case
    fields are filled for kind == "case" only."""
    meta = meta or {}
    case = meta.get("kind") == "case"
    return {
        "id": id_,
        "domain": domain,
        "kind": "case" if case else "act",
        "act": meta.get("act", ""),
        "year": meta.get("year", ""),
        "actNo": meta.get("act_no", ""),
        "section": meta.get("section", ""),
        "title": meta.get("title", ""),
        "chapter": meta.get("chapter", ""),
        **(
            {
                "caseTitle": meta.get("case_title", ""),
                "citation": meta.get("citation", ""),
                "court": meta.get("court", ""),
                "judge": meta.get("judge", ""),
                "decided": meta.get("decided", ""),
                "url": meta.get("source_url", ""),
            }
            if case
            else {}
        ),
        "score": score,
        "excerpt": excerpt(doc),
        "text": doc,  # full chunk, used by the backend to build the prompt
    }


@app.get("/health")
def health():
    refresh()
    return {"ok": bool(state["domains"]), "domains": list(state["domains"]),
            "model": common.MODEL_NAME}


@app.get("/domains")
def domains():
    refresh()
    return {"domains": list(state["domains"].values())}


@app.post("/search")
def search(req: SearchRequest):
    refresh()
    available = state["domains"]
    if not available:
        raise HTTPException(503, "No vector databases yet. Run: python ingest.py")
    wanted = req.domains if req.domains else list(available)
    unknown = [d for d in wanted if d not in available]
    if unknown:
        raise HTTPException(400, f"Unknown domain(s): {unknown}. Available: {list(available)}")

    qv = common.embed([req.query], common.QUERY_PREFIX)
    results = []
    for d in wanted:
        col = collection(d)
        if col.count() == 0:
            continue
        res = col.query(
            query_embeddings=qv,
            n_results=min(req.k, col.count()),
            include=["documents", "metadatas", "distances"],
        )
        for id_, doc, meta, dist in zip(
            res["ids"][0], res["documents"][0], res["metadatas"][0], res["distances"][0]
        ):
            # cosine distance -> similarity
            results.append(source(id_, d, meta, round(1 - dist, 3), doc))
    results.sort(key=lambda r: r["score"], reverse=True)
    return {"results": results[: req.k]}


# ---------------- uploaded files (PDF / image) ----------------

MAX_UPLOAD = 20 * 1024 * 1024


@app.post("/extract")
def extract(file: UploadFile = File(...)):
    """Text of any supported file, Bangla + English: PDF (text layer, OCR for scanned pages),
    photo (OCR, plus a JPEG copy for the vision model), Office/HTML/e-book, or text/code."""
    data = file.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File is larger than 20 MB.")
    try:
        return files.extract(data, file.content_type or "", file.filename or "")
    except files.Unsupported as e:
        raise HTTPException(415, str(e))
    except Exception as e:  # corrupt / encrypted files
        raise HTTPException(422, f"Could not read this file: {e}")


@app.post("/image")
def image(file: UploadFile = File(...)):
    """A photo as a small JPEG (base64) for the vision model. Fast: no OCR."""
    data = file.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File is larger than 20 MB.")
    try:
        return {"image": files.image_jpeg(data)}
    except files.Unsupported as e:
        raise HTTPException(415, str(e))


class RankRequest(BaseModel):
    text: str = Field(min_length=1, max_length=400_000)
    query: str = Field(min_length=1, max_length=8000)
    k: int = Field(default=5, ge=1, le=30)


@app.post("/rank")
def rank(req: RankRequest):
    """The passages of an uploaded document that best match the question."""
    return {"passages": files.rank(req.text, req.query, req.k)}
