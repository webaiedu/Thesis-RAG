# Where to start next (handoff, 18 Nov 2026)

## Status of the 9 requested items

| # | Task | Status |
|---|------|--------|
| 1 | Faster typing animation | **Done** (`frontend/components/TypedAnswer.tsx`: 3+ chars/frame, catches up in ~7 frames) |
| 2 | Qwen3-Next 80B alongside the other two models | **Done and tested**. All 3 models answer through the backend (`model: high/mid/low`). `.env` id: `LMSTUDIO_MODEL_HIGH=qwen3-next-80b-a3b-instruct` |
| 3 | Typos + files answered with "I am Ainkhoj..." + slow file reading | **Done, file part not yet re-tested** (see "Start here") |
| 4 | Hide "Used as context in this chat" | **Done** (file is still kept per chat, just not shown) |
| 5 | OCR the 370 old-font Bangla pages | **Done**: 0 pages skipped now; 453 cases / 14,855 chunks; ingested into Chroma (`cases` domain) |
| 6 | Individual Supreme Court judgments | **Code done** (`fetch_cases.py --listing`); needs list pages saved from a browser (you) |
| 7 | HawkScan API key | **Pending: you** (install was blocked for the agent; steps below) |
| 8 | GPU / context length | **Checked**: all 3 models are 100% on GPU; contexts already reduced; recommendations below |
| 9 | Run + test everything | **Half done** (see "Start here") |

### What was changed for item 3
- Router (Auto mode) returns the question with spelling/grammar fixed; search uses it and the answer model sees both versions (`chat.service.ts applyCorrection`, `router.service.ts`).
- Every system prompt says: introduce yourself only when asked; read past typos (`bot.config.ts`).
- File prompts say "this / the image / the file" = the attached file.
- Photos: vision model and OCR now run **in parallel** (`files.service.ts`, retrieval `/image`).
- **New today:** Gemma 4 E4B (router + vision + "low" model) was "thinking" ~150 hidden tokens before every reply (6 s first token). `LlmService` now sends `reasoning_effort: "none"` to LM Studio (`LMSTUDIO_REASONING` in `backend/.env`, default `none`). Gemma first token: 6.3 s -> 1.2 s. Qwen models are unaffected.

## Start here tomorrow

1. Start everything (each in its own terminal):
   ```bash
   # LM Studio: load the 3 models (check with: ~/.lmstudio/bin/lms ps)
   cd retrieval && source .venv/bin/activate && python -m uvicorn server:app --port 8000
   cd backend  && npm run start:dev
   cd frontend && npm run dev          # http://localhost:3000
   ```
   (Node: `export PATH="$HOME/.local/node-v22.20.0-linux-arm64/bin:$PATH"`)
2. Finish the tests that were interrupted (item 9). Already passed: General mode on all 3 models, Auto routing to general, identity question, auth + usage endpoint, type-checks (backend, frontend, Python). Still to test in the browser:
   - [ ] Law question with typos, Auto mode: `wat is the punisment for theft in bangladesh?` -> criminal domain, Penal Code sections cited
   - [ ] Bangla question: `চুরি করলে কী শাস্তি হয়?`
   - [ ] Specific mode ("/" list), e.g. children_women: `minimum age of marriage for girls`
   - [ ] Case law appears ("Case" badge + Official PDF link), e.g. `can parliament give indemnity to joint forces for killings during operation clean heart?` (should find Z. I. Khan Panna vs Bangladesh, 7 SCOB [2016] HCD 7, a case that used to be skipped and is now OCR'd)
   - [ ] **Upload an image** with a legal text and ask with typos: `withe the image can you tell me about this low?` -> must answer about the file, not "I am Ainkhoj". Note the upload time.
   - [ ] Upload a PDF (text + scanned) and a .docx; ask a follow-up without re-attaching (file must still be used, chip must not show)
   - [ ] Effort low/mid/high and technicality settings change answer length/style
   - [ ] Usage bar updates; 429 after the limit (optional: set `TOKEN_LIMIT_PER_HOUR=3000` temporarily)
   - [ ] Stop the retrieval server -> general questions still work, law questions show an error
3. If file upload is still slow: check `retrieval` log timings. OCR (EasyOCR, GPU) is the slow part for big PDFs; the vision model is now ~1 s faster per image after disabling thinking.
4. Clean-up: the agent created a Firebase test user `ainkhoj-e2e-test` (Firebase console -> Authentication, and Firestore `users/ainkhoj-e2e-test`). Delete both.

## Things only you can do

### HawkScan (item 7)
The agent was not allowed to download the binary, so do it yourself:
```bash
mkdir -p ~/.local/bin && cd ~/.local/bin
url=$(curl -fsSL https://download.stackhawk.com/hawkdocs/hawk.manifest.json | python3 -c "import json,sys;m=json.load(sys.stdin);print([a['url'] for a in m['latest']['assets'] if a['asset']['group']=='linux-aarch64' and a['url'].endswith('/hawk')][0])")
curl -fsSL "$url" -o hawk && chmod +x hawk && hawk version   # needs v6.0.0+
hawk init --browser    # log in to app.stackhawk.com (free account); saves the key in ~/.hawk/
```
No browser? Create a key at https://app.stackhawk.com -> Settings -> API Keys, then `hawk init` and paste it (or `export HAWK_API_KEY=hawk.xxx.xxx`). Never commit the key.
Then ask Claude: "run a HawkScan of the backend" (it will create `stackhawk.yml` for http://localhost:4000/api; the scan needs a Firebase token for auth).

### Individual Supreme Court judgments (item 6)
1. In a browser open and save (Ctrl+S, "Webpage, HTML only") into `prepareDataset/`:
   - Appellate Division: https://www.supremecourt.gov.bd/web/indexn.php?page=judgments.php&menu=00&div_id=1&type_id=5 -> `ad.html`
   - High Court Division: https://www.supremecourt.gov.bd/web/indexn.php?page=judgments.php&menu=00&div_id=2&type_id=5 -> `hcd.html`
   (If the list is paginated, save each page: `ad1.html ad2.html ...`.)
2. Then (retrieval server **stopped**):
   ```bash
   cd prepareDataset && source ../retrieval/.venv/bin/activate
   python fetch_cases.py --no-scob --listing ad*.html hcd*.html   # downloads PDFs + manifest
   python prepare_cases.py                                        # SCOB + judgments, with OCR (~30-40 min)
   cd ../retrieval && python ingest.py cases
   ```

### LM Studio / GPU (item 8)
- Verified: 3 `llama-server` processes on CUDA 13, memory equals model size (80B 47.7 GB, 30B 21.6 GB, Gemma 4.9 GB), 60/88/59 tok/s. Nothing runs on CPU.
- DGX Spark has **one shared 128 GB memory** for CPU and GPU (`nvidia-smi` shows "Memory-Usage: Not Supported"; that is normal). The problem with max contexts was memory, not the GPU: at 262k context the 30B model's KV cache alone is ~25 GB, which together with 75 GB of weights, OCR (~9 GB), the embedding model and the browser leaves no room (swap / crashes).
- Current contexts are fine: 80B 40k, 30B 40k, Gemma 30k (our prompts are under ~12k tokens). **Keep them** or use 32k / 32k / 16k. Note: LM Studio's saved default for Qwen3-30B is still 262144: in LM Studio -> My Models -> qwen3-30b -> settings, set Context Length to 32768 so a reload does not go back to max.
- Also in each model's load settings: Flash Attention ON, GPU offload MAX. Optional: KV cache quantization Q8_0 to halve KV memory.
- If memory looks full after loading/unloading many times: `sudo sh -c 'sync; echo 3 > /proc/sys/vm/drop_caches'` frees the file cache.
