# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ainkhoj: a RAG chatbot for Bangladesh law (mostly Bangla data, English too). Three services run separately and talk over HTTP:

| Dir | Stack | Port | Role |
|---|---|---|---|
| `retrieval/` | Python 3.12, FastAPI, ChromaDB, sentence-transformers | 8000 | Vector search (one Chroma collection per law domain), file text extraction/OCR, passage ranking |
| `backend/` | NestJS 10 | 4000 (prefix `/api`) | Auth, routing, LLM calls, Firestore persistence, usage limits |
| `frontend/` | Next.js 15 / React 19 | 3000 | UI, Google sign-in via Firebase |

LLMs run locally in LM Studio (`http://localhost:1234/v1`); Gemini is optional per provider setting. `prepareDataset/prepare.py` is a standalone script that cleans raw law JSON into `.jsonl` chunks. `planning/` holds thesis documents, not code.

There are no tests, linters or formatters. Type-checking is the only automated check. The README covers Firebase and LM Studio setup (it is written for Windows and predates the features below).

## Commands

The dev machine is Linux aarch64 (NVIDIA DGX Spark). Node is installed at `~/.local/node-v22.20.0-linux-arm64/bin` and may not be on `PATH`; prefix commands with `PATH="$HOME/.local/node-v22.20.0-linux-arm64/bin:$PATH"` if `npm` is missing.

```bash
# retrieval (Python 3.12; 3.13+ breaks pip install). venv already exists with CUDA torch.
cd retrieval && source .venv/bin/activate
pip install -r requirements.txt       # install CUDA torch first (see requirements.txt comment)
python ingest.py                      # embed new/changed backend/data/*.jsonl (unchanged files are skipped)
python ingest.py criminal             # only these domains
python ingest.py --force              # re-embed everything (required after changing EMBED_MODEL)
python ingest.py --prune              # drop collections whose .jsonl file was removed
python calibrate.py                   # measure FALLBACK_MIN_SCORE from calibration/questions.jsonl (server stopped)
python -m uvicorn server:app --port 8000

# backend (needs backend/.env from .env.example, and backend/firebase-service-account.json)
cd backend && npm install && npm run start:dev
npx tsc --noEmit -p .                 # type-check (npm run build = nest build)

# frontend (needs frontend/.env.local from .env.local.example)
cd frontend && npm install && npm run dev
npx tsc --noEmit -p .                 # type-check (npm run build also type-checks)

# dataset prep
python prepareDataset/prepare.py input.json output.jsonl   # then move output into backend/data/

# case law (run inside prepareDataset/ with the retrieval venv)
python fetch_cases.py                       # download every SCOB volume + raw_cases/manifest.csv
python fetch_cases.py --no-scob --listing ad.html hcd.html   # + judgment PDFs from saved list pages
python prepare_cases.py                     # -> backend/data/cases.jsonl (OCR needs the GPU; --no-ocr skips it)
```

Reloading: `nest start --watch` and `next dev` reload on code changes. `uvicorn` runs without `--reload`, so restart it after editing `retrieval/*.py`. Every server reads its env file only at startup, so restart after editing env files. Don't run `npm run build` in `backend/` while `start:dev` is running: both write `dist/`. Use `tsc --noEmit` instead.

## Architecture

### Request flow (`backend/src/chat/`)
The frontend sends questions to `POST /api/chat/stream`, which streams newline-delimited JSON events: `start` (route, sources, meta), `delta` (text), then `done` (saved chat, usage) or `error`. `POST /api/chat` does the same work and returns one JSON response. Both take `{ chatId?, message, mode?, domain?, model?, effort?, technicality?, attachmentId? }`. `ChatController` loads the history and attached file, calls `ChatService.reply()`, and **saves to Firestore only after the model has finished**. A failed or aborted request (the browser disconnected) therefore leaves no half-written chat.

`ChatService.reply()` has three modes. In the UI they are Auto / General / Specific; in the API they are `auto` / `general` / `law`.
- `general`: no routing, no retrieval. `GENERAL_PROVIDER` chooses the provider: `lmstudio` uses the user's chosen model, `gemini` uses `GENERAL_MODEL`.
- `law` + `domain`: searches only that domain, with no router. In the UI the user picks it from the "/" list.
- `auto` (the default): `RouterService` asks an LLM (`ROUTER_PROVIDER`) for JSON `{category, domains}`. The router uses its own model (`ROUTER_LMSTUDIO_MODEL`, else `LMSTUDIO_CHAT_MODEL`), not the user's pick. The result is one of:
  - `general`: answered as above.
  - `law` with domains: at most 2 domains are searched. Then the law LLM (`LLM_PROVIDER`) answers **only from the retrieved excerpts**.
  - `law` with no matching domain: `unsupported`, a fixed refusal with no LLM call. If a file is attached, it is answered as `general` with the file instead.
  - The fallback database (`FALLBACK_DOMAIN`, default `uncategorized`) is hidden from the router. It is also searched when the routed domains have no hit with score >= `FALLBACK_MIN_SCORE`; the hits are merged and the top k kept. An `unsupported` decision searches only the fallback and refuses only if that finds nothing relevant either. Manual `law` mode never uses the fallback.
  - If routing fails or returns bad JSON, every law domain is searched. This fallback never returns `general`. General questions still work when the retrieval service is down.

Short follow-up questions (under 40 chars) are combined with the previous user question to build the search query (`buildQuery`).

**Typos:** in Auto mode the router also returns `question`, the latest message with its spelling and grammar fixed. `applyCorrection()` searches with it and appends it to the user's message for the answer model, keeping the original wording. Every system prompt (`identityLine()`) also tells the model to read past typos and to introduce itself only when asked. `searchText()` drops a clause-final "in Bangladesh" from the search query, because it pulls in unrelated sections that mention Bangladesh.

**LM Studio model ids:** `LlmService.resolveLmStudioModel()` checks the configured ids against `/v1/models`. An id that isn't listed is matched by its name without the publisher prefix (e.g. `qwen/x` vs `x`).

### Answer settings (`answer.config.ts`, mirrored in `frontend/lib/models.ts`)
- **`model`:** `high`/`mid`/`low` map to the LM Studio ids `LMSTUDIO_MODEL_HIGH/MID/LOW` (Qwen3-Next 80B / Qwen3 30B / Gemma 4 E4B). They apply only when the provider is `lmstudio`.
- **`effort`:** the `EFFORT` table sets law top-k, file passages, history length, `max_tokens`, temperature and a depth instruction in the prompt. `chats.service.ts` `HISTORY_FOR_MODEL` must be at least the largest `history` value.
- **`technicality`:** `auto`/`high`/`low` adds style lines to the prompt (`styleLines()`, with separate wording for law and general answers).

Each saved assistant message stores `meta` (the model and settings that produced it).

### LLM calls
`LlmService` is the only code that calls Gemini (REST `generateContent` / `streamGenerateContent?alt=sse`) or LM Studio (OpenAI-compatible `/chat/completions`, `stream: true` with `include_usage`).
- **Streaming:** `complete()` streams when given `onDelta`.
- **`<think>` blocks:** `VisibleText` removes them, including tags split across chunks.
- **Thinking off:** LM Studio calls send `reasoning_effort` from `LMSTUDIO_REASONING` (default `none`). Without it Gemma 4 (router, vision, "low") thinks ~150 hidden tokens before every reply.
- **Token counting:** every call adds its tokens to an optional `Meter`, using the provider-reported count or about chars/3.
- **Images:** `describeImage()` sends an uploaded photo to `VISION_MODEL`.

### Files (computer-vision feature)
`POST /api/files` (multipart, max 20 MB) goes through `FilesService` to retrieval `/extract` (`retrieval/files.py`). Everything runs locally:
- **PDF:** PyMuPDF text layer, plus EasyOCR (`bn,en`, GPU) for pages without text.
- **Photo (any format, including HEIC):** OCR, plus a JPEG copy that the backend sends to `VISION_MODEL`. `FilesService` fetches the JPEG from `/image` (no OCR) first, so the vision model runs while `/extract` does the OCR.
- **Office, HTML, EPUB, `.msg`:** MarkItDown.
- **Anything else:** decoded as text if it is text.
- **Refused with 415:** audio/video (MarkItDown would transcribe them online), old `.doc`/`.ppt`, and binary files.

The extracted text (at most 150k chars) is stored in `users/{uid}/uploads/{id}`.

Sending `attachmentId` with a message makes that file the chat's file (`chats/{chatId}.attachment`), which is also used for follow-ups. For each question, retrieval `/rank` chooses the file's most relevant passages using the same embedding model. They are added to the prompt after the law excerpts (labelled as the user's file, not law), to the law search query and to the router's input.

### Usage limit
`UsageService` keeps a per-user token budget in `users/{uid}/limits/usage`. The one-hour window starts with the first request after the previous window ended. Chat and upload requests are refused with 429 once `TOKEN_LIMIT_PER_HOUR` (default 200000) is used. The tokens a request actually used are added after it finishes, even when it fails. `GET /api/usage` feeds the bar under the chat box.

### Domains are data-driven
A domain is one `backend/data/<name>.jsonl` file. Its id comes from `common.domain_id()`: lowercased, with characters outside `[a-z0-9_-]` changed to `-`, so `Criminal.jsonl` becomes `criminal`. Adding a domain needs **no code changes**:
1. `ingest.py` embeds the file into the Chroma collection `law_<id>` and writes `retrieval/chroma_db/domains.json` (label, description, act list, file hash and embed model per domain).
2. `server.py` checks the mtime of `domains.json` on every request and reloads it, so the server needs no restart.
3. `RetrievalService.domains()` in the backend caches `/domains` for 15s. The router prompt lists every domain with up to 20 act titles, and the frontend's "/" list shows them all.

The optional `backend/data/domains.json` sets labels and descriptions for each domain, which helps the router choose correctly. Don't confuse it with the generated `retrieval/chroma_db/domains.json`.

A `.jsonl` record needs `id` and `text`. `act_title`, `act_year`, `act_no`, `section_no`, `section_title` and `chapter_no` become Chroma metadata, which the API returns as `Source` objects. `excerpt()` in `server.py` expects the chunk text to contain a line starting with `Section`. `prepare.py` must only fix encoding and spacing (mojibake, glued words). It must never change legal wording.

### Case law (`cases` domain)
`backend/data/cases.jsonl` holds Supreme Court of Bangladesh judgments from the official Supreme Court Online Bulletin (SCOB, `supremecourt.gov.bd/resources/bulletin/{vol}_SCOB_{year}.pdf`, vols 1–20, 2015–2025).
- **Building it:** `prepareDataset/fetch_cases.py` downloads the PDFs to `prepareDataset/raw_cases/`. The PDFs are gitignored because they are © Supreme Court of Bangladesh. `manifest.csv`, which records the URL, sha256 and date of every file, is committed as the provenance record.
- **Parsing:** `prepare_cases.py` splits each volume into cases using the running page header (`19 SCOB [2024] AD  <title> (<judge>)  <page>`). The citation is the volume, year, division and first page. Only whitespace is normalised.
- **Old Bangla fonts:** pages typed in non-Unicode fonts (SutonnyMJ, AdarshaLipi) extract as gibberish, so they are OCR'd. With `--no-ocr` they are skipped, and `raw_cases/cases_report.csv` lists `pages_skipped` per case. `case_overrides.csv` holds hand-checked titles for headers in those fonts.
- **Record format:** records have `kind: "case"`, `case_title`, `citation`, `court`, `judge`, `decided`, `case_no`, `source_url` (official PDF `#page=N`) and `text_source`. The text is a heading line, then `---`, then the judgment text. `excerpt()` cuts at `---`.
- **In the backend:** like the fallback domain, `cases` (`CASES_DOMAIN`) is hidden from the router. `ChatService.caseHits()` adds 1–3 decisions to every law answer (`EFFORT[].cases`, only score >= `CASES_MIN_SCORE`, one chunk per case). They are numbered after the law excerpts in a separate "COURT DECISIONS" prompt block. The frontend shows them with a "Case" badge and a link to the official PDF.

### Embeddings
`ingest.py` and `server.py` both load `retrieval/.env` via `common.py` (real env vars win). That file sets `EMBED_MODEL=BAAI/bge-m3`, which is multilingual; the code default `BAAI/bge-small-en-v1.5` is English only.
- **GPU:** `get_model()` uses CUDA with fp16 when available and caps input at `EMBED_MAX_TOKENS` (1024). English bge models automatically add a query-side instruction prefix.
- **Chroma index setting:** `ingest.py` creates collections with `hnsw:sync_threshold`/`hnsw:batch_size` set to 100. Without it, a collection under 1000 chunks never writes its vector index to disk, and `server.py` fails with `Error creating hnsw segment reader: Nothing found on disk`.
- **One process at a time:** stop `server.py` before running `ingest.py`. Chroma doesn't support two processes using the same database folder.
- **Changing the model:** run `ingest.py --force`. `server.py` warns when the stored and current models don't match.

### Auth and persistence
Every backend route uses `FirebaseAuthGuard`, which verifies `Authorization: Bearer <Firebase ID token>`. `@CurrentUser()` provides `uid`. Only the backend (Admin SDK) accesses Firestore; `firestore.rules` blocks all browser access. Firestore layout:
- `users/{uid}/chats/{chatId}`: `{ title, createdAt, updatedAt, attachment? }`
- `users/{uid}/chats/{chatId}/messages/{id}`: `{ role, content, attachment?, sources?, route?, meta?, order }`, ordered by `order`
- `users/{uid}/uploads/{id}`: extracted file text
- `users/{uid}/limits/usage`: `{ windowStart, tokens }`

### Frontend
- **`frontend/lib/api.ts`:** every API call goes through it, including the NDJSON stream reader `streamMessage()`.
- **Types to keep in sync:** `Source`, `RouteInfo`, `Mode`, `AnswerMeta`, `AttachmentRef` and `UsageStatus` in `api.ts` must match `backend/src/chat/chat.types.ts`, `chat.dto.ts` and `usage.service.ts`.
- **`components/Chat.tsx`:** owns the composer. It holds the "/" law-field list, the attachment state, the mode (`ModePicker`), the model/effort/technicality menu (`ModelPicker`), the `+` menu (`AttachMenu`) and the usage bar (`UsageMeter`).
- **Streamed answers:** `TypedAnswer` reveals them smoothly. Message flags `streaming`/`typing` exist only on the client and are never saved.
- **Saved preferences:** the mode and answer settings are kept in `localStorage`.

### Bot name
The name `Ainkhoj` is set in two places: `backend/src/bot.config.ts` (`BOT_NAME` and `identityLine()`, which is added to every system prompt) and `frontend/lib/brand.ts`. To rename the bot, change both.
