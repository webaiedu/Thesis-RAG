# Where to start next (handoff, 25 Nov 2026 → 26 Nov; TWO PCs)

**Project name:** the thesis project and chatbot are **AinSutro** (formerly Ainkhoj, renamed 25 Nov). The human gold-standard scoring page is the **AinSutro Scoring Page**. **The system-prompt name stays "Ainkhoj" until the whole benchmark (before and after fine-tuning) is finished** (`backend/src/bot.config.ts`, `eval/make_questions.py` unchanged), so every model gets the identical prompt. Never change anything that affects the benchmark.

**Thesis:** *Privacy Driven AI Protection: Safeguarding Sensitive Information in RAG Systems Using Multi-Layer Filtering*. Fine-tuning **and** privacy. Three base models; only the best is fine-tuned, **the team chooses**.

## State on 25 Nov evening
| Item | Status |
|---|---|
| Gemma B0 | Answers + judging done. The one answer longer than the old 8,000-char judge window was re-judged with its full text (scores unchanged). |
| **Qwen3 30B B0 (PC B)** | **Answers complete** (law 3,285 + files 684, 0 cut saved; `18fb054`). **Judging not done yet** (PC B, with its own 80B). |
| **80B B0 (PC A)** | **Law complete 3,285 / 3,285** (0 cut saved; 3 timeouts redone with the new time limit). **Files 273 / 684** (stopped 16:09; resumes exactly). Then judging (~4 h). |
| Judge | Now gets the **full answer** (`score.py`; hash still `aebea71088b8`); a judge reply without a score is retried, never saved. |
| Long answers | LM Studio time limit now grows with the length limit (`llm.service.ts`): max(5 min, 0.12 s × max_tokens). Fixes "aborted due to timeout" on long high-effort answers. |
| **AinSutro Scoring Page** | On **Firebase Hosting** (free; link on PC A only): Google sign-in, no warning; required legal-background acknowledgement; Law/File Answers with language (English default / Bangla / Other) and file-type choice; **Model menu** (80B greyed out until added); My ratings with re-scoring; one rater per answer enforced by the store. Holds **Gemma + Qwen3 30B (7,938 answers)**; audited: 0 differences from the judge's data (`eval/human_app/audit.py`). Team has rated 3 so far. |

## Plan
| When | PC A | PC B |
|---|---|---|
| 26 Nov morning | Resume the 80B file answers (~45 min), then the chain redoes 11 old pilot answers and judges the 80B (~4 h, automatic) | `git pull --rebase` (gets the judge full-answer fix), load the 80B, judge the Qwen 30B (law + files) |
| when the 80B answers are done | `human.py export` + `push --model qwen3-next-80b`, then `human_app/audit.py qwen3-next-80b` (must print TOTAL PROBLEMS: 0) | push the 30B judgments + reports |
| then | `compare --across-models` (Gemma vs 80B, Gemma vs 30B, 30B vs 80B), `human.py pull/status`; Claude scoring only after asking (token estimate) | |
| ~27 Nov | three-model report → **ask the team which model to fine-tune** | |

## Start prompts
**PC A:** the same text as `~/Desktop/"Tomorrows promt.txt"` (on PC A's desktop).

**PC B:**
> This is PC B (`~/Desktop/Thesis-RAG PC-B`, branch `benchmark-setup`; quote the path, use `python -m pip` / `python -m uvicorn`). Read `CLAUDE.md`, `planning/NEXT_STEPS.md`, `planning/THESIS_LOG_PC_B.md` and `benchmark/SECOND_PC.md`, then `git pull --rebase` (it brings PC A's fixes: the judge now sees the full answer; long answers get a longer time limit). The PC is free 09:30–16:30. Free, local tools only.
>
> The Qwen3 30B answers are complete and pushed. Today: unload the 30B, load the Qwen3-Next 80B (`lms load <80B id> -c 131072 --parallel 4 --gpu max`, check its sha256 against `SECOND_PC.md`), start the retrieval server, then judge both runs in the background with a log: `score.py judge runs/B0/qwen3-30b` + `report`, then `runs/B0/qwen3-30b-files` with `--test data/test_files.jsonl` (+ report). Each must end with "0 errors" (run again to retry). Then `score.py compare runs/B0/gemma runs/B0/qwen3-30b --across-models`. Give me time estimates; don't stop at 16:15 by yourself.
>
> The project is now called AinSutro (formerly Ainkhoj); PC A did the rename in shared files. **Don't edit shared files, and never change `backend/src/bot.config.ts` or `eval/make_questions.py`** (the prompt name stays "Ainkhoj" until the benchmark is finished). Don't run `human.py` or touch the AinSutro Scoring Page, `eval/data/human/` or the Drive folder (PC A does that). Log every change or action in `planning/THESIS_LOG_PC_B.md` only. When I say "commit": `git pull --rebase`, then commit/push only `eval/runs/B0/qwen3-30b*` and `planning/THESIS_LOG_PC_B.md`.

---
# History (24 Nov handoff → 25 Nov, kept for reference)

**Thesis:** *Privacy Driven AI Protection: Safeguarding Sensitive Information in RAG Systems Using Multi-Layer Filtering*. We do fine-tuning **and** privacy (`planning/PRIVACY_PLAN.md`). Three base models (Gemma 4 E4B, Qwen3 30B, Qwen3-Next 80B); **only the best is fine-tuned, and the team chooses**.

**Research logs:** each PC writes only its own log, append only, with an entry for every change or action:
- PC A: `planning/THESIS_LOG_PC_A.md`
- PC B: `planning/THESIS_LOG_PC_B.md`

**What changed on 24 Nov (read `benchmark/README.md`, "Cut-off answers"):**
- **baseline-v1.1:** effort caps 1,500 / 3,000 / 6,000.
- **Every model is loaded with context 131,072, Parallel 4.**
- The runner never saves a cut answer: it redoes it longer, or puts it in errors.jsonl.
- `eval/cut_check.py` removes old cut answers (with backups).
- **Human scoring:** the team scores in **AinSutro**, the Google-login web page. It covers Gemma now; the 30B and 80B are added when their runs are complete (`eval/HUMAN_GUIDE.md`, `eval/human.py`). The link and secrets are on PC A only, not in git.
- `score.py compare --across-models` compares two different models.

## State on 24 Nov evening
| Item | Status |
|---|---|
| Gemma B0 | Answers + judging done. **Verified 0 cut answers** (exact token count). |
| 80B pilot | 270/270, 0 errors, ~6.7/min law, ~5.9/min files |
| **80B B0 (PC A)** | **Paused at 1,875 / 3,285 law** (low done, mid 780 / 1,095). 0 errors, 0 cut. Left: mid 315 + high 1,095 + files 684 ≈ **7.5 h**, then judging ≈ **4 h**. 30 old cut answers were removed and redone. |
| **Qwen 30B B0 (PC B)** | 1,568 / 3,285 law pushed (23 Nov). PC B must apply the fix first: stop, pull, reload with 131,072, run `cut_check.py --remove`, continue. |
| AinSutro | Live with Gemma's 3,969 answers (law 3,285 + files 684). The team rates. |

## Plan
| Day | PC A | PC B |
|---|---|---|
| 25 Nov | Resume the 80B B0 (law mid/high, then files) | Apply the cut-off fix, then continue Qwen 30B law + files |
| 25–26 Nov | Judge the 80B B0 (context 131,072) → add the 80B to AinSutro → `compare --across-models` | Judge Qwen 30B B0 with its own 80B → push → PC A adds the 30B to AinSutro |
| ~26–27 Nov | `human.py pull/analyze`, Claude scoring (ask first) → three-model report → **ask the team which model to fine-tune** | |

## Start prompts (paste into Claude Code on each PC)
**PC A:** the same text as `~/Desktop/"Tomorrows promt.txt"` (kept on the desktop of PC A).

**PC B:**
> This is PC B (`~/Desktop/Thesis-RAG PC-B`, branch `benchmark-setup`; quote the path, use `python -m pip` / `python -m uvicorn`). Read `CLAUDE.md`, `planning/NEXT_STEPS.md`, `planning/THESIS_LOG_PC_B.md`, `benchmark/README.md` (section "Cut-off answers"), `benchmark/SECOND_PC.md` and `benchmark/before-qwen3-30b.md`, then `git pull --rebase`. The PC is free 09:30–16:30. Free, local tools only (no paid APIs).
>
> **First, the cut-off fix**, if it isn't done yet; check `planning/THESIS_LOG_PC_B.md`:
> 1. `git log --oneline -5` must show `fdaa982` and `7a3ac94`.
> 2. Load only Qwen3 30B: `lms unload --all && lms load <qwen3-30b id> -c 131072 --parallel 4 --gpu max`. `lms ps` must show context 131072 and Parallel 4.
> 3. Report the "Context size has been exceeded" counts per day from `~/.lmstudio/server-logs/2026-11/*.log`.
> 4. `cd eval && python3 cut_check.py runs/B0/qwen3-30b --remove` (also add `-files` if it exists), and report the numbers.
>
> **Then** start the retrieval server (background, log) and resume the Qwen B0 law run with the same command as before (it redoes the removed answers), then the files. Each run must end with "0 errors"; otherwise run it once more and tell me.
>
> **When law + files are complete:**
> - tell me, then `git pull --rebase` and push `eval/runs/B0/qwen3-30b*` right away, so PC A can add the 30B to AinSutro;
> - then load the 80B (`-c 131072 --parallel 4`; check its sha256 against `SECOND_PC.md`) and judge both runs (`score.py judge` + `report`; the files run with `--test data/test_files.jsonl`), then `score.py compare runs/B0/gemma runs/B0/qwen3-30b --across-models`.
>
> Run everything in the background with a log, give me time estimates, and don't stop at 16:15 by yourself; I'll tell you. Log every change or action in `planning/THESIS_LOG_PC_B.md`, and never edit PC A's log. Don't run `human.py` or touch AinSutro, `eval/data/human/` or the Drive folder (PC A does that). When I say "commit": `git pull --rebase`, then commit/push only `eval/runs/B0/qwen3-30b*` and `planning/THESIS_LOG_PC_B.md`.

---
# History (23 Nov handoff → 24 Nov, kept for reference)
**Thesis scope (decided 23 Nov): fine-tuning AND privacy.** Official title: *Privacy Driven AI Protection: Safeguarding Sensitive Information in RAG Systems Using Multi-Layer Filtering*. The B0 runs are also the "no-filter" utility baseline. Privacy plan: **`planning/PRIVACY_PLAN.md`**.

**Three answer models from 23 Nov (supervisor's request):**
- Gemma 4 E4B (`low`), Qwen3 30B (`mid`) and **Qwen3-Next 80B (`high`)**. The 80B runbook is `benchmark/before-qwen3-next-80b.md`.
- **Only the best one is fine-tuned.** It's chosen after the gold-standard check; **the team decides, so Claude must ask before choosing.**
- **Judge:** the 80B for everything (`eval/config.json`, `j1`, unchanged), so it also rates its own answers.
- **Human scoring (from 24 Nov, replaces the humans' blind 150-question gold set):**
  - The team scores answers continuously, for every model and setting, in a shared Google Sheet web page (Drive folder "Gold Judge"; `eval/HUMAN_GUIDE.md`, `eval/human.py`, `eval/human_app/`).
  - It starts with Gemma; each new model is added with `human.py export --model X` when its run finishes.
  - Nobody scores the same answers twice, except ~5% overlap for κ.
  - Claude scores the same answers (`human.py claude-batch`; **ask before each batch**, ~3k tokens per answer).
  - `human.py analyze` compares humans, Claude and the 80B judge, including self-preference bias.

**PCs:**
- **PC A** (`~/Desktop/Thesis-RAG`): Gemma (done), **80B answers**, the judge, Claude's gold ratings, training questions, fine-tuning.
- **PC B** (`~/Desktop/Thesis-RAG PC-B`): **Qwen3 30B** answers, then judging them with its own 80B (sha256 must match, `benchmark/SECOND_PC.md`).

**Sessions:** 09:30–16:30, nothing overnight. Every run resumes: stop at 16:15 (Ctrl+C or `timeout --signal=INT`) and rerun the same command next session.

## State on 23 Nov evening
| Item | Status |
|---|---|
| Qwen 30B pilot judged (180 + 90) | **Done** |
| Gemma B0 judging (3,285 law + 684 files) + reports | **Done 23 Nov, 0 errors.** Overall correctness 3.94 [3.79, 4.08], faithfulness 4.52, route_ok 0.96, ctx_hit 0.70 (`eval/runs/B0/gemma*/summary.md`) |
| Pilot comparison Gemma vs Qwen 30B | **Not made:** `score.py compare` pairs answers by model tier too, so two *different* models never match ("no common pairs"). Needs a small fix to `compare` (pair by question + effort + technicality). This is analysis code only, with no effect on answers or judge scores. **Ask the user before changing it** |
| Qwen 30B B0 answers (PC B) | **Started 23 Nov afternoon**, after PC B setup (torch cu130, system upgrade and reboot); ~9 h in total |
| 80B B0 answers | Not started (PC A from 24 Nov) |
| Training questions (`train.jsonl`) | Not started; moved after the 80B answers (needed only for the chosen model) |
| Docs | torch/torchvision fix in `SECOND_PC.md` + `requirements.txt`; 80B hash in `SECOND_PC.md`; 80B runbook; `PRIVACY_PLAN.md` |
| Gold-standard tooling (`eval/gold.py`, `gold.html`, `GOLD_GUIDE.md`) | **Done**, tested on mock data (Gemma's answers as all 3 models, the judge's scores as "human" ratings → κ 1.00, self-bias 0.00; random ratings → ρ ≈ 0; no model names in the blind sample). `gold.py sample` runs once all three B0 runs exist |

## Plan
| Day | PC A | PC B |
|---|---|---|
| 24 Nov | **80B pilot** (~30 min) → **80B B0 law answers** (Gemma judging is already done) | Qwen 30B B0 law continues |
| 25 Nov | 80B law + files finish → judge 80B B0 | Qwen 30B law + files finish → **check the 80B hash** → judge Qwen 30B B0 |
| 26 Nov | judging finishes; `gold.py sample`; Claude rates the gold set (ask first: ~1M tokens) | judging finishes; push |
| 26–27 Nov | team: gold ratings (~4–5 h each) + test-set recheck (~1.5–2 h each) | free: training questions or privacy data prep |
| 27 Nov | `gold.py analyze` → 3-model report → **ask the team which model to fine-tune** | |

**PC A, 24 Nov morning:** Gemma judging is done. Reload the 80B as the **answer model** (context 131072, Parallel 4), start the retrieval server, then follow `benchmark/before-qwen3-next-80b.md`: the pilot first, then B0 law.

## Start prompts (paste into Claude Code on each PC)
**PC A:**
> This is PC A (`~/Desktop/Thesis-RAG`). Read `CLAUDE.md`, `planning/NEXT_STEPS.md`, `benchmark/SECOND_PC.md` and `benchmark/before-qwen3-next-80b.md`, then `git pull`. The PC is free 09:30–16:30, nothing overnight. Only the Qwen3-Next 80B is loaded in LM Studio; check with `lms ps`.
>
> **Today:**
> 1. Gemma B0 judging is done (23 Nov). The Gemma-vs-Qwen pilot comparison failed because `score.py compare` pairs by model tier; propose the fix and ask me before changing it.
> 2. Benchmark the **80B as an answer model** (supervisor's request): the pilot first, then B0 law, from `before-qwen3-next-80b.md`. Load the 80B with context 49152, Parallel 4; never judge and answer at the same time.
>
> Run everything in the background with a log, so I can ask "how much is done?". Give me a time estimate before each long step. Make runs stop by themselves at 16:15.
>
> **Thesis:** *"Privacy Driven AI Protection: Safeguarding Sensitive Information in RAG Systems Using Multi-Layer Filtering"*. We do fine-tuning **and** privacy (`planning/PRIVACY_PLAN.md`). We benchmark three models (Gemma, Qwen 30B, Qwen 80B) and fine-tune **only the best**. Don't choose it yourself; ask us after the gold-standard check. The 80B judges everything; the gold standard (humans + Claude on a blind sample, `eval/gold.py`, `eval/GOLD_GUIDE.md`) checks it and measures self-preference bias. It's ready; `gold.py sample` runs once all three B0 runs exist (~26 Nov). Before Claude rates the gold set, ask me (~1M tokens).
>
> Don't change code, prompts, test sets or the judge config (`baseline-v1`). At 16:15: `git pull --rebase`, then commit/push only PC A's files (`eval/runs/pilot/qwen3-next-80b*`, `eval/runs/B0/qwen3-next-80b*`, docs). PC B pushes `eval/runs/B0/qwen3-30b*`.

**PC B:**
> This is PC B, a second DGX Spark. The project is in `~/Desktop/Thesis-RAG PC-B` (branch `benchmark-setup`); the path has a space, so quote it and use `python -m pip` / `python -m uvicorn`. Read `CLAUDE.md`, `planning/NEXT_STEPS.md`, `benchmark/SECOND_PC.md` and `benchmark/before-qwen3-30b.md`, then `git pull`. The PC is free 09:30–16:30, nothing overnight.
>
> **Setup is finished** (torch 2.14.1+cu130 with CUDA True, chroma_db and .env copied, Node + npm done). The **Qwen3 30B B0** answers started on 23 Nov.
>
> **Today:**
> 1. Load **only Qwen3 30B** (context 131072, Parallel 4, Flash Attention ON, GPU offload MAX); check with `lms ps`.
> 2. Start the retrieval server (`python -m uvicorn server:app --port 8000` in `retrieval`, background, log).
> 3. **Resume** the Qwen B0 law run with the same command (`before-qwen3-30b.md` section 2, `--out ../eval/runs/B0/qwen3-30b`). It skips finished answers. Then run the files.
>
> **Deviations from the runbook:** don't load Gemma (`route-cache.jsonl` and `file-cache.jsonl` cover everything; stop if the runner reports a cache miss or router call), and stay on `benchmark-setup`.
>
> Run it in the background with a log, so I can ask "how much is done?". Give me a time estimate. Make it stop by itself at 16:15.
>
> **When Qwen B0 answers are complete** (3,285 + 684, 0 errors): unload Qwen and load the **Qwen3-Next 80B**. **Check its sha256 against `SECOND_PC.md` first; if it differs, stop and tell me.** Then judge with context 32768, Parallel 4: `score.py judge` + `report` for `runs/B0/qwen3-30b` and `-files`, as in `before-qwen3-30b.md` section 3.
>
> **Thesis:** privacy-preserving RAG with multi-layer filtering, plus fine-tuning; three models are compared and only the best is fine-tuned. This Qwen B0 run is the "no-filter, before fine-tuning" baseline.
>
> Never edit code, prompts, test sets, docs or the shared caches. At 16:15: `git pull --rebase`, then commit/push **only** `eval/runs/B0/qwen3-30b*`.

---
# History (22 Nov handoff → 23 Nov, kept for reference)

### State on 22 Nov evening
| Item | Status |
|---|---|
| Test sets **v1** (`eval/data/test.jsonl` 365 q, `test_files.jsonl` 76 q + 40 files); hashes in `eval/data/README.md` | **Frozen for the baseline** (tag `baseline-v1`) |
| Team recheck (474 + 26 rows, `eval/recheck.html`) | **Postponed. Must be done before fine-tuning** |
| Bangla PDF fix (broken text layer → OCR), prompt fix (no self-introduction) | Done, part of `baseline-v1` |
| Judge: local Qwen3-Next 80B, `eval/config.json` (prompt j1, hash `aebea71088b8`) | Calibrated (`eval/runs/judge-calibration/`) |
| Pilots: Gemma (judged) and Qwen 30B (answers only) | Done, `eval/runs/pilot/` |
| **Gemma B0:** search, extraction, 3,285 law + 684 file answers (0 errors) | **Answers done**; **judging not yet** (~2.9 h incl. the Qwen pilot) |
| Qwen 30B B0 | Not started (PC B) |

### Tomorrow, 23 Nov
**PC A** (this PC). Load **only the 80B** (context ≥ 32768, Parallel 4).
```bash
cd ~/Desktop/Thesis-RAG && git pull
cd eval
python3 score.py judge runs/pilot/qwen3-30b --test data/pilot.jsonl
python3 score.py judge runs/pilot/qwen3-30b-files --test data/pilot_files.jsonl
python3 score.py judge runs/B0/gemma && python3 score.py judge runs/B0/gemma-files --test data/test_files.jsonl
python3 score.py report runs/B0/gemma && python3 score.py report runs/B0/gemma-files --test data/test_files.jsonl
python3 score.py report runs/pilot/qwen3-30b --test data/pilot.jsonl
python3 score.py compare runs/pilot/gemma runs/pilot/qwen3-30b --test data/pilot.jsonl
```
Then, with the same 80B, start the training questions (resumable):
```bash
python3 make_questions.py --split train --per-domain 600 --out data/train.jsonl
```
At 16:15, commit and push `eval/runs/B0/gemma*`, `eval/runs/pilot/qwen3-30b*`, `eval/data/train.jsonl`.

**PC B.** Follow `benchmark/SECOND_PC.md`: setup → verify the search (hit@5 0.714) → **Qwen B0 answers** (`benchmark/before-qwen3-30b.md`, ~9.3 h, so 2 days). At 16:15, commit and push `eval/runs/B0/qwen3-30b*` only.

### Start prompts (paste into Claude Code on each PC, 23 Nov morning)
**PC A:**
> This is PC A (`~/Desktop/Thesis-RAG`). Read `planning/NEXT_STEPS.md` and `benchmark/SECOND_PC.md`, then `git pull`. The PC is free 09:15–16:30, nothing overnight. Only the Qwen3-Next 80B is loaded in LM Studio. Do the PC A plan for today: judge the Qwen pilot and the Gemma B0 answers with `eval/score.py`, make the reports and the pilot comparison, then start `make_questions.py --split train` with the same 80B. Stop and commit only PC A's folders at 16:15. Before long steps, give me a short time estimate.

**PC B:**
> This is PC B, a second DGX Spark. The project is cloned in the folder `Thesis-RAG PC-B` (branch `benchmark-setup`); the path has a space, so quote it. Read `CLAUDE.md`, `planning/NEXT_STEPS.md` and `benchmark/SECOND_PC.md`. Guide me through the PC B setup exactly as written there:
> 1. Copy `retrieval/chroma_db` and the two `.env` files from PC A, by USB or by `rsync`/`scp` from 172.16.60.57.
> 2. Check the model hashes. Gemma and the 80B are already in LM Studio here; the Qwen3 30B download may still be needed.
> 3. Install the Python 3.12 venv with CUDA torch (use `python -m pip`) and Node 22, then `npm install`.
> 4. Start the retrieval server and verify that search gives hit@5 0.714 and hit@10 0.802 like PC A.
>
> Then, with only Qwen3 30B loaded (context 49152, Parallel 4), run the Qwen B0 answers from `benchmark/before-qwen3-30b.md`. The PC is free 09:15–16:30, nothing overnight. At 16:15 stop with Ctrl+C and commit/push only `eval/runs/B0/qwen3-30b*`. Never edit code, prompts, test sets or the shared caches. Before long steps, give me a short time estimate.

**25 Nov (planned):** judge Qwen B0 (on PC B with its own 80B, or on PC A), reports, the Gemma-vs-Qwen comparison. Then the team recheck, the B0 clean-up for changed questions, and **then** fine-tuning.

---
# History (19 Nov handoff, kept for reference)

## What was done today
| Item | Status |
|---|---|
| Child Marriage Restraint Act 2017 moved from `uncategorized` to `children_women` (+ router description) | **Done**, re-ingested, verified in search |
| Benchmark runbooks `benchmark/` (before/after × Gemma/Qwen3 30B, 27-setting grid) | **Done** |
| Test-set generator `eval/make_questions.py` (80/10/10 split by section/case, no leakage) | **Done**, trial checked |
| Test + val candidates | **Done**: 532 test candidates, 544 val, half Bangla/half English, all 9 domains; leakage check OK; review sheet exported |
| Review tool `eval/review.py` + team guide `eval/REVIEW_GUIDE.md` | **Done**, tested; recheck/team_decision added 22 Nov |
| Test-set first-pass review (Claude) + 60 hand-written questions | **Done 22 Nov**; team recheck pending (see step 2) |
| Benchmark runner `backend/src/eval/run-eval.ts` (`npm run eval`) | **Done**, smoke-tested with the 80B (routing cache, resume, run config) |
| `ChatService.reply()` accepts a cached router decision; `EVAL_TEMPERATURE` in `LlmService` | **Done**, type-checked; no effect on the normal app |
| Search benchmark `eval/eval_retrieval.py` (Hit/Recall@k, MRR, nDCG; oracle vs all domains; exact chunk vs same section/case) | **Done**, tested on the trial questions |
| `eval/score.py` (answer metrics + LLM judge) | **Not started** |
| Nothing committed yet | see "Commit" below |

## Start here tomorrow

### 1. Check the generated questions (5 min, already verified on 19 Nov: 532 test / 544 val, no leakage)
```bash
cd eval
wc -l data/test_candidates.jsonl data/val.jsonl          # 532 and 544
python3 make_questions.py --check data/test_candidates.jsonl data/val.jsonl   # must say "OK: no leakage"
ls data/review/                                          # test_review.csv + handwritten.csv
```
If a file is missing or short, the generation was interrupted. Load the 80B (context **32768**, Parallel 4) and run the same command again; it resumes:
```bash
python3 make_questions.py --split test --per-domain 34 --out data/test_candidates.jsonl
python3 make_questions.py --split val  --per-domain 34 --out data/val.jsonl
python3 review.py export data/test_candidates.jsonl data/review/test_review.csv
```

### 2. Test-set review: Claude's first pass DONE (22 Nov). Team recheck POSTPONED (must be done before fine-tuning; also `file_questions.csv`, 26 rows)
**Done by Claude (22 Nov):**
- **Review tool:** `review.py` gained `recheck`/`team_decision` columns, an `add-cols` command, `mark-recheck --handwritten … --keep-frac 0.2 --seed 42`, and an `import` that prefers `team_decision` and prints the Claude–team agreement rate.
- **First pass:** all 532 rows reviewed: 148 keep, 157 fix, 227 drop, which leaves 305 questions (151 bn / 154 en, 30–37 per domain). Every fix/drop has a reason in `notes`.
- **Hand-written:** 60 rows in `handwritten.csv` (types and counts as in REVIEW_GUIDE.md).
- **Recheck marking:** `recheck = yes` on 474 rows (all 157 fixes, all 227 drops, 30 random keeps, all 60 hand-written rows).
- **Provisional build:** `test.jsonl` (365 questions) was built by `import` with no problems reported. It is **provisional** until the recheck is done.
- **Details:** problem types and counts are in `eval/data/README.md` → "Hand-check".

**Team to do (~4.5–5.5 person-hours in total, so ~1.5–2 h each for 3 people):**
1. Open `eval/data/review/test_review.csv` and `handwritten.csv` (LibreOffice, UTF-8) and filter on `recheck = yes`. Split the rows by domain between the team members.
2. Fill in `team_decision` on every one of those rows (rules in `eval/REVIEW_GUIDE.md` → "Rechecking the first pass"):
   - `agree` if Claude was right;
   - otherwise `keep`/`fix`/`drop`, with your text in `question_fixed`/`answer_fixed` and a reason in `notes`.

   Rough time per row: drops ~20 s, fixes ~1 min (compare with `source_text`), keeps ~40 s, hand-written ~1 min.
3. Save as CSV UTF-8, then:
   ```bash
   cd eval && python3 review.py import data/review/test_review.csv --handwritten data/review/handwritten.csv
   ```
   It must end without "Fix these first". It prints the agreement rate and writes `data/test.jsonl` + `data/test.stats.txt`.
4. Fill in the reviewers, dates, agreement rate and final sha256 in `eval/data/README.md`. Commit the two CSVs, `test.jsonl` and `test.stats.txt`. Don't edit `test.jsonl` after that.

**Thesis wording:** "generated by an LLM, first-pass reviewed by an LLM, verified by the authors (agreement X%)".

**Note:** 32 of the 44 hand-written law questions have gold sections in the *train* split (common sections such as theft and maternity leave). Report the hand-written set separately when comparing before/after fine-tuning.

### 3. Benchmark tooling: DONE 22 Nov (Claude)
- **Judge and scoring:** `eval/score.py` (`judge` / `report` / `compare`). The judge is the **local Qwen3-Next 80B**, fixed in `eval/config.json`. Tested end to end against a mock judge; not yet against the real 80B (LM Studio wasn't running).
- **Recheck page:** `eval/recheck.html` (offline) plus `review.py merge-team`.
- **File-upload benchmark:**
  - 40 generated files in `eval/data/files/`: 12 documents × text/scan/photo, plus 4 non-law files.
  - 76 questions in `data/review/file_questions.csv`, built into `data/test_files.jsonl`.
  - `eval_extraction.py` measures OCR accuracy (CER). The runner's `--files` option caches the extraction.
- **Prompt fix:** the bot no longer introduces itself unless asked (`bot.config.ts`).
- **Runbooks:** `benchmark/*.md` were rewritten for **one 6-hour session per day (09:15–16:30), nothing overnight**. See the session plan in `benchmark/README.md`: about 14 working days, or ~10 with a second PC for the judge.

### 4. Pilot and baseline prep: DONE 22 Nov
- **Gemma pilot** (20 law + 10 file questions × 9 settings, judged by the 80B), in `eval/runs/pilot/`.
  - **Measured speeds:** Gemma ~19 answers/min; the 80B judge ~25/min. The Gemma baseline is about one session.
  - **Weak spots:** follow-ups, colloquial questions, Bangla photos, and Bangla questions about English Acts. The last one is a cross-language search gap: the gift-deed question never found Registration Act s.23.
- **Prompt fix:** no unprompted self-introduction (0 of 270 answers).
- **Bangla PDF fix** in `retrieval/files.py`:
  - Pages with broken glyphs, split vowel signs or old Bijoy/SutonnyMJ fonts are now read by OCR.
  - Bangla text-PDF CER fell from 0.23 to 0.04. English is unchanged. On 479 real Supreme Court Bulletin pages, 8 pages were flagged and all were really unreadable; clean LibreOffice Bangla PDFs are not flagged.
- **The team recheck is postponed** (decided 22 Nov). The baseline uses the v1 test sets; hashes are in `eval/data/README.md`.
  - **The recheck must be done before fine-tuning starts.**
  - After it, dropped questions are filtered out of B0, and changed questions are re-run in B0.

### 5. Next steps
1. **Qwen3 30B pilot** (load Qwen: context 49152, Parallel 4). Then fill in its speeds in `benchmark/README.md`.
2. **`git tag baseline-v1`** (done on 22 Nov if the tag exists: `git tag -l`).
3. **Session 1, Gemma B0:**
   - Load Gemma only: unload the 80B and Qwen, so the speed numbers stay clean.
   - Follow `benchmark/before-gemma.md`: search benchmark, extraction benchmark, law answers (~2.9 h), file answers (~40 min).
   - Then load the 80B and judge (~2.7 h).
4. **Session 2: Qwen 30B B0** (`benchmark/before-qwen3-30b.md`).
5. **Team recheck**, then the B0 clean-up, then fine-tuning, then the "after" sessions.

### 6. Optional: training questions (~6 h, needed only before fine-tuning)
```bash
cd eval && python3 make_questions.py --split train --per-domain 600 --out data/train.jsonl
```
80B loaded at context 32768, Parallel 4. It's resumable, so split it over sessions: stop with Ctrl+C at 16:15 and rerun next session.

## Things to remember
- **LM Studio context × Parallel:** the context is split across the parallel slots.
  - The generator needs ≥ 32768 on the 80B. With 8192, every parallel request failed with "Context size has been exceeded".
  - On benchmark days, load the answer models with **49152** (see `benchmark/README.md`).
- **Runner:** `cd backend && EVAL_TEMPERATURE=0 npm run eval -- --variant … --models … --efforts … --tech … --test … --out …`. The full option list is at the top of `backend/src/eval/run-eval.ts`.
  - It compiles to `backend/dist-eval/` (gitignored), so it doesn't clash with `npm run start:dev`.
  - Router decisions are cached in `eval/runs/route-cache.jsonl`, shared by all runs.
- **The trial runs found real baseline problems:**
  - English questions about Bangla-language laws are retrieved less often than Bangla ones (trial: Hit@5 0.71 vs 0.82). A cross-language gap; fine-tuning bge-m3 should help. Only 34 unchecked questions, so treat this as a hint, not a result;
  - context-less questions get routed to "general" and answered from outside knowledge (a hallucination);
  - the 80B router takes 7–15 s per question, Gemma ~1 s.

## Commit (19 Nov note, done since then)
New or changed files:
- **Data:** `backend/data/{children_women,uncategorized}.jsonl`, `backend/data/domains.json`
- **Benchmark plans:** `benchmark/`
- **Eval tooling and data:** `eval/` (scripts, guide, `data/`)
- **Runner:** `backend/src/eval/run-eval.ts`
- **Backend changes:** `backend/src/chat/{chat,llm}.service.ts`, `backend/package.json`, `backend/.gitignore`, `.gitignore`
- **This file:** `planning/NEXT_STEPS.md`

Ask Claude to commit when you're happy with it.

## Still open from 18 Nov
- [ ] **Browser tests:**
  - law question with typos (Auto);
  - Bangla question;
  - `/children_women minimum age of marriage for girls` (should now cite the Child Marriage Restraint Act 2017);
  - case law ("Case" badge + PDF link);
  - image/PDF/.docx upload + follow-up;
  - effort/technicality;
  - usage bar + 429;
  - retrieval down.

  Pick the model the loaded LM Studio model matches ("low" = Gemma). The agent can't do these, because minting a login token was blocked.
- [ ] Delete the Firebase test user `ainkhoj-e2e-test` (Authentication + Firestore `users/ainkhoj-e2e-test`).
- [ ] HawkScan: install `hawk` and create the API key (steps in git history of this file, or ask Claude).
- [ ] Supreme Court individual judgments: save the AD/HCD list pages from a browser into `prepareDataset/`, then `fetch_cases.py --no-scob --listing …`.
- [ ] LM Studio: set Qwen3-30B's saved default context to something below 262144 (it reverts to max on reload).

## Starting the services
```bash
# LM Studio: load what the task needs (lms ps to check)
cd retrieval && source .venv/bin/activate && python -m uvicorn server:app --port 8000
cd backend  && npm run start:dev      # only for the web app; the benchmark runner doesn't need it
cd frontend && npm run dev            # http://localhost:3000
```
(Node: `export PATH="$HOME/.local/node-v22.20.0-linux-arm64/bin:$PATH"`)
