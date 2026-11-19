# Benchmark plans

One file = one day of benchmarking. Run them in this order:

| Day | File | What it measures | Approx. run time |
|---|---|---|---|
| 1 | [before-gemma.md](before-gemma.md) | Gemma 4 E4B, **before** fine-tuning (baseline) | ~5–7 h |
| 2 | [before-qwen3-30b.md](before-qwen3-30b.md) | Qwen3 30B, **before** fine-tuning (baseline) | ~4–6 h |
| (fine-tuning happens here, see `planning/` and the fine-tuning plan) | | | |
| 3 | [after-gemma.md](after-gemma.md) | Gemma 4 E4B, **after** fine-tuning | ~10–15 h (overnight) |
| 4 | [after-qwen3-30b.md](after-qwen3-30b.md) | Qwen3 30B, **after** fine-tuning | ~8–12 h (overnight) |

Both "before" days must be finished **before any fine-tuning starts**. Otherwise the baseline is not trustworthy.

## Prerequisites (once, before Day 1)
- [ ] The hand-checked test set exists: `eval/data/test.jsonl` (~400 questions with gold sections and reference answers).
- [ ] The benchmark scripts exist and work on a 20-question pilot:
  - `backend/src/eval/run-eval.ts` (`npm run eval`): calls `ChatService.reply()` directly, without login.
  - `eval/eval_retrieval.py`: search metrics.
  - `eval/score.py`: metrics, LLM judge and the results tables.
- [ ] `git tag baseline-v1` on the commit used for all "before" runs.
- [ ] The judge is fixed in `eval/config.json` (model + prompt). **Never change it between "before" and "after"**, or the numbers can't be compared.

## The settings grid (every day)
Each day covers one answer model with **all 9 answer settings**:

| | technicality low | technicality auto | technicality high |
|---|---|---|---|
| **effort low** | ✓ | ✓ | ✓ |
| **effort mid** | ✓ | ✓ | ✓ |
| **effort high** | ✓ | ✓ | ✓ |

9 settings × ~400 questions = **3,600 answers per variant**. Across the 4 days this covers all models × efforts × technicalities, before and after.

## Variants

| Code | Search model | Answer LLM | Run on |
|---|---|---|---|
| B0 | bge-m3 (original) | original | before-* |
| N0 | none (General mode, no RAG) | original | before-* (optional block) |
| E1 | bge-m3 fine-tuned | original | after-* |
| E2 | bge-m3 (original) | fine-tuned | after-* |
| E3 | bge-m3 fine-tuned | fine-tuned | after-* (the main result) |
| N1 | none (General mode, no RAG) | fine-tuned | after-* (optional block) |

## Rules for every day (so the before/after comparison is fair)
1. **Same everything except what's being tested:**
   - same test set (check its hash), same judge, same code (`baseline-v1` for before; only the model/embedder change after);
   - same quantization (**Q4_K_M**, like the current LM Studio files);
   - same context length on every benchmark day: **49152 for each answer model**, Flash Attention ON, GPU offload MAX, Parallel 4.
     Why 49152: LM Studio splits the context across the 4 parallel slots, so each request gets 1/4 (~12k). A high-effort law answer needs up to ~10–12k. With 32k, high-effort requests fail with "Context size has been exceeded".
2. `EVAL_TEMPERATURE=0` for every run.
3. **Load only the models the day needs.** Gemma is always needed, because it is the router and the vision model. Close the browser and stop other GPU work (OCR, ingest), so the speed numbers are comparable.
4. **The router runs once per question.** Its decision is cached in `eval/runs/route-cache.jsonl` (made on Day 1) and reused by every setting, model and variant. So routing is identical everywhere, and only the answers differ. Never delete this file.
5. **Results go to `eval/runs/<variant>/<model>/`.** Never overwrite a finished run. The runner resumes: if it stops, run the same command again.
6. Fill in the "Run log" table at the bottom of the day's file (date, git sha, anything unusual).
