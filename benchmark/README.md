# Benchmark plans

One file = one model's runbook. Run them in this order:

| Part | File | What it measures |
|---|---|---|
| 1 | [before-gemma.md](before-gemma.md) | Gemma 4 E4B, **before** fine-tuning (baseline) |
| 2 | [before-qwen3-30b.md](before-qwen3-30b.md) | Qwen3 30B, **before** fine-tuning (baseline) |
| 3 | [before-qwen3-next-80b.md](before-qwen3-next-80b.md) | Qwen3-Next 80B, **before** fine-tuning (baseline; added 23 Nov at the supervisor's request) |
| Gold standard | [../eval/GOLD_GUIDE.md](../eval/GOLD_GUIDE.md) | humans + Claude rate a blind sample of all 3 models; checks the 80B judge (incl. self-preference) |
| (fine-tuning happens here: **only the best of the 3 models**, chosen after the gold check) | | |
| 4 | [after-gemma.md](after-gemma.md) / [after-qwen3-30b.md](after-qwen3-30b.md) | the chosen model, **after** fine-tuning (an 80B "after" runbook is written only if the 80B is chosen) |

**Three models from 23 Nov:** Gemma 4 E4B (`low`), Qwen3 30B (`mid`), Qwen3-Next 80B (`high`). Same test sets, settings, caches and judge for all three. The 80B also judges, so it rates its own answers; the gold standard measures that bias.
**Judge speed on real answers (23 Nov):** ~15–19 judgements/min (the 25/min below was measured on short calibration answers), so ~4,000 answers take **~3.5–4.5 h**.

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
- **Model swaps cost ~5 min:** unload the answer model and load the 80B for judging (context 131072, Parallel 4).

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

**Measured in the Qwen3-Next 80B pilot (24 Nov, PC A, context 50176, Parallel 4, 0 errors, no `<think>` text):**

| Step | Speed | Full size |
|---|---|---|
| law answers | ~6.7/min (180 in 26.8 min, ~36 s per answer) | 3,285 in **~8.2 h** |
| file answers | ~5.9/min (90 in 15.2 min, ~41 s per answer) | 684 in **~1.9 h** |

That is ~10 h of answers, so 2 sessions, plus ~4 h of judging.

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
- **N0/N1 (no RAG) are required since 26 Nov (team decision: the thesis needs "before RAG vs after RAG"):** law test set (1,095 answers) **and** file test set (228 answers; the attached file is still given, only the law search is off), 3 settings (effort low/mid/high × technicality auto), N0 for all three base models before fine-tuning, N1 for the fine-tuned model after it.

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
| N0 | none (General mode, no RAG) | original | before-* (**required**, all 3 base models, 3 settings) |
| E1 | bge-m3 fine-tuned | original | after-* |
| E2 | bge-m3 (original) | fine-tuned | after-* |
| E3 | bge-m3 fine-tuned | fine-tuned | after-* (the main result) |
| N1 | none (General mode, no RAG) | fine-tuned | after-* (**required**, the fine-tuned model, 3 settings) |

## Rules for every day (so the before/after comparison is fair)
1. **Same everything except what's being tested:**
   - same test set (check its hash), same judge, same code (`baseline-v1` for before; only the model/embedder change after);
   - same quantization (**Q4_K_M**, like the current LM Studio files);
   - same context length on every benchmark day: **131072 for every model** (answer models and the judge), Flash Attention ON, GPU offload MAX, Parallel 4:
     `lms unload --all && lms load <model> -c 131072 --parallel 4 --gpu max`.
     Why 131072 (changed 24 Nov from 49152): the 4 parallel requests share the context. A high-effort answer is up to ~17k prompt + 6,000 answer tokens, so 4 at once need ~92k. With 49152, Qwen 30B answers on PC B were cut off ("Context size has been exceeded" in the LM Studio log, nothing in errors.jsonl). The runner now refuses to start below 131072 (`EVAL_MIN_CONTEXT`).

## Cut-off answers: fixed 24 Nov (baseline-v1.1)
Two things cut answers mid-sentence without any error:
1. **Context overflow** (above). Fixed by context 131072 and the runner's start check. A mid-answer LM Studio error now fails the answer (errors.jsonl), so it is retried.
2. **The effort length caps** in `backend/src/chat/answer.config.ts`, previously low 700 / mid 1,500 / high 3,000 tokens. Qwen's tokenizer needs about one token per Bangla character, so Qwen's Bangla answers hit the cap and stopped mid-word: ~100 of the first 1,568 Qwen 30B answers and ~26 of 1,456 80B answers. Gemma was not affected (its tokenizer is much more efficient for Bangla).
   - New caps: **low 1,500 / mid 3,000 / high 6,000**. The effort instructions in the prompt still set the intended length.
   - Only answers that hit the old cap can change (temperature 0), so only those were re-run: their keys were removed from answers.jsonl (backup kept as `answers.before-cap-fix.jsonl`) and the same command was run again.

Every answer now stores `finishReason` (`stop` = finished; `length` = cut), `maxTokens` and `redoneLonger`. **A cut answer is never saved:**
- the runner answers that question again at once with 2×, then 4× the length limit (at most 16,000 tokens), and saves the first complete answer (`redoneLonger: true`);
- if it is still cut, it is not saved: it goes to `errors.jsonl`, the run reports an error, and the chain stops for a human/Claude to look at it (usually a model repeating itself);
- every redo is logged in `cut.jsonl`. The runner's last line is `Finished: N answers written, E errors, 0 cut saved (R cut answers redone longer)`.

Tested 24 Nov with a forced 40-token limit (`EVAL_BASE_CAP=40`, tests only): one answer was redone at 80 tokens and saved complete; the other was still cut at 160 and went to errors.jsonl, not answers.jsonl.
2. `EVAL_TEMPERATURE=0` for every run.
3. **Load only the models the day needs.** Gemma is always needed, because it is the router and the vision model. Close the browser and stop other GPU work (OCR, ingest), so the speed numbers are comparable.
4. **The router runs once per question.** Its decision is cached in `eval/runs/route-cache.jsonl` (made on Day 1) and reused by every setting, model and variant. So routing is identical everywhere, and only the answers differ. Never delete this file.
5. **Results go to `eval/runs/<variant>/<model>/`.** Never overwrite a finished run. The runner resumes: if it stops, run the same command again.
6. Fill in the "Run log" table at the bottom of the day's file (date, git sha, anything unusual).
