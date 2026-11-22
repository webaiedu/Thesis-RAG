# Benchmark plans

One file = one model's runbook. Run them in this order:

| Part | File | What it measures |
|---|---|---|
| 1 | [before-gemma.md](before-gemma.md) | Gemma 4 E4B, **before** fine-tuning (baseline) |
| 2 | [before-qwen3-30b.md](before-qwen3-30b.md) | Qwen3 30B, **before** fine-tuning (baseline) |
| (fine-tuning happens here, see `planning/` and the fine-tuning plan) | | |
| 3 | [after-gemma.md](after-gemma.md) | Gemma 4 E4B, **after** fine-tuning |
| 4 | [after-qwen3-30b.md](after-qwen3-30b.md) | Qwen3 30B, **after** fine-tuning |

## Time plan: one 6-hour session per day, nothing overnight
The PC is available **09:15–16:30** each day and cannot run overnight, so every part is split into **sessions**. One session = one day.

**Every session:**
1. **09:15:** start the services (LM Studio model(s), retrieval server).
2. **~09:30:** start the runner or judge.
3. **16:15:** stop it with **Ctrl+C**. Answers and judgements are written one line at a time, so nothing is lost.
4. **16:15–16:30:** commit `eval/runs/` (only finished files), and fill in the run log.

The next session runs the **same command** again. It skips everything already done.

**Rules for sessions:**
- Never run two runners on the same `--out` folder.
- Never run the judge while an answer run is going: latency is measured during answering.
- **Model swaps cost ~5 min:** unload the answer model and load the 80B for judging (context 32768, Parallel 4).

**Measured in the Gemma pilot (22 Nov):**

| Step | Speed | Full size |
|---|---|---|
| Gemma answers (law) | ~19/min | 3,285 in **~2.9 h** |
| Gemma answers (files) | ~17/min | 684 in **~40 min** |
| File extraction (once) | ~1 s per page; photos + vision ~4–8 s | – |
| 80B judge | ~25/min | ~4,000 in **~2.7 h** |

The Gemma baseline is therefore **~6.3 h: one full session**.

**Measured in the Qwen3 30B pilot (22 Nov):**

| Step | Speed | Full size |
|---|---|---|
| law answers | ~7.3/min (180 in 24.5 min) | 3,285 in **~7.5 h** |
| file answers | ~6.3/min (90 in 14.2 min) | 684 in **~1.8 h** |

Its answers are longer and slower than Gemma's (~2.6×). The Qwen baseline is therefore **~9.3 h of answers + ~2.7 h of judging ≈ 2 sessions**.

**With a second DGX Spark (from 23 Nov): see [SECOND_PC.md](SECOND_PC.md).** PC A runs Gemma and the judge, PC B runs Qwen 30B. The before-fine-tuning part ends on 25 Nov.

**Revised sessions on one PC only (before fine-tuning):**
1. Gemma B0 answers.
2. Load the 80B: judge the Qwen pilot + Gemma B0. Then load Qwen and start the Qwen B0 answers.
3. Finish the Qwen B0 answers.
4. Load the 80B and judge Qwen B0; reports, model comparison.

The rows below are the original estimates; the four sessions above replace sessions 1–5.

| Session | Work | Machine time |
|---|---|---|
| **P** | Pilot: 20 law + 10 file questions × all settings, Gemma + Qwen 30B; judge them with the 80B; extraction benchmark | ~5 h |
| **Before fine-tuning** | | |
| 1 | Gemma B0 law answers (9 settings × 365 = 3,285) | ~5–6 h |
| 2 | Gemma B0 file answers (9 × 76 = 684) + search benchmark; then load the 80B, start judging | ~1.5 h + ~4 h |
| 3 | finish judging Gemma B0 (~4,000 total); Qwen 30B B0 law answers start | ~1 h + ~5 h |
| 4 | Qwen 30B B0: finish law + file answers | ~3 h |
| 5 | judge Qwen 30B B0, reports, compare models; optional N0 if time is left | ~4–5 h |
| **After fine-tuning** (E3 = full grid; E1 and E2 = 3 settings: effort low/mid/high, technicality auto) | | |
| 6 | Gemma E3 law answers | ~5–6 h |
| 7 | Gemma E3 files + E2 (1,095) + E1 search benchmark | ~5 h |
| 8 | Gemma E1 (1,095); start judging | ~2 h + ~4 h |
| 9 | finish judging Gemma (~6,200 total), reports, compare with B0 | ~3 h |
| 10–13 | the same four sessions for Qwen3 30B | ~4 × 5 h |

**Total: P + 5 sessions before fine-tuning + 8 after = about 14 working days of machine time.** Each session needs a person for only ~30 min (start, swap models, stop, commit).

**Ways to shorten it:**
- **A second PC with ≥ 48 GB GPU/unified memory** runs the 80B judge in parallel. The judge server URL is not part of the judge's identity, so the scores stay valid. That removes the judging sessions: about 10 instead of 14.
- **A smaller grid for Qwen 30B:** effort low/mid/high × technicality auto (3 settings, not 9). This saves ~1.5 sessions per part. Decide before session 3 and use the same grid after fine-tuning.
- **N0/N1 (no RAG) are optional:** only on spare time, at 3 settings.

Both "before" parts must be finished **before any fine-tuning starts**. Otherwise the baseline is not trustworthy.

## Prerequisites (once, before Day 1)
- [ ] The hand-checked test sets exist: `eval/data/test.jsonl` (365 questions) and `eval/data/test_files.jsonl` (76 questions with attached files in `eval/data/files/`), both after the team recheck.
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

9 settings × 365 questions = **3,285 law answers + 684 file answers per variant** (E1/E2 after fine-tuning: 3 settings). Across the 4 days this covers all models × efforts × technicalities, before and after.

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
