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
