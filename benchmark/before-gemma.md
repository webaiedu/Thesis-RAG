# Day 1: Gemma 4 E4B, before fine-tuning (baseline)

**Goal:** measure the current system with Gemma 4 E4B as the answer model (`model: low`) at all 9 effort × technicality settings. Measure the search model (bge-m3) on its own too.

**Variants today:** B0 (required), N0 (optional, if time is left)
**Time:** several daily sessions, see the session plan in [README.md](README.md#time-plan-one-6-hour-session-per-day-nothing-overnight). Stop with Ctrl+C at 16:15; rerun the same command next session.

## 0. Before you start
- [ ] All prerequisites in [README.md](README.md) are done.
- [ ] `git checkout baseline-v1`, working tree clean (`git status`).
- [ ] Test set hash, written in the run log below: `sha256sum eval/data/test.jsonl`.

## 1. Start the services
```bash
# LM Studio: load ONLY Gemma 4 E4B (Q4_K_M, context 49152, Parallel 4, Flash Attention ON, GPU offload MAX)
~/.lmstudio/bin/lms ps                     # must show only google/gemma-4-e4b

cd retrieval && source .venv/bin/activate
python -m uvicorn server:app --port 8000   # original bge-m3 index (chroma_db/)
```
The backend and frontend servers are **not** needed: the runner uses the backend code directly.

## 2. Search-model baseline (runs once for the whole project)
```bash
cd eval && source ../retrieval/.venv/bin/activate
python eval_retrieval.py --url http://localhost:8000 --test data/test.jsonl \
  --k 3,5,8,10 --out runs/B0/retrieval.json
```
- [ ] Recall@1/5/10, MRR@10 and nDCG@10, for "oracle domain" and "all domains", are saved.

**File extraction baseline (once, ~1 min):**
```bash
python eval_extraction.py --url http://localhost:8000 --out runs/B0/extraction.json
```
- [ ] CER/WER per format (text / scan / photo) and language are saved. Rerun after fine-tuning only if the OCR or extraction code changed.

## 3. Answer benchmark B0: 9 settings × ~400 questions
```bash
cd backend && export PATH="$HOME/.local/node-v22.20.0-linux-arm64/bin:$PATH"
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 npm run eval -- \
  --variant B0 --models low --efforts low,mid,high --tech low,auto,high \
  --mode auto --test ../eval/data/test.jsonl \
  --out ../eval/runs/B0/gemma --workers 4
```
- First the router runs once per question (~400 calls), cached in `eval/runs/route-cache.jsonl`. Every later run reuses it, so all days get the same routing.
- If it stops (crash, reboot), run the **same command** again. Finished answers are skipped.
- [ ] 3,285 lines in `eval/runs/B0/gemma/answers.jsonl` (`wc -l`), 0 errors in `errors.jsonl`.

**With attached files** (file test set, same settings; extraction is cached in `eval/runs/file-cache.jsonl`, made once):
```bash
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 npm run eval -- \
  --variant B0 --models low --efforts low,mid,high --tech low,auto,high \
  --mode auto --test ../eval/data/test_files.jsonl \
  --out ../eval/runs/B0/gemma-files --workers 4
```
- [ ] 684 lines in `eval/runs/B0/gemma-files/answers.jsonl`, 0 errors.

## 4. Score
```bash
cd eval && source ../retrieval/.venv/bin/activate
# load the 80B judge first (unload the answer model): context 32768, Parallel 4
for r in B0/gemma B0/gemma-files; do python score.py judge runs/$r && python score.py report runs/$r; done
```
This writes `runs/B0/gemma/scores.csv` (one row per answer) and `runs/B0/gemma/summary.md`. The summary is one table per setting with:
- router accuracy, refusal accuracy;
- citation precision/recall;
- judge correctness/faithfulness/completeness (1–5), hallucination rate;
- technicality-match score (1–5), answer length, readability;
- language match, latency (first token / total), tokens.

## 5. Optional: N0, no RAG (if time is left)
```bash
cd backend
EVAL_TEMPERATURE=0 npm run eval -- --variant N0 --models low --efforts low,mid,high \
  --tech low,auto,high --mode general --test ../eval/data/test.jsonl \
  --out ../eval/runs/N0/gemma --workers 4
cd ../eval && python score.py judge runs/N0/gemma && python score.py report runs/N0/gemma
```
If you skip it today, run it on any free day **before fine-tuning**.

## 6. Sanity checks before you call the day done
- [ ] Open 5 random answers per effort level in `answers.jsonl`. Effort "low" should be short and "high" long; technicality "low" should use plain words and "high" legal terms.
- [ ] Router accuracy is in the same range as the 70-question pilot.
- [ ] Copy `eval/runs/B0/gemma/summary.md` into the thesis notes.
- [ ] `git add eval/runs/B0` (the run files are the evidence). Commit.

## Run log
| Date | Git sha | Test set sha256 (first 12) | Variant | Answers | Errors | Wall time | Notes |
|---|---|---|---|---|---|---|---|
| | | | retrieval | – | | | |
| | | | B0 | /3600 | | | |
| | | | N0 | /3600 | | | |
