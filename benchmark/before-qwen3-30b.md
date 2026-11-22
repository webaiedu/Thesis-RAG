# Day 2: Qwen3 30B, before fine-tuning (baseline)

**Goal:** measure the current system with Qwen3 30B-A3B as the answer model (`model: mid`) at all 9 effort × technicality settings.

**Variants today:** B0 (required), N0 (optional, if time is left)
**Time:** several daily sessions, see the session plan in [README.md](README.md#time-plan-one-6-hour-session-per-day-nothing-overnight). Stop with Ctrl+C at 16:15; rerun the same command next session.

The search-model baseline was measured on Day 1 and is not repeated.

## 0. Before you start
- [ ] Day 1 ([before-gemma.md](before-gemma.md)) is finished.
- [ ] `git checkout baseline-v1`, working tree clean. Same test set hash as Day 1.
- [ ] No fine-tuning has been done or loaded yet.

## 1. Start the services
```bash
# LM Studio: load Qwen3 30B (Q4_K_M, context 49152, Parallel 4, Flash Attention ON, GPU offload MAX)
#            AND Gemma 4 E4B (it is the router; same settings as Day 1)
~/.lmstudio/bin/lms ps     # must show qwen/qwen3-30b-a3b-2507 and google/gemma-4-e4b only

cd retrieval && source .venv/bin/activate
python -m uvicorn server:app --port 8000   # original bge-m3 index
```

## 2. Answer benchmark B0: 9 settings × ~400 questions
```bash
cd backend && export PATH="$HOME/.local/node-v22.20.0-linux-arm64/bin:$PATH"
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 npm run eval -- \
  --variant B0 --models mid --efforts low,mid,high --tech low,auto,high \
  --mode auto --test ../eval/data/test.jsonl \
  --out ../eval/runs/B0/qwen3-30b --workers 4
```
- The runner reuses Day 1's router decisions (`eval/runs/route-cache.jsonl`), so routing is identical for both models and only the answer model differs. Search runs live (fast, deterministic).
- If it stops, run the same command again.
- [ ] 3,285 lines in `eval/runs/B0/qwen3-30b/answers.jsonl`, 0 errors.

**With attached files** (file test set, same settings; extraction is cached in `eval/runs/file-cache.jsonl`, made once):
```bash
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 npm run eval -- \
  --variant B0 --models mid --efforts low,mid,high --tech low,auto,high \
  --mode auto --test ../eval/data/test_files.jsonl \
  --out ../eval/runs/B0/qwen3-30b-files --workers 4
```
- [ ] 684 lines in `eval/runs/B0/qwen3-30b-files/answers.jsonl`, 0 errors.

## 3. Score
```bash
cd eval && source ../retrieval/.venv/bin/activate
# load the 80B judge first (unload the answer model): context 32768, Parallel 4
for r in B0/qwen3-30b B0/qwen3-30b-files; do python score.py judge runs/$r && python score.py report runs/$r; done
python score.py compare runs/B0/gemma runs/B0/qwen3-30b
```
The second command makes the "Gemma vs Qwen3 30B before fine-tuning" table, with significance tests.

## 4. Optional: N0, no RAG
```bash
cd backend
EVAL_TEMPERATURE=0 npm run eval -- --variant N0 --models mid --efforts low,mid,high \
  --tech low,auto,high --mode general --test ../eval/data/test.jsonl \
  --out ../eval/runs/N0/qwen3-30b --workers 4
cd ../eval && python score.py judge runs/N0/qwen3-30b && python score.py report runs/N0/qwen3-30b
```

## 5. Sanity checks
- [ ] Spot-check 5 answers per effort/technicality level, as on Day 1.
- [ ] Qwen3 answers contain no `<think>` text.
- [ ] Commit `eval/runs/B0/qwen3-30b` (and N0 if run).
- [ ] **The baseline is now frozen.** Fine-tuning can start.

## Run log
| Date | Git sha | Test set sha256 (first 12) | Variant | Answers | Errors | Wall time | Notes |
|---|---|---|---|---|---|---|---|
| | | | B0 | /3600 | | | |
| | | | N0 | /3600 | | | |
