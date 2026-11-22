# Where to start next (handoff, 22 Nov 2026 → 23 Nov; TWO PCs from now on)

Goal: **benchmark the system before fine-tuning** (thesis baseline), then fine-tune and benchmark again.
- **Two DGX Sparks from 23 Nov:**
  - **PC A** (`~/Desktop/Thesis-RAG`): Gemma 4 E4B answers, the 80B judge, training questions, fine-tuning.
  - **PC B** (folder `Thesis-RAG PC-B`): **Qwen3 30B** answers (before and after fine-tuning); it can also judge Qwen with its own 80B.
  - Setup and daily rules: **`benchmark/SECOND_PC.md`**.
- Session plan and measured speeds: `benchmark/README.md`. Runbooks: `benchmark/before-*.md`, `after-*.md`.
- **PC window:** 09:15–16:30, nothing overnight. Every run resumes: stop with Ctrl+C at 16:15, rerun the same command next day.

## State on 22 Nov evening
| Item | Status |
|---|---|
| Test sets **v1** (`eval/data/test.jsonl` 365 q, `test_files.jsonl` 76 q + 40 files); hashes in `eval/data/README.md` | **Frozen for the baseline** (tag `baseline-v1`) |
| Team recheck (474 + 26 rows, `eval/recheck.html`) | **Postponed. Must be done before fine-tuning** |
| Bangla PDF fix (broken text layer → OCR), prompt fix (no self-introduction) | Done, part of `baseline-v1` |
| Judge: local Qwen3-Next 80B, `eval/config.json` (prompt j1, hash `aebea71088b8`) | Calibrated (`eval/runs/judge-calibration/`) |
| Pilots: Gemma (judged) and Qwen 30B (answers only) | Done, `eval/runs/pilot/` |
| **Gemma B0:** search, extraction, 3,285 law + 684 file answers (0 errors) | **Answers done**; **judging not yet** (~2.9 h incl. the Qwen pilot) |
| Qwen 30B B0 | Not started (PC B) |

## Tomorrow, 23 Nov
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

## Start prompts (paste into Claude Code on each PC, 23 Nov morning)
**PC A:**
> This is PC A (`~/Desktop/Thesis-RAG`). Read `planning/NEXT_STEPS.md` and `benchmark/SECOND_PC.md`, then `git pull`. The PC is free 09:15–16:30, nothing overnight. Only the Qwen3-Next 80B is loaded in LM Studio. Do the PC A plan for today: judge the Qwen pilot and the Gemma B0 answers with `eval/score.py`, make the reports and the pilot comparison, then start `make_questions.py --split train` with the same 80B. Stop and commit only PC A's folders at 16:15. Before long steps, give me a short time estimate.

**PC B:**
> This is PC B (folder `Thesis-RAG PC-B`), a second DGX Spark. Read `planning/NEXT_STEPS.md` and `benchmark/SECOND_PC.md`. Help me set up this PC exactly as described: copy the files from PC A, check the model hashes, install Python/Node, start the retrieval server, and verify that search gives hit@5 0.714 like PC A. Then, with only Qwen3 30B loaded (context 49152, Parallel 4), run the Qwen B0 answers from `benchmark/before-qwen3-30b.md`. The PC is free 09:15–16:30, nothing overnight. At 16:15 stop and commit/push only `eval/runs/B0/qwen3-30b*`. Never edit code, prompts, test sets or the shared caches. Before long steps, give me a short time estimate.

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
