# Day 3: Gemma 4 E4B, after fine-tuning

**Goal:** measure the fine-tuned system with Gemma 4 E4B as the answer model (`model: low`) at all 9 effort × technicality settings, and compare it with Day 1 (B0).

**Variants today** (in order of importance, so the most important result is finished first):

| Order | Variant | Search model | Answer model | Time |
|---|---|---|---|---|
| 1 | E3 | fine-tuned | fine-tuned Gemma | ~5 h |
| 2 | E2 | original | fine-tuned Gemma | ~5 h |
| 3 | E1 | fine-tuned | original Gemma | ~5 h |
| opt. | N1 | none (no RAG) | fine-tuned Gemma | ~2 h |

Run it over several daily sessions (09:15–16:30, nothing overnight). See the session plan in [README.md](README.md#time-plan-one-6-hour-session-per-day-nothing-overnight). Stop with Ctrl+C at 16:15 and rerun the same command next session; finished answers are skipped.

## 0. Before you start
- [ ] Both "before" days are finished and committed.
- [ ] The fine-tuned search model exists: `models/bge-m3-ainkhoj/`, indexed into `retrieval/chroma_db_ft/`.
- [ ] The fine-tuned Gemma exists as GGUF, **Q4_K_M** (same as the baseline), with the same `mmproj` vision file, and is imported into LM Studio as `ainkhoj-gemma-4-e4b` (for example).
- [ ] The code is `baseline-v1` plus only the eval/training scripts. **No changes to prompts, `answer.config.ts`, the router or the retrieval code.** `git diff baseline-v1 -- backend/src retrieval/*.py` must be empty, except for the eval script.
- [ ] Same test set hash and same judge config as Day 1.

## 1. Start the services
```bash
# LM Studio: load
#   - original google/gemma-4-e4b   (router + vision; stays the original in every variant)
#   - ainkhoj-gemma-4-e4b           (fine-tuned answer model, context 49152, Parallel 4)
# Both: Flash Attention ON, GPU offload MAX.

# Two retrieval servers side by side:
cd retrieval && source .venv/bin/activate
python -m uvicorn server:app --port 8000                       # original bge-m3 (for E2)
EMBED_MODEL=../models/bge-m3-ainkhoj CHROMA_DIR=./chroma_db_ft \
  python -m uvicorn server:app --port 8001                     # fine-tuned (for E3, E1)
```
Chroma allows only one process per folder. That's fine here: the two servers use different folders.

> **Router decision:** the router stays the **original** Gemma in every variant, so routing is the same as in the baseline and only the answers change. If the fine-tuned Gemma should also become the router, run that as an extra variant ("E3-router") and say so in the thesis.

## 2. Search model after fine-tuning
```bash
cd eval && source ../retrieval/.venv/bin/activate
python eval_retrieval.py --url http://localhost:8001 --test data/test.jsonl \
  --k 3,5,8,10 --out runs/E1/retrieval.json
# TODO (build before Day 3): a retrieval compare, B0 vs E1 -> runs/E1/retrieval-compare.md
# Until then, compare the two summary tables in runs/B0/retrieval.json and runs/E1/retrieval.json.
```
- [ ] Recall@10 and MRR are higher than B0. If not, stop and check the embedder before spending hours on the answer runs.

## 3. Answer benchmarks (E3: 9 settings; E1/E2: 3 settings)
```bash
cd backend && export PATH="$HOME/.local/node-v22.20.0-linux-arm64/bin:$PATH"
COMMON="--models low --efforts low,mid,high --tech low,auto,high --mode auto --test ../eval/data/test.jsonl --workers 4"
SMALL="--models low --efforts low,mid,high --tech auto --mode auto --test ../eval/data/test.jsonl --workers 4"   # E1/E2: 3 settings

# 1) E3: fine-tuned search + fine-tuned Gemma (main result)
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8001 LMSTUDIO_MODEL_LOW=ainkhoj-gemma-4-e4b \
  npm run eval -- --variant E3 $COMMON --out ../eval/runs/E3/gemma
# 1b) E3 with attached files (file test set, same 9 settings)
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8001 LMSTUDIO_MODEL_LOW=ainkhoj-gemma-4-e4b \
  npm run eval -- --variant E3 ${COMMON/test.jsonl/test_files.jsonl} --out ../eval/runs/E3/gemma-files

# 2) E2: original search + fine-tuned Gemma
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 LMSTUDIO_MODEL_LOW=ainkhoj-gemma-4-e4b \
  npm run eval -- --variant E2 $SMALL --out ../eval/runs/E2/gemma

# 3) E1: fine-tuned search + original Gemma
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8001 LMSTUDIO_MODEL_LOW=google/gemma-4-e4b \
  npm run eval -- --variant E1 $SMALL --out ../eval/runs/E1/gemma
```
- All variants reuse the router decisions from Day 1 (`eval/runs/route-cache.jsonl`); only the search model and answer model change.
- [ ] E3: 3,285 law + 684 file answers; E2 and E1: 1,095 each; 0 errors. `meta.model` in `answers.jsonl` shows the expected model id.

## 4. Score and compare with the baseline
```bash
cd eval && source ../retrieval/.venv/bin/activate
for r in E3/gemma E3/gemma-files E2/gemma E1/gemma; do python score.py judge runs/$r && python score.py report runs/$r; done
for v in E1 E2 E3; do python score.py compare runs/B0/gemma runs/$v/gemma; done
python score.py compare runs/B0/gemma-files runs/E3/gemma-files
```
`compare-gemma.md` is the thesis table for Gemma: each metric for B0/E1/E2/E3 at each of the 9 settings, with 95% CI and significance vs B0 (paired bootstrap, Wilcoxon/McNemar).

## 5. Optional: N1, no RAG with the fine-tuned Gemma
```bash
cd backend
EVAL_TEMPERATURE=0 LMSTUDIO_MODEL_LOW=ainkhoj-gemma-4-e4b npm run eval -- --variant N1 \
  --models low --efforts low,mid,high --tech low,auto,high --mode general \
  --test ../eval/data/test.jsonl --out ../eval/runs/N1/gemma --workers 4
cd ../eval && python score.py judge runs/N1/gemma && python score.py report runs/N1/gemma
python score.py compare runs/N0/gemma runs/N1/gemma
```
This answers "does fine-tuning alone replace RAG?" Compare the hallucination rate with E3.

## 6. Sanity checks
- [ ] General/identity questions in the test set still behave correctly (no "I am Ainkhoj…" where it shouldn't be, no broken refusals).
- [ ] Bangla questions are still answered in Bangla.
- [ ] Error analysis: take 30 failures from E3 and label each one router / retrieval / generation in `runs/E3/gemma/errors-labelled.csv`.
- [ ] Commit `eval/runs/E1 E2 E3 (N1)/gemma` and `compare-gemma.md`.

## Run log
| Date | Git sha | Test set sha256 (first 12) | Variant | Model ids | Answers | Errors | Wall time | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | retrieval (E1) | bge-m3-ainkhoj | – | | | |
| | | | E3 | | /3600 | | | |
| | | | E2 | | /3600 | | | |
| | | | E1 | | /3600 | | | |
| | | | N1 | | /3600 | | | |
