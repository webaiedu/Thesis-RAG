# Qwen3-Next 80B as an answer model, before fine-tuning (baseline)

**Why:** the supervisor asked for a third model (23 Nov). We compare Gemma 4 E4B (`low`), Qwen3 30B (`mid`) and Qwen3-Next 80B (`high`), and fine-tune only the best one (decided after the gold-standard check, `eval/GOLD_GUIDE.md`).
**Where:** PC A (it has the 80B). **Variant:** B0, all 9 effort × technicality settings, same test sets as the other two models.
**Judge:** the same 80B (`eval/config.json`, prompt `j1`, unchanged). It is judging its own answers, so the gold standard (`eval/gold.py`) measures whether it favours itself.

## 0. Before you start
- [ ] Branch `benchmark-setup`, `git pull`, working tree clean. Code, prompts and test sets are identical to `baseline-v1` (only docs differ).
- [ ] No other run on this PC (the judge and the answer runs never run at the same time; otherwise the speed numbers are wrong).

## 1. Start the services
```bash
# LM Studio: load ONLY the 80B (Q4_K_M, context 49152, Parallel 4, Flash Attention ON, GPU offload MAX)
~/.lmstudio/bin/lms ps     # must show qwen3-next-80b-a3b-instruct only
cd retrieval && source .venv/bin/activate
python -m uvicorn server:app --port 8000   # original bge-m3 index
```
**Gemma is not needed.** Router decisions (`eval/runs/route-cache.jsonl`, 441 questions) and file text (`eval/runs/file-cache.jsonl`, 40 files) are cached, so the runner makes no router or vision call. If it reports a cache miss, stop.

## 2. Pilot (20 law + 10 file questions × 9 settings, ~30 min): measures the speed
```bash
cd backend && export PATH="$HOME/.local/node-v22.20.0-linux-arm64/bin:$PATH"
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 npm run eval -- \
  --variant PILOT --models high --efforts low,mid,high --tech low,auto,high \
  --mode auto --test ../eval/data/pilot.jsonl --out ../eval/runs/pilot/qwen3-next-80b --workers 4
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 npm run eval -- \
  --variant PILOT --models high --efforts low,mid,high --tech low,auto,high \
  --mode auto --test ../eval/data/pilot_files.jsonl --out ../eval/runs/pilot/qwen3-next-80b-files --workers 4
```
- [ ] 180 + 90 lines, 0 errors. Write the speed into `benchmark/README.md` ("Measured speeds").

## 3. Answer benchmark B0 (3,285 law + 684 file answers)
```bash
EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 npm run eval -- \
  --variant B0 --models high --efforts low,mid,high --tech low,auto,high \
  --mode auto --test ../eval/data/test.jsonl \
  --out ../eval/runs/B0/qwen3-next-80b --workers 4

EVAL_TEMPERATURE=0 RETRIEVAL_URL=http://localhost:8000 npm run eval -- \
  --variant B0 --models high --efforts low,mid,high --tech low,auto,high \
  --mode auto --test ../eval/data/test_files.jsonl \
  --out ../eval/runs/B0/qwen3-next-80b-files --workers 4
```
- Resumable: stop with Ctrl+C at 16:15 (or wrap in `timeout --signal=INT`), rerun the same command next session.
- [ ] 3,285 lines in `eval/runs/B0/qwen3-next-80b/answers.jsonl`, 684 in `…-files`, 0 errors.
- [ ] `git status` shows `route-cache.jsonl` and `file-cache.jsonl` unchanged.

## 4. Score (same 80B, now as judge; context ≥ 32768, Parallel 4)
```bash
cd eval
python3 score.py judge runs/B0/qwen3-next-80b && python3 score.py report runs/B0/qwen3-next-80b
python3 score.py judge runs/B0/qwen3-next-80b-files --test data/test_files.jsonl
python3 score.py report runs/B0/qwen3-next-80b-files --test data/test_files.jsonl
python3 score.py compare runs/B0/gemma runs/B0/qwen3-next-80b
python3 score.py compare runs/B0/qwen3-30b runs/B0/qwen3-next-80b
```
Judging ~4,000 answers at ~15–20/min takes **~3.5–4.5 h**.

## 5. Sanity checks
- [ ] Spot-check 5 answers per effort/technicality level.
- [ ] No `<think>` text in the answers.
- [ ] Commit `eval/runs/pilot/qwen3-next-80b*` and `eval/runs/B0/qwen3-next-80b*`.

## Run log
| Date | Git sha | Test set sha256 (first 12) | Variant | Answers | Errors | Wall time | Notes |
|---|---|---|---|---|---|---|---|
| | | | PILOT | /270 | | | |
| | | | B0 | /3969 | | | |
