# Day 4: Qwen3 30B, after fine-tuning

**Goal:** measure the fine-tuned system with Qwen3 30B-A3B as the answer model (`model: mid`) at all 9 effort × technicality settings, and compare it with Day 2 (B0).

**Variants today** (most important first):

| Order | Variant | Search model | Answer model | Time |
|---|---|---|---|---|
| 1 | E3 | fine-tuned | fine-tuned Qwen3 30B | ~4 h |
| 2 | E2 | original | fine-tuned Qwen3 30B | ~4 h |
| 3 | E1 | fine-tuned | original Qwen3 30B | ~4 h |
| opt. | N1 | none (no RAG) | fine-tuned Qwen3 30B | ~1.5 h |

Start in the morning and let the rest run overnight. The runner resumes if stopped.

## 0. Before you start
- [ ] Day 3 ([after-gemma.md](after-gemma.md)) is finished. The fine-tuned search model is already checked.
- [ ] The fine-tuned Qwen3 30B exists as GGUF, **Q4_K_M** (same as the baseline), and is imported into LM Studio as `ainkhoj-qwen3-30b` (for example).
- [ ] Code unchanged since `baseline-v1` (except the eval scripts), same test set hash and same judge config.

## 1. Start the services
```bash
# LM Studio: load
#   - original google/gemma-4-e4b   (router + vision, context 32768)
#   - ainkhoj-qwen3-30b             (fine-tuned, context 49152, Parallel 4)
#   - qwen/qwen3-30b-a3b-2507       (original, only for E1; load it after E3/E2 are done
#                                    and unload the fine-tuned one, to save memory)
# All: Flash Attention ON, GPU offload MAX.

cd retrieval && source .venv/bin/activate
python -m uvicorn server:app --port 8000                       # original bge-m3 (E2)
EMBED_MODEL=../models/bge-m3-ainkhoj CHROMA_DIR=./chroma_db_ft \
  python -m uvicorn server:app --port 8001                     # fine-tuned (E3, E1)
```
The router stays the original Gemma, as on Day 3.

## 2. Answer benchmarks: 9 settings × ~400 questions each
```bash
cd backend && export PATH="$HOME/.local/node-v22.20.0-linux-arm64/bin:$PATH"
COMMON="--models mid --efforts low,mid,high --tech low,auto,high --mode auto --test ../eval/data/test.jsonl --workers 4"

# 1) E3: fine-tuned search + fine-tuned Qwen3 30B (main result)
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8001 LMSTUDIO_MODEL_MID=ainkhoj-qwen3-30b \
  npm run eval -- --variant E3 $COMMON --out ../eval/runs/E3/qwen3-30b

# 2) E2: original search + fine-tuned Qwen3 30B
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 LMSTUDIO_MODEL_MID=ainkhoj-qwen3-30b \
  npm run eval -- --variant E2 $COMMON --out ../eval/runs/E2/qwen3-30b

# 3) E1: fine-tuned search + original Qwen3 30B (swap the loaded model first, see above)
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8001 LMSTUDIO_MODEL_MID=qwen/qwen3-30b-a3b-2507 \
  npm run eval -- --variant E1 $COMMON --out ../eval/runs/E1/qwen3-30b
```
The router decisions from Day 1 (`eval/runs/route-cache.jsonl`) are reused, so routing is identical across all variants.
- [ ] Each run: 3,600 answers, 0 errors, correct `meta.model`.

## 3. Score and compare
```bash
cd eval && source ../retrieval/.venv/bin/activate
for v in E3 E2 E1; do python score.py --run runs/$v/qwen3-30b --test data/test.jsonl --judge config.json; done
python score.py --compare runs/B0/qwen3-30b runs/E1/qwen3-30b runs/E2/qwen3-30b runs/E3/qwen3-30b \
  --out runs/compare-qwen3-30b.md

# Final thesis tables: both models, before vs after
python score.py --final runs --out runs/FINAL.md
```
`FINAL.md` puts everything side by side: the search-model gain, then B0/E1/E2/E3 for Gemma and Qwen3 30B at all 9 settings, the no-RAG results, and how big the fine-tuning gain is for the small vs the mid model.

## 4. Optional: N1, no RAG with the fine-tuned Qwen3 30B
```bash
cd backend
EVAL_TEMPERATURE=0 LMSTUDIO_MODEL_MID=ainkhoj-qwen3-30b npm run eval -- --variant N1 \
  --models mid --efforts low,mid,high --tech low,auto,high --mode general \
  --test ../eval/data/test.jsonl --out ../eval/runs/N1/qwen3-30b --workers 4
cd ../eval && python score.py --run runs/N1/qwen3-30b --test data/test.jsonl --judge config.json
python score.py --compare runs/N0/qwen3-30b runs/N1/qwen3-30b --out runs/compare-qwen3-30b-norag.md
```

## 5. Sanity checks and wrap-up
- [ ] No `<think>` text in answers. Bangla in, Bangla out. General/identity questions still behave.
- [ ] Error analysis: label 30 failures from E3 as router / retrieval / generation (`runs/E3/qwen3-30b/errors-labelled.csv`).
- [ ] Judge check: the team hand-rates ~80 answers mixed from B0 and E3 (without knowing which is which) and reports agreement with the judge in `FINAL.md`.
- [ ] Commit `eval/runs/*/qwen3-30b`, `compare-qwen3-30b.md` and `FINAL.md`.

## Run log
| Date | Git sha | Test set sha256 (first 12) | Variant | Model ids | Answers | Errors | Wall time | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | E3 | | /3600 | | | |
| | | | E2 | | /3600 | | | |
| | | | E1 | | /3600 | | | |
| | | | N1 | | /3600 | | | |
