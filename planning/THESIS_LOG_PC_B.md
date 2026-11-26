# Thesis log, PC B: what this PC did, is doing and will do

PC B is the second NVIDIA DGX Spark (folder `~/Desktop/Thesis-RAG PC-B`, branch `benchmark-setup`). Its job is the **Qwen3 30B** benchmark: its B0 answers, then judging them with PC B's own Qwen3-Next 80B. PC A keeps its own log (Gemma, the 80B, the judge for other runs, human scoring, fine-tuning).

Each entry says **what** was done, **why**, the **result** with numbers, and **where** the evidence is. Add new entries at the end of the right section and keep the dates.

- **Thesis:** *Privacy Driven AI Protection: Safeguarding Sensitive Information in RAG Systems Using Multi-Layer Filtering* (fine-tuning + privacy).
- **PC B's part:** the Qwen3 30B baseline (**B0** = no fine-tuning, no privacy filter), one of the three base models compared before the best one is fine-tuned.
- **Rules on PC B:**
  - only free, local tools; all models run in LM Studio on this PC, and the providers in `backend/.env` and the judge in `eval/config.json` stay `lmstudio`;
  - no edits to code, prompts, test sets or the shared caches (`route-cache.jsonl`, `file-cache.jsonl`);
  - commit only `eval/runs/B0/qwen3-30b*`.

Last updated: 24 Nov 2026, 16:35.

---

## 1. Setup (23 Nov 2026)

| Item | Detail | Evidence |
|---|---|---|
| Machine | NVIDIA DGX Spark, Linux aarch64, kernel 7.0.0-1025-nvidia | |
| Code | git checkout of `benchmark-setup`. The folder was first a copy of `main` without `.git` and was fixed to a proper checkout | commit `353d8e5` |
| Copied from PC A | `retrieval/chroma_db` (the same search index) and the two `.env` files | `benchmark/SECOND_PC.md` |
| Python | 3.12 venv; torch 2.14.1+cu130, torchvision 0.29.2, CUDA available. The cu128 index gave a CPU-only torch on this hardware | `SECOND_PC.md` |
| Node | 22.20.0 (for the benchmark runner) | |
| Model files | sha256 identical to PC A: Qwen3 30B `88168cc3…`, Gemma `0ffb122c…`, mmproj `bdfc4935…`, Qwen3-Next 80B Q4_K_M `eeece92f…4a7472` (also equals the official Hugging Face file) | `SECOND_PC.md` |
| LM Studio id | Qwen must be loaded as `qwen/qwen3-30b-a3b-2507` (PC A's id, used in `backend/.env`); PC B's default id doesn't match | |

**Why this matters for the thesis:** both PCs use the same code commit, search index, model files (checked by hash), test sets and cached router decisions. So results from PC A and PC B can be compared as if one machine had made them.

---

## 2. Qwen3 30B B0 answers

**Run:** `backend/src/eval/run-eval.ts`, variant B0, model `mid` (Qwen3 30B), effort {low, mid, high} × technicality {low, auto, high}, mode auto, temperature 0, 4 parallel workers.
- **Law:** 365 questions × 9 = **3,285 answers** → `eval/runs/B0/qwen3-30b/`.
- **Files:** 76 questions × 9 = **684 answers** → `eval/runs/B0/qwen3-30b-files/`.
- **Routing:** router decisions and file extractions come from the shared caches, so Qwen gets exactly the same routing and file text as Gemma and the 80B. The only variable is the answer model.
- **Run script:** `~/qwen-b0.sh`, outside the repo; log `~/qwen-b0.log`.
  - It refuses to start on any cache miss, runs law then files, and checks that the shared caches stay unchanged.
  - It resumes where it stopped, since sessions run 09:30–16:30 with nothing overnight.

### Session log
| Date | What happened | Answers | Evidence |
|---|---|---|---|
| 23 Nov | Session 1 | law 1,356/3,285, 0 errors; low effort complete | commit `3314dd4` |
| 23 Nov | Continued to 16:36 | law 1,568/3,285, 0 errors; mid effort 473/1,095 | commit `c27de76` |
| 24 Nov 12:33 | Resumed. Qwen had to be reloaded with the right id; the retrieval server was restarted | | `~/qwen-b0.log` |
| 24 Nov 14:47 | **Problem found:** 2 "empty answer" errors at high effort (details below) | law 2,655 | |
| 24 Nov 14:49–16:10 | Fixed (below); cut answers removed and the run restarted with PC A's fix `fdaa982` | | |
| 24 Nov 16:33 | Stopped for the day (user). Pushed | law **2,801/3,285**, 0 new errors, 0 saved cut; 6 automatic redos in `cut.jsonl`; files not started | this commit |

### Measured speed on PC B (Qwen3 30B, 4 workers)
| Effort | Answers/min |
|---|---|
| Low | ~22.3 |
| Mid | ~11.8 |
| High | ~7–8 |

The Gemma pilot speed was ~19/min at all efforts. The Qwen pilot was ~2.7× slower than Gemma per answer.

---

## 3. Problem found on PC B: silently cut-off answers (24 Nov)

PC B found this problem, and it led to the project-wide fix **baseline-v1.1**.

**What happened:**
- At 14:02:45 and 14:15:07 the runner logged 2 answers as "The model returned an empty answer". Both were high effort, technicality low.
- The LM Studio server log showed **"Context size has been exceeded"** at those moments.

**Cause 1: the context was too small.**
- Qwen was loaded with context 49,152 shared by 4 parallel requests, so each slot held 12,288 tokens.
- A high-effort prompt reached **~12,270 tokens**, which left no room for the answer, and LM Studio then failed **every request in that batch**.
- So besides the 2 logged errors, **6 more answers were saved cut off mid-sentence**, with no error. One reply was a single word.

| Log day | "Context size has been exceeded" lines | Failed requests |
|---|---|---|
| 22 Nov | 0 | 0 |
| 23 Nov | 0 | 0 |
| 24 Nov | 28 | 8 |

**Cause 2: the length caps were too low** for Qwen in Bangla (found by PC A at the same time).
- The old caps were low 700 / mid 1,500 / high 3,000 tokens.
- Qwen's tokenizer uses about **1 token per Bangla character**, so long Bangla answers hit the cap and stopped mid-word.

**Fix steps on PC B:**
1. **14:48:** stopped the run, removed the 6 cut answers by hand (backup kept), and reloaded Qwen with context 98,304 as a stopgap.
2. **15:20:** pulled PC A's fix `7a3ac94` (baseline-v1.1):
   - caps are now low 1,500 / mid 3,000 / high 6,000;
   - models are loaded with **context 131,072**, and the runner refuses less;
   - each answer records `finishReason` / `cut`.

   Reloaded Qwen at 131,072 / Parallel 4. `eval/cut_check.py --remove` **flagged and removed 185 of 2,815 answers:**

   | Effort | Hit the old cap | Ended mid-sentence only |
   |---|---|---|
   | Low | 85 | 81 |
   | Mid | 74 | 77 |
   | High | 12 | 18 |

3. **15:31–15:53:** the re-run showed 3 answers still cut at the new caps. Two were long Bangla answers; one was a **repetition loop**. A local cap raise was tried for a few minutes and then reverted, so PC B's code equals PC A's.
4. **16:01:** pulled PC A's fix `fdaa982`:
   - the runner never saves a cut answer;
   - it redoes it at 2× and then 4× the limit (max 16,000 tokens);
   - if it is still cut, it records an error;
   - every redo is logged in `cut.jsonl`.

   A second `cut_check --remove` **flagged 82 of 2,782**: low effort 54 over the old cap, 1 mid-sentence and 1 runner-cut; mid effort 25 over the old cap and 2 mid-sentence. Most were long but complete answers that `cut_check` re-checks to be safe; they're redone, with the same result at temperature 0.
5. **16:10:** restarted on `fdaa982`, with a clean working tree and caps 1,500 / 3,000 / 6,000. The redo works: an answer that reached the low cap was redone automatically instead of being saved cut.

**Backups and records** (all in `eval/runs/B0/qwen3-30b/`):
- `answers.before-cap-fix.jsonl` and `run-config.before-cap-fix.json`: the state before any fix;
- `answers.before-cap-raise.jsonl` and `run-config.before-cap-raise.json`: the state before the short local cap raise;
- `cut-removed.jsonl`: every answer removed by a cut check;
- `cut.old-runner.jsonl`: cut answers logged by the runner before `fdaa982`;
- `cut.jsonl`: redos by the current runner;
- `errors.jsonl`: errors, including the 2 from 14:02 and 14:15.

**Points for the thesis:**
- **Silent truncation is a real benchmark risk:** neither the error file nor the answer count showed it. Only the LM Studio server log and `finishReason` did, so check both.
- **Tokenizer efficiency for Bangla** differs strongly between models. Gemma was not affected (0 cut, checked by PC A); Qwen and the 80B were. This affects length limits, context needs and speed, and so cost.
- **Qwen repetition loop:** on `q-8b37d8c1f3f6` (a Bangla question on maintenance after divorce, low effort, high technicality), Qwen once repeated one sentence until the limit. On the re-run (16:10, same settings, temperature 0) it gave a normal complete answer (594 chars, `finishReason: stop`). So temperature 0 is **not fully deterministic** with 4 parallel requests, because batching changes the floating-point arithmetic slightly. Report this as a limitation: repeated runs can differ slightly, and degenerate loops are rare and not reproducible.

---

## 4. In progress (end of 24 Nov)
- **Qwen3 30B B0:** law 2,801/3,285 (low 1,095 and mid 1,095 complete; high 611/1,095). 484 law answers (~1 h) and 684 file answers (~1.2–1.8 h) are left: **~2.5–3 h on 25 Nov**.
- **Automatic redos so far:** 6 answers reached the v1.1 cap and were redone with a longer limit (`cut.jsonl`); 0 cut answers saved; no new context errors since 14:15.

## 5. Next steps on PC B
1. **When law + files are complete with 0 errors:** `git pull --rebase`, then commit and push `eval/runs/B0/qwen3-30b*` right away, so PC A can add the answers to the human-scoring site (AinSutro).
2. **Switch to the judge:**
   - unload Qwen;
   - check the 80B file's sha256 (`eeece92f…4a7472`);
   - load `qwen3-next-80b-a3b-instruct` with context 131,072 and Parallel 4.
3. **Judge and report:**
   - `score.py judge` + `report` for `runs/B0/qwen3-30b` and `runs/B0/qwen3-30b-files` (`--test data/test_files.jsonl`); ~3,969 judgements at ~15–19/min is **~3.5–4.5 h**;
   - `score.py compare runs/B0/gemma runs/B0/qwen3-30b --across-models` (check `--help` first).
4. **Results to add here:** Qwen 30B B0 correctness, faithfulness, route_ok and ctx_hit (law and files), and the paired difference vs Gemma.
5. **Later (planned):** Qwen privacy runs (P0 and the layers, ~9 h, 2 sessions) and, if Qwen is chosen for fine-tuning, the "after" runs E1/E2/E3 (`benchmark/after-qwen3-30b.md`).

---

## 6. 25 Nov 2026 (session log)
- **10:00 checks:**
  - `git pull --rebase`: already up to date (`f6d77a2`).
  - Providers in `backend/.env` (LLM, ROUTER, GENERAL) are `lmstudio`; the judge in `eval/config.json` is `lmstudio` (`qwen3-next-80b-a3b-instruct`, j1). Nothing calls an online model.
  - "Context size has been exceeded" in the LM Studio server log: 24 Nov (1) 28, 24 Nov (2) 0, 25 Nov 0.
- **10:00 reload:** Qwen was loaded with the default id `qwen3-30b-a3b-instruct-2507` (the run needs `qwen/qwen3-30b-a3b-2507`) and context 262,144. Reloaded with the right identifier, **keeping the model's maximum context of 262,144** at the user's request (Parallel 4, GPU max). That is 65,536 tokens per slot, more than the runner's minimum of 131,072 in total. The context size does not change the answer text; it only rules out the context errors from 24 Nov. `run-config.json` records the loaded context.
- **10:00:** retrieval server started (`~/retrieval.log`, bge-m3 on CUDA).
- **10:00:48:** resumed the run with `STOP=23:59 ~/qwen-b0.sh`. Cache check: 0 misses. 2,801 of 3,285 law answers were already done, so 484 are left.
- **10:15 audit of every saved law answer (read only, 2,811):**
  - 0 duplicates, 0 empty, 0 saved with `finishReason: length` or `cut: true`.
  - All 181 answers made by the v1.1 runner have `finishReason: stop`.
  - The 2 answers that don't end with punctuation are `stop` (they end on a list line), so they are complete.
  - The 2 old errors in `errors.jsonl` (24 Nov 14:02/14:15) were redone and saved.
  - Every redo in `cut.jsonl` ended in a complete saved answer. The 2 new ones from 10:06 today (high effort, reached 6,000) are being redone at 12,000.
  - The 2,630 older answers carry no `finishReason` (old runner). They passed both exact-token `cut_check` runs on 24 Nov. Planned: re-measure them read-only when Qwen is idle after the files run.
- **10:10–10:17 exact re-check of the old answers** (user's request). Paused the run with SIGINT at 2,819/3,285 and measured all 2,630 answers that have no `finishReason` with Qwen's own tokenizer through LM Studio (read only, 6.6 min).
  - **0 flagged:** none reached the old cap they were made under, and all end like a finished sentence.
  - Longest answer per effort: low 683/700, mid 1,483/1,500, high 2,921/3,000 tokens.
  - Together with the audit above, **every one of the 2,819 saved law answers is complete**.
- **10:17:** the run resumed: 466 law answers left, all high effort.
  - Speed estimate corrected: high effort runs at ~2.5–3 answers/min (24 Nov log), not ~7/min. Long redos at 12,000 tokens slow it further.
- **10:22 one error (not a saved cut):** `q-b2435167e8e5` high/auto reached 6,000 tokens at 10:06 (very probably a repetition loop; normal high answers use ~1,500). The runner's redo at 12,000 then hit the 300 s LM Studio streaming timeout (`llm.service.ts:182`, "operation was aborted due to timeout"), so it went to `errors.jsonl` and nothing was saved.
  - The other redo from 10:06, `q-8a9b64fa0180` high/auto, succeeded: a normal answer (3,172 chars, `stop`). The loops are not deterministic.
  - Plan: `qwen-b0.sh` attempt 2 retries the key on its own, which is faster per stream (fits in 300 s) and uses a different batch. If it still fails, the only fixes change code (timeout or repetition penalty) for every model: stop and tell the user and PC A.
- **10:40 check that the judge sees the full answers** (user's request):
  - `score.py` gives the judge only the first **8,000 characters** of each answer (`score.py:250`). Qwen law answers so far: 0 are longer (the longest is 3,863). Gemma B0: law 0; files 1 (8,530 chars, already judged on PC A; tell PC A).
  - The longest judge prompt is ~16k characters, ~16k tokens at worst. That fits easily in one 80B slot (32,768 at 131,072/4).
  - A judge reply cut at its 500-token cap can't be saved silently: no JSON means an error, the error is not written, and the next run retries it.
  - Gemma's judgments: 3,285 + 684, no errors.
  - New `~/judge-30b.sh` (outside the repo, log `~/judge-30b.log`):
    - before judging, it refuses to start unless both runs are complete (3,285 / 684 unique keys), with none cut or empty and none over 8,000 chars, and the judge is the local 80B;
    - then it judges and reports law and files, retrying once;
    - it checks that every answer key has a judgment;
    - it runs `compare --across-models` only if `--help` lists it.
- **10:26 second timeout:** `q-14413599c3f5` high/auto timed out on its **first** try (300 s), before the runner could mark it as cut.
  - Cause: with 4 parallel streams Qwen writes ~21–23 tokens/s per stream (LM Studio `print_timing`, the same on 24 Nov at 131,072, so the larger context is not the cause). A 6,000-token answer therefore takes ~285 s plus the prompt, right at the backend's 300 s streaming timeout.
  - Only answers that run far past normal length (repetition loops; normal high answers are ~1,500 tokens) are affected. Nothing cut is saved: these become errors and are retried.
  - **Fix (no code change):** `~/qwen-b0.sh` (PC B's own script, outside the repo; backup `~/qwen-b0.sh.bak-25nov`) now retries with `--workers 1` when 8 or fewer answers are left, up to 3 attempts. One stream is ~3× faster, so a 12k–16k-token redo fits in 300 s, and the different batching usually breaks the loop. Workers only change the batching, not the settings (temperature 0, same caps).
- **10:50 judge sees the whole answer (user's request):** `eval/score.py:250` no longer cuts the answer at 8,000 characters before judging.
  - The judge config hash is unchanged (`aebea71088b8`): it covers the config, system prompt and template, not this limit. For every answer of 8,000 chars or less, the prompt is byte-for-byte the same, so all existing judgments stay valid (Gemma law, all pilots, and Qwen law so far: 0 answers over 8,000).
  - **For PC A:** one Gemma file answer (`runs/B0/gemma-files`, 8,530 chars) was judged on its first 8,000 chars only; its judgment would need redoing to be exact. PC A's 80B answers may include longer ones too. Context check: even a 16,000-token answer plus excerpts fits one 80B slot.
  - `~/judge-30b.sh` now judges long answers in full instead of refusing them.
  - This is PC B's only code change. It is not committed yet: ask the user, because PC B normally commits only runs and this log.
- **11:00:** the user is fixing the Gemma 8,000-char judging issue on PC A. Plan: if PC A pushes its own `score.py` change, PC B drops its local edit and uses PC A's version, so the code stays the same on both PCs. Check before judging that the code still passes the whole answer.
- **11:50 law main pass finished:** "458 answers written, 8 errors, 0 cut saved". All 8 errors are runaway high-effort answers that hit the 300 s timeout: `q-b2435167e8e5` auto+high, `q-14413599c3f5` auto+high, `q-183d232a214e` auto, `q-cb2eb5f67a2d` high, `q-425512a5c4b8` high, `q-c373d7224b24` high. In one case LM Studio showed 5,858 tokens generated in 300 s; normal high answers today were at most ~3,300.
  - The 1-worker threshold was raised to ≤20 left (11:40).
  - A handoff script stopped the old `qwen-b0.sh` (still running the 4-worker retry version) and started the new one: **3,277/3,285, retrying the 8 with `--workers 1`**.
- **12:04 repeatable loop:** `q-b2435167e8e5` high/high ran alone (1 worker, ~56 tokens/s) and reached the cap at 6,000, 12,000 and **16,000** tokens. The runner recorded "answer still cut at max_tokens 16000; not saved", so nothing cut was saved.
  - This question looped in all three technicality settings today. The other two recovered: `auto` at 12,000 (3,849 chars, `stop`); `low` on 24 Nov.
  - `q-14413599c3f5` high/auto also recovered on the 12,000 redo (3,849 chars, `stop`).
  - Run alone at temperature 0 the loop repeats, so the script's attempts 2 and 3 would waste ~20 min and then stop before the files.
  - So `~/qwen-b0.sh` got a `SKIP_LAW=1` option. A handoff starts the files run as soon as this law pass ends, if only this key is missing.
- **12:18 law retries done:** "6 answers written, 2 errors, 0 cut saved".
  - Law: **3,283/3,285**. Every saved answer is complete.
  - Two repeatable loops are left, both high effort, technicality high: `q-b2435167e8e5` (cut at 6k, 12k and 16k) and `q-14413599c3f5` (cut at 6k and 12k, then timed out during the 16k attempt).
  - Both questions recovered in other settings: `q-b2435167e8e5` low (24 Nov) and auto (12k redo); `q-14413599c3f5` auto (12k redo, 3,849 chars).
- **12:18 files started** by the handoff (`SKIP_LAW=1 ~/qwen-b0.sh`): 0/684, 4 workers, router 76 cached, 0 to route.
- **12:18 one more try for the two loops:** a separate runner with `--workers 2`, run at the same time as the files run, so the requests are batched with others like most answers (log `~/qwen-b0-loops.log`). Same code, settings and caps. If they still loop, ask the user how to record them (no code/sampling change on PC B).
- **12:28 batched loop retry:** `q-b2435167e8e5` high/high **recovered**: it reached 6,000 again, and the 12,000 redo then finished normally (2,554 chars, `stop`, no repeated sentence). So batching with other requests changes the floating-point path enough to break a loop that repeats when the question runs alone.
  - `q-14413599c3f5` high/high looped again (6,000, then timed out on the 12,000 redo at the batched speed of ~20 tokens/s). Law: **3,284/3,285**.
  - 12:29: one more batched try for it.
- **12:39:** `q-14413599c3f5` high/high looped again on the second batched try (6,000, then timed out at 12,000). That is 5 failed tries: alone at 6k/12k/16k, and batched twice.
  - `~/qwen-loop-retry.sh` keeps retrying it batched alongside the files run, up to 6 tries, and stops when it is saved.
  - File redo `f-09f20d621af7` low/auto reached 1,500 and 3,000, then finished at the 6,000 limit (895 chars, `stop`).
- **13:15 what `q-14413599c3f5` high/high really produces** (the user said "retry with whatever you need"): a read-only probe in the scratchpad sends the runner's exact request (cached route, same settings, cap 6,000) and saves the streamed text, without writing to the run.
  - Batched with the files run, it gave a **normal, complete answer**: 4,636 chars, `stop`, 45 lines, none repeated, about 5,000 tokens, in 248 s.
  - So the failures have two causes. Alone at temperature 0 it slips into a loop (cut at 6k, 12k and 16k). Batched, the normal ~5,000-token Bangla answer needs ~250 s at ~20 tokens/s, so a slightly slower batch hits the backend's 300 s timeout.
  - Batched tries 1–5: 5 timeouts.
  - Next if try 6 fails: a batch of 2 (~45 tokens/s, so ~110 s), which needs no code change.
- **13:24:** all 6 batched tries (4 parallel file requests) timed out for `q-14413599c3f5` high/high.
  - Queued `~/qwen-loop-pair.sh`: when the files run ends, it runs the key in a **batch of 2** (the runner plus one companion probe request of the same question, output to the scratchpad only), up to 4 tries. A batch of 2 runs at ~45 tokens/s, so the ~5,000-token answer fits the 300 s timeout, and the batch is not the solo one that loops.
- **13:35 naming decision (user, told to both PCs):** the human-scoring web app is now called **"AinSutro Scoring Page"**, and the thesis chatbot is renamed **Ainkhoj → AinSutro**. From now on this log uses these names. Earlier entries that say "AinSutro" mean the scoring page.
  - **No code change on PC B, for these reasons:**
    - `BOT_NAME` is not only a label. `identityLine()` (`backend/src/bot.config.ts`) puts it into **every system prompt** ("You are Ainkhoj, …"), so renaming changes the prompt of every answer.
    - All B0 answers so far (Gemma, Qwen 30B 3,284/3,285 + files in progress, 80B on PC A in progress) were made with "Ainkhoj". Changing it now would give the last Qwen answers and PC A's running 80B a different prompt from the rest of the baseline.
    - The rename touches code, docs and the scoring app, which PC A maintains (PC B never edits `eval/human_app/` or `human.py`); doing it on both PCs would also cause git conflicts.
  - **Proposed for PC A:** rename in code (`bot.config.ts` + `frontend/lib/brand.ts`) and docs only **after all B0 answer runs are finished** (Qwen 30B and 80B). For the before/after comparison, the fine-tuning "after" runs must use the same system prompt as the baseline. So either keep "Ainkhoj" in the benchmark prompt, or document the name change as a prompt change (tag it, e.g. baseline-v1.2). The team decides.
- **13:50 rename confirmed by the user:** the rename (chatbot Ainkhoj → AinSutro; scoring page "AinSutro Scoring Page") is done **on PC A only** and arrives with PC A's next push.
  - The system prompt keeps **"Ainkhoj"** (`backend/src/bot.config.ts`, `eval/make_questions.py` unchanged) until the whole benchmark is finished, so every model gets the identical prompt.
  - PC B edits no files for it, keeps the Qwen 30B run going, and runs `git pull --rebase` before its next commit.
- **14:24 files main pass finished:** "679 answers written, 5 errors, 0 cut saved (9 redone longer)". The 5 errors are long high-effort file answers that hit the 300 s timeout with 4 parallel requests: `f-73dca01deaf4` high/low, `f-09f20d621af7` high/low and high/auto, `f-15c4e271b8b2` high/low, `f-69429ef0b9a2` high/high. `qwen-b0.sh` now retries them with 1 worker (up to 3 attempts). After that, `~/qwen-loop-pair.sh` retries the last law answer (`q-14413599c3f5` high/high) in a batch of 2.
- **14:27 files complete: 684/684.** The 1-worker retry saved all 5: "5 answers written, 0 errors". Shared caches unchanged.
- **14:30 law complete: 3,285/3,285.** The batch-of-2 retry (pair try 1) saved `q-14413599c3f5` high/high complete. The companion request for the same question looped to its 6,000 cap in the same batch. Every Qwen 30B B0 answer is now saved complete (law 3,285 + files 684), with 0 cut answers saved.
  - Next: `git pull --rebase --autostash` and push `eval/runs/B0/qwen3-30b*` + this log, then the 80B sha256 check and `~/judge-30b.sh`.
- **15:00 final audit before the push:**
  - law 3,285 rows / 3,285 unique keys; files 684 / 684; 0 cut or empty; every old-format answer ends like a finished sentence; 0 answers over 8,000 chars (longest law 6,409, files 4,612); 0 "Context size has been exceeded" today.
  - Pushed `eval/runs/B0/qwen3-30b*` + this log so PC A can add the 30B to the AinSutro Scoring Page. The local `eval/score.py` change (whole answer to the judge) is not committed: PC A maintains the code.
- **14:50 judge loaded:** Qwen unloaded. 80B sha256 `eeece92fb61a7810d58a76bf211cb38331b74945e277921cd3fa7b8b575a4472` matches. Loaded `qwen3-next-80b-a3b-instruct` with **context 262,144** (its maximum, like the 30B today), Parallel 4, GPU max.
- **14:52 judging started** with `~/judge-30b.sh` (log `~/judge-30b.log`):
  - the gate passed: law 3,285/3,285, files 684/684, 0 cut or empty, 0 over 8,000 chars;
  - judge hash `aebea71088b8` (j1, same as Gemma);
  - the first judgments are being written.
- **16:17 stopped for today** (user). The judge was stopped with SIGINT: **law 1,684/3,285 judged, files 0/684**. All unique, 0 errors, one judge hash (`aebea71088b8`), 0 incomplete by PC A's new rule (correctness and language_ok present). Judge speed: ~22/min on low/mid answers, ~17/min on high.
- **16:20 pulled PC A's `b0e3c31`** (80B law complete, AinSutro Scoring Page on Firebase, 30B added to it):
  - PC B's local `score.py` edit was dropped. PC A's `score.py` has the same whole-answer change, plus "an incomplete judge reply is retried, never saved". So the code is the same on both PCs.
  - PC A's `bot.config.ts` change is only a comment: `BOT_NAME` stays 'Ainkhoj', so the prompt is unchanged.
  - Shared caches unchanged.

### Summary of 25 Nov on PC B
| Item | Result |
|---|---|
| Qwen3 30B B0 law answers | **3,285 / 3,285** complete (from 2,801), 0 cut saved |
| Qwen3 30B B0 file answers | **684 / 684** complete, 0 cut saved |
| Pushed for the AinSutro Scoring Page | `18fb054` (answers + log), 14:45 |
| Judging Qwen 30B B0 (80B, j1) | law **1,684 / 3,285**, files 0 / 684; resume on 26 Nov |
| Context errors ("Context size has been exceeded") | 0 all day (Qwen at context 262,144, 80B at 262,144) |
| Audits | all 2,630 old-format law answers re-measured with Qwen's tokenizer: 0 cut; every new answer `finishReason: stop`; 0 answers over 8,000 chars |
| Same test as Gemma | test sha256 identical; the same 3,285 + 684 question × setting pairs; question text and files identical |

**Problems and fixes today (for the thesis):**
1. **Wrong LM Studio identifier at start:** Qwen was loaded without the `qwen/` id, so it was reloaded at the user's maximum context of 262,144.
2. **Runaway / very long answers vs. the 300 s timeout:**
   - With 4 parallel requests Qwen writes ~21–23 tokens/s per stream, so an answer of ~6,000 tokens needs ~285 s, right at the backend's 300 s streaming timeout.
   - Affected: 8 law and 5 file answers, all high effort. Some were repetition loops; some were genuinely long Bangla answers (~5,000 tokens).
   - Fixed without code changes:
     - retries with **1 worker** (~56 tokens/s): 6 of 8 law and all 5 files;
     - **batched retries**: `q-b2435167e8e5`;
     - a **batch of 2** (~45 tokens/s): `q-14413599c3f5` high/high, after 11 failed tries (alone it loops; batched with 4 it times out).
   - **Finding:** at temperature 0 the output depends on how requests are batched (floating-point order), so a loop can be repeatable when the request runs alone and disappear in a batch.
3. **The judge saw only the first 8,000 chars of an answer:** fixed in `score.py` (PC A's version is now in git). It changes no existing judgment, because 0 Qwen answers are over 8,000 chars.
4. **Renaming:** chatbot → AinSutro, scoring page → "AinSutro Scoring Page", done on PC A only. The system prompt keeps "Ainkhoj" until the benchmark is finished.

**PC B scripts outside the repo:**
- `~/qwen-b0.sh`: 1 worker when 20 or fewer answers are left, 3 attempts, `SKIP_LAW=1`.
- `~/qwen-loop-retry.sh` and `~/qwen-loop-pair.sh`.
- `~/judge-30b.sh`: checks the answers first (complete, none cut), then judge + report for law and files, checks every answer is judged, then `compare --across-models`. It is resumable.

## 7. Next on PC B (26 Nov)
1. `git pull --rebase`; `lms ps` must show only `qwen3-next-80b-a3b-instruct` (context 262,144 or at least 131,072, Parallel 4). If it doesn't, reload it after checking its sha256.
2. Resume the judge: `setsid nohup ~/judge-30b.sh >> ~/judge-30b.log 2>&1 < /dev/null &`. It skips the 1,684 done; ~2,285 judgments are left at ~17–22/min (≈2–2.3 h). Then the reports and `compare runs/B0/gemma runs/B0/qwen3-30b --across-models` run automatically.
3. Add the results to this log: correctness, faithfulness, route_ok, ctx_hit (law and files) and the paired difference vs Gemma. Commit/push `eval/runs/B0/qwen3-30b*` + this log.

## 8. 26 Nov 2026 (session log)
- **10:25 checks:**
  - `git pull --rebase`: already up to date (`297d412`).
  - Providers in `backend/.env` (LLM, ROUTER, GENERAL) are `lmstudio`; the judge in `eval/config.json` is `lmstudio` (`qwen3-next-80b-a3b-instruct`, `http://localhost:1234/v1`, j1). `GEMINI_API_KEY` has a value in `.env` but no provider uses it. Nothing calls an online model.
  - `lms ps`: only `qwen3-next-80b-a3b-instruct`, context 262,144, Parallel 4 (still loaded from 25 Nov, sha256 checked then). No reload needed. Retrieval server not started (not needed for judging).
- **10:26:54 judging resumed** with `~/judge-30b.sh` (log `~/judge-30b.log`). Gate passed: law 3,285/3,285 unique, files 684/684, 0 cut or empty, 0 over 8,000 chars. Law 1,684/3,285 already judged; it skips those.
- **11:40 plan change (PC A, 26 Nov): no `score.py compare` on PC B** (also not Gemma vs 30B). PC A runs every comparison later, once, for all three models on the answers the humans rated. PC B only judges the full Qwen3 30B run (law + files, each until "0 errors"), writes both reports and pushes.
  - `~/judge-30b.sh` would have run `compare --across-models` at its end. Bash had already read that last command, so the file could not just be edited. Instead only the wrapper was stopped (SIGTERM to `bash judge-30b.sh`); the law judge it had started (`score.py judge runs/B0/qwen3-30b`, setsid) kept running untouched at 2,811/3,285.
  - New `~/judge-30b-nocompare.sh` (copy of the old script without the compare step): it waits for that judge to finish, then runs the same gate, judge law (re-check, every answer judged, retry once) + report, then files (`--test data/test_files.jsonl`) + report. Log still `~/judge-30b.log`. **No compare was run on PC B.**
- **11:40 progress:** law 2,811/3,285 judged, 0 judge errors, ~14.6/min. 0 "Context size has been exceeded" today.
- **12:05 full-answer check (user's request):** the judge sees the whole answer.
  - `eval/score.py` is PC A's `b0e3c31` with no local change: `answer=a.get("reply") or ""`, with no character cut. The running judge started at 10:26, after that code was pulled on 25 Nov.
  - The longest answers are law 6,409 and files 4,612 chars; 0 are over 8,000, so not even the old cut would have touched them.
  - The 4,466 "truncat" hits in today's LM Studio log are only "<Truncated in logs>", LM Studio shortening the prompt it prints to its log. The model gets the full prompt: each logged prompt ends with the template's final JSON-format line.
  - 0 "Context size has been exceeded"; each 80B slot holds 65,536 tokens, against a longest judge prompt of ~16k.
- **12:13 law judging complete:** "done: 1,601 judged, 0 errors". Check: answers 3,285, judged 3,285, missing 0 (one judge hash `aebea71088b8`). Report written (`runs/B0/qwen3-30b/summary.md`).
  - **Qwen3 30B B0, law (n = 3,285, 80B judge j1, 95% bootstrap CI over questions):** correctness **3.95** [3.81, 4.08], faithfulness **4.13** [4.01, 4.24], technicality fit 4.92, route_ok **0.96** [0.94, 0.98], ctx_hit (group) **0.70** [0.65, 0.74], cite recall 0.67, cite precision 0.91, 147 words, 24.5 s per answer.
  - By effort (mean of the 3 technicality settings): correctness low 3.86, mid 3.99, high 4.00; faithfulness low 4.17, mid 4.20, high 4.00; ctx_hit low 0.64, mid 0.70, high 0.75 (higher effort retrieves more excerpts).
  - Weakest: domain `uncategorized` (correctness 2.86, ctx_hit 0.28), `education` (3.27, 0.43), colloquial questions (2.79, ctx_hit 0.33), case-law faithfulness (2.67). Law questions routed to general (54): correctness 1.63.
  - No compare (PC A's plan): these numbers are not put next to Gemma here.
- **12:14 files judging started** (684, `--test data/test_files.jsonl`).
- **12:58 files judging complete:** "done: 684 judged, 0 errors". Check: answers 684, judged 684, missing 0. Report written (`runs/B0/qwen3-30b-files/summary.md`). Script end: "=== end (no compare)".
  - **Qwen3 30B B0, files (n = 684):** correctness **3.18** [2.84, 3.52], faithfulness **3.13** [2.80, 3.47], technicality fit 4.81, route_ok **1.00**, ctx_hit (group) **0.46** [0.36, 0.57], cite recall 0.45, cite precision 0.83, 199 words, 42.1 s per answer.
  - By effort (mean of 3 tech settings): correctness low 3.09, mid 3.19, high 3.25; ctx_hit low 0.42, mid 0.47, high 0.50.
  - By file format: photo bn 2.66 / en 3.28; scan bn 3.03 / en 3.20; text bn 3.00 / en 3.84 (correctness). Bangla photos are the weakest.
  - Routing: general→general 36 (correctness 4.00), law→law 648 (3.13).
- **13:00 final audit:** law 3,285/3,285 and files 684/684 judged, one judge hash `aebea71088b8` (j1), 0 incomplete judgments (correctness and language_ok present), 0 judge errors all day, 0 "Context size has been exceeded" today. **No `score.py compare` was run on PC B**, so there is no compare output to discard. Shared caches (`route-cache.jsonl`, `file-cache.jsonl`) unchanged.

### Summary of 26 Nov on PC B
| Item | Result |
|---|---|
| Qwen3 30B B0 law judged (80B, j1) | **3,285 / 3,285**, 0 errors (1,601 today) |
| Qwen3 30B B0 files judged | **684 / 684**, 0 errors |
| Law | correctness 3.95, faithfulness 4.13, route_ok 0.96, ctx_hit 0.70 |
| Files | correctness 3.18, faithfulness 3.13, route_ok 1.00, ctx_hit 0.46 |
| Compare | not run (PC A runs all comparisons later, once, for all three models on the human-rated answers) |
| Judge sees the full answer | yes (PC A's `score.py`, no cut; longest answer 6,409 chars) |
| Context errors | 0 |
- **13:10 26 Nov: Qwen3 30B B0 fully judged and pushed** (`fb4303c`; checked by PC A: 0 errors, same judge hash). Stopped for today; all models unloaded (`lms unload --all`). Privacy runs not started (inputs not built yet: no privacy branch, canaries, PII index, attack set or filter code; PC A builds them first and sends exact instructions). The 30B "after" runs wait for the team's model choice (after human scoring). No work 27–28 Nov; next session 29 Nov.

## 9. 26 Nov 2026 (afternoon): N0 = Qwen3 30B without RAG
- **13:20 new task (team decision, PC A):** the thesis needs RAG vs no RAG. N0 = Qwen3 30B in the chatbot's **General mode**: no router, no law search; for file questions the attached file is still given (only the law search is off). No code change; the baseline stays frozen. Settings: effort low/mid/high × technicality auto, 365 law questions (1,095 answers) and 76 file questions (228 answers). Then judge with the 80B and report. **No `score.py compare`.**
- **13:30 setup:**
  - `git pull --rebase`: up to date (`10187d1`). `backend/.env`: `GENERAL_PROVIDER=lmstudio` (and LLM/ROUTER `lmstudio`). `GENERAL_MODEL=gemini-3.8-flash` is set but only used when the provider is `gemini` (`chat.service.ts:236`); with `lmstudio` the user's model is used (`mid` → `qwen/qwen3-30b-a3b-2507`). Nothing calls an online model.
  - `lms unload --all` (the 30B was loaded under its default id), then `lms load qwen3-30b-a3b-instruct-2507 --identifier qwen/qwen3-30b-a3b-2507 -c 131072 --parallel 4 --gpu max`. `lms ps`: only the 30B, context 131,072, Parallel 4.
  - Retrieval server started (`~/retrieval.log`): `/domains` lists 9 domains. It is needed only to rank the attached file's passages.
  - Shared caches md5 recorded (route-cache `91ff9a29…`, file-cache `4dfe38df…`).
- **13:35 law pilot** (`--limit 5`, 15 answers): "15 answers written, 0 errors, 0 cut saved". Checks: 15 unique, 0 empty, 0 `<think>`, `sources: []` for all, all `finishReason: stop`, `route: {type: general}`, model `qwen/qwen3-30b-a3b-2507`, real answers (no refusal for missing excerpts). git clean in `run-config.json`.
  - Code check: in General mode the runner passes no route decision (`run-eval.ts:290`) and calls no router, so `ChatService.general()` answers from the original message, the same as the UI's General mode. The `corrected`, `routerTokens` and `routerMs` fields are only copied from the existing route cache and are not used. Gemma was never loaded; caches unchanged.
- **13:37 full chain started:** `~/n0-30b.sh` (outside the repo, log `~/n0-30b.log`, resumable). Steps:
  1. law answers until 1,095 complete (at most 2 runs);
  2. files pilot (15) with checks;
  3. files answers until 228;
  4. caches unchanged;
  5. unload, check the 80B sha256, load the 80B (131,072, Parallel 4);
  6. judge + report law, then files (`--test data/test_files.jsonl`), each until every answer is judged. No compare.
  - It refuses to answer unless the 30B is loaded (131,072 / 4) and the 80B is not, and refuses to judge while the 30B is loaded.
- **15:08 N0 law complete:** "1,080 answers written, 0 errors, 0 cut saved" (plus the 15 from the pilot). Check: 1,095 rows, 1,095 unique, 0 bad (none empty, no `<think>`, `sources: []`, all `stop`, mode general, model `qwen/qwen3-30b-a3b-2507`). Speed: low ~30/min, mid ~16/min, high ~5–6/min.
- **15:10 N0 files pilot** (`--limit 5`): "15 answers written, 0 errors, 0 cut saved"; checks passed (15, none empty, no `<think>`, `sources: []`, all `stop`, a file on each).
  - Read by hand: the answers use the attached file (they quote the letter's "8:00 AM to 8:00 PM, six days a week"), so only the law search is off. There are no refusals.
  - Without the law excerpts the legal content is visibly weaker. For example, the low and mid answers say that overtime at the normal hourly rate "is allowed". This is the RAG vs no-RAG effect that the judge is meant to measure.
- **15:10 N0 files full run started** (228; 213 left).
- **15:29 N0 files complete:** "213 answers written, 0 errors, 0 cut saved". Check: 228 rows, 228 unique, 0 bad. Shared caches unchanged (md5).
- **15:30 judge switch (script):** `lms unload --all`; 80B sha256 matches `eeece92f…4a7472`; loaded `qwen3-next-80b-a3b-instruct` with context 131,072, Parallel 4, GPU max. Judging N0 law started at 15:30:29 (j1, `aebea71088b8`).
- **16:01 N0 law judging: 1,094/1,095, 1 judge error that does not go away.** `N0|q-22327c908c72|mid|mid|auto|general` (Bangla, a family-law question on annulment for the husband's impotence; the answer is 1,199 chars).
  - Failed tries: script attempt 1 (16:00), attempt 2 (16:01), and a 3rd try at 16:05 batched with the files judging. `score.py` itself retries 3× per run.
  - **Cause (read-only probe in the scratchpad, exact same prompt and settings):** the 80B returns a complete judgment (finish `stop`, 72 tokens; correctness 3, faithfulness null, tech 4, language_ok true, refused false, reason "…cites non-existent sections…") but **leaves out the closing `}`**. `score.py`'s `\{.*\}` match then finds no JSON, so nothing is saved, which is correct by design. At temperature 0 it is repeatable, alone or batched.
  - Stopped as the rule says; asked the user. No code or config changed. The files judging (228) continues.
- **16:18 N0 files judging finished:** "226 judged, 2 errors". Both errors are the same missing-`}` case (`N0|f-c51173ada8b3|mid|low` and `N0|f-bb317adeb572|mid|low`).
- **16:19 PC A's parser fix pulled** (`git pull --rebase --autostash`, `9566006`). Same issue on PC A (`B0|q-1c2c26e8031c`, 80B law). `call_judge()` now adds the final `}` when the reply is a JSON object missing only that brace, and records `"repaired": "closing brace added"`. Judge config, prompts and hash are unchanged (`aebea71088b8`); replies that parsed before are unchanged.
- **16:19 the 3 missing judgments redone:** law "1 judged, 0 errors"; files "2 judged, 0 errors".
  - The two file judgments carry `repaired` (correctness 3, faithfulness 2).
  - The law one (`q-22327c908c72` mid) came back **with** its closing brace this time, so it was saved normally (correctness 3, faithfulness null, tech 4) with no repair. The reason text differs slightly from the 3 failed tries: a run-to-run variation, as seen on 25 Nov.
- **Note on the judge context:** the script loaded the 80B at 131,072 (log: `n_ctx_slot = 131072`, 15:30:28). At 15:31:30 LM Studio's model process crashed ("Channel Error … terminated"), and LM Studio **restarted it by itself at 262,144** (15:31:38). So nearly all N0 judgments were made at context 262,144, the same as the 30B B0 judging on 25–26 Nov.
  - The requests open during the crash succeeded on `score.py`'s retries (no judge error from it).
  - The context size does not change the prompt, and no prompt was near either limit (0 "Context size has been exceeded" today).
- **16:22 final audit + reports:** law 1,095/1,095 judged and files 228/228, one hash `aebea71088b8`, 0 incomplete, 2 repaired (files). `score.py report` was written for both. Shared caches unchanged. **No compare.**
  - **N0 = Qwen3 30B without RAG, law (n = 1,095):** correctness **2.77** [2.65, 2.90]. Faithfulness: – (no excerpts and no file, so the judge gives none). Technicality fit 4.37. route_ok: – (no router). ctx_hit **0.00** (nothing retrieved). cite recall 0.06. 206 words, 20.2 s.
    - By effort: correctness low 2.66, mid 2.82, high 2.83.
  - **N0, files (n = 228):** correctness **2.72** [2.39, 3.03], faithfulness **2.18** [1.86, 2.51] (to the attached file), technicality fit 4.78, ctx_hit 0.00, cite recall 0.11, 214 words.
    - By effort: correctness low 2.84, mid 2.71, high 2.61.
    - By format: photo bn 1.97 / en 3.06; scan bn 2.74 / en 2.83; text bn 2.39 / en 3.29.
  - `~/n0-30b.sh` had stopped at 16:01 on the law error (as designed); the remaining steps were done by hand with the same commands.
