# Thesis research log: PC A

PC B keeps its own log, `planning/THESIS_LOG_PC_B.md`. Each PC writes only its own file.

A running record of what we did, why, and what we found, written for the thesis (Methods, Results, Threats to validity). **Append only:** new entries go at the top of "Timeline"; never rewrite old entries. Correct them with a dated note instead. Every number points to the file it comes from.

- **Thesis:** *Privacy Driven AI Protection: Safeguarding Sensitive Information in RAG Systems Using Multi-Layer Filtering* (decided 23 Nov 2026).
- **System:** Ainkhoj, a RAG chatbot for Bangladesh law (Bangla + English).
- **Human-scoring tool:** AinSutro.
- **Last updated:** 24 Nov 2026, 16:29 (PC A).

---

## 1. Thesis at a glance
- **Question:** how well does a local RAG legal assistant answer Bangladesh-law questions (Bangla and English, text and uploaded documents), and how do fine-tuning and a multi-layer privacy filter change its accuracy and its leakage of sensitive data?
- **System under test:** Ainkhoj. Retrieval with bge-m3 over 9 law domains in ChromaDB; an LLM router; an answer LLM run locally in LM Studio. See `CLAUDE.md`.
- **Models compared (base, before fine-tuning):** Gemma 4 E4B, Qwen3 30B (A3B), Qwen3-Next 80B (A3B). All are Q4_K_M, local, temperature 0. **Only the best is fine-tuned; the team decides.**
- **Automatic judge:** Qwen3-Next 80B with a fixed rubric `j1` (`eval/config.json`, hash `aebea71088b8`). It is also one of the answer models, so it may favour its own answers. This is checked against human and Claude ratings.
- **Privacy part:** canary-based leakage tests and filter layers; see `planning/PRIVACY_PLAN.md`.
- **Hardware:** two NVIDIA DGX Spark (128 GB unified memory). PC A: Gemma, the 80B, the judge, human-scoring tooling. PC B: Qwen3 30B.
- **Cost:** everything is free and local (LM Studio, open models, Google Apps Script/Sheets). No paid APIs.

---

## 2. Timeline (newest first)

### 24 Nov 2026, 16:29 (PC A): stopped for the day
- **80B B0 law stopped** (Ctrl+C, resumes exactly): **1,875 / 3,285** answers (low 1,095 done, mid 780 / 1,095), **0 errors, 0 cut answers saved, 0 redos needed** since the fix. The 30 removed cut answers were all redone complete.
- **Still to do:** law mid 315, law high 1,095, files 684 (~7.5 h), then judging the 80B (~4 h).
- Retrieval server stopped. LM Studio keeps the 80B loaded (context 131,072, Parallel 4).
- Pushed to GitHub: the 80B B0 partial answers (with backups `answers.before-cap-fix.jsonl`, `cut-removed.jsonl`), this log, `NEXT_STEPS.md`, `CLAUDE.md`.

### 24 Nov 2026, 16:20 (PC A): log renamed, logging rule
- `planning/THESIS_LOG.md` renamed to **`THESIS_LOG_PC_A.md`**. PC B keeps **`THESIS_LOG_PC_B.md`**. Each PC writes only its own log, so git never conflicts.
- **Rule from now on:** every change or action on PC A for the project gets a dated entry here: code or doc changes, runs started/stopped/finished, results, decisions, problems, commits. `CLAUDE.md` says the same for both PCs.

### 24 Nov 2026 (PC A)
- **Human scoring tool AinSutro built and live.**
  - **What:** a shared web page where the team (and other volunteers) rate answers with the same rubric as the 80B judge.
  - **How it works:** Google sign-in identifies raters. There are two sections, Law and File. Each question × model (its 9 answers) goes to **one** rater only, except 5% overlap rated twice for inter-rater κ. Raters get the Bangla/English machine translation of the question and reference, read-aloud (browser voices) and a short bilingual guide.
  - **Storage:** ratings go to a private Google Sheet; the repo stores anonymous rater ids only.
  - **Why:** humans validate the automatic judge and measure its self-preference bias. Scoring continuously, model by model, saves time compared with waiting for all runs.
  - **Files:** `eval/HUMAN_GUIDE.md`, `eval/human.py`, `eval/human_app/`.
- **Rules kept identical to the judge** (so human and judge scores are comparable):
  - the same 6,000-character excerpts (checked character by character against `score.py`);
  - the same 1–5 scales;
  - faithfulness is n/a only when no excerpts were given;
  - technicality fit is n/a for `auto`.
  - Each rating carries `rubric = j1`.
- **Decision:** Claude scores **the same answers** humans score, plus the same question × setting for the other models (not all ~12k answers), at ~3k tokens per answer, asking the team before each batch.
- **Decision:** the humans' fixed blind 150-question gold set (`eval/gold.py`) is replaced by this continuous scoring.
- **Qwen3-Next 80B pilot:** 270/270 answers, 0 errors. ~6.7 answers/min (law), ~5.9 (files), ~36 s / ~41 s per answer. Source: `benchmark/README.md`.
- **Analysis fix:** `score.py compare` could not compare two *different* models, because it paired answers by model tier. Added `--across-models`, which pairs by question + effort + technicality.
- **Pilot comparison, Qwen 30B minus Gemma** (`eval/runs/pilot/qwen3-30b*/compare-vs-pilot-gemma*.md`):
  - law correctness +0.10 [−0.21, 0.42], no clear difference;
  - faithfulness −0.29 (law) and **−0.83 [−1.44, −0.29] (files)**;
  - Qwen ~2.7× slower per answer.
- **Problem found: answers silently cut off** (reported by PC B, investigated on PC A). Details are in section 5.3. **Fixed the same day (baseline-v1.1).**
  - Effort length caps raised.
  - Context raised to 131,072.
  - The runner records why every answer stopped and never saves a cut answer: it redoes it with a longer limit, or reports an error.
  - 30 cut 80B answers were removed and redone.
  - Gemma was verified clean (0 of 3,969, exact token count).
- **Now running:** 80B B0 answers (section 3).

### 23 Nov 2026
- **Thesis scope fixed:** the official title is about multi-layer privacy filtering. The team does both fine-tuning and privacy (`planning/PRIVACY_PLAN.md`).
- **Supervisor request:** add the Qwen3-Next 80B as a third answer model.
- **Second DGX Spark (PC B)** set up for the Qwen 30B. Model files are checked by sha256 (`benchmark/SECOND_PC.md`).
- **Gemma B0 judged:** 3,285 law + 684 file answers, 0 errors. Results in section 4.
- **Qwen 30B B0 answers** on PC B: 1,568 / 3,285 law answers by the evening, 0 runner errors.

### 22 Nov 2026
- **Test sets v1 frozen** (git tag `baseline-v1`):
  - 365 law questions (`eval/data/test.jsonl`);
  - 76 file questions on 40 generated documents (`eval/data/test_files.jsonl`);
  - the team recheck postponed (it must happen before fine-tuning).
- **Test-set review, first pass by an LLM** (Claude):
  - 532 generated candidates reviewed: 148 kept, 157 fixed, 227 dropped, leaving 305;
  - plus 60 hand-written questions (typo, colloquial, follow-up, multi-section, general, out-of-scope, case law);
  - details in `eval/data/README.md`.
- **Judge sanity check:** 14 answers of known quality; the judge's scores matched (section 4.4).
- **Benchmark tooling:** `eval/score.py` (judge, metrics, bootstrap CIs, paired compare), the file-upload benchmark, the OCR (CER) benchmark, and the runner (`backend/src/eval/run-eval.ts`) with router and file caches.
- **Bangla PDF fix:** pages with a broken Bangla text layer (old non-Unicode fonts, split vowel signs) are now OCR'd. Bangla text-PDF CER fell from 0.23 to 0.04.
- **Gemma pilot** and **Qwen 30B pilot** (20 law + 10 file questions × 9 settings each). **Gemma B0 answers** made.
- **Search and OCR baselines** measured (section 4.1).

### 19 Nov 2026
- **Benchmark design:**
  - test-set generator: questions written by the 80B from law chunks, 1 Bangla + 1 English per chunk;
  - train/val/test split by statute section or case with no leakage (`sha256(group) mod 100`: 80/10/10);
  - review tool, runner and runbooks;
  - grid of 3 effort × 3 technicality settings.

### 17–18 Nov 2026
- **Ainkhoj** first version.
- Case law added: Supreme Court Online Bulletin vols 1–20, with OCR for old Bangla fonts.
- Typo correction in the router, faster file handling.

---

## 3. Now (24 Nov 2026, 16:29, end of day)
| Item | State |
|---|---|
| **PC A: 80B B0 answers** | **Paused for the night at 1,875 / 3,285 law** (low done, mid 780 / 1,095), 0 errors, 0 cut. Left: mid 315 + high 1,095 + files 684 (~7.5 h), then judging (~4 h). Fixed runner (context 131,072, caps 1,500 / 3,000 / 6,000, auto-redo of cut answers). |
| **PC B: Qwen 30B B0 answers** | 1,568 / 3,285 law answers pushed. PC B has been told to stop, pull the fix, reload with context 131,072, remove its cut answers (`eval/cut_check.py --remove`) and continue. |
| **Gemma B0** | Done and judged; verified free of cut answers. |
| **AinSutro** | Live with the Gemma answers (3,969; law 3,285 + file 684). Ratings start now. |
| **Docs** | Runbooks updated (context 131,072 everywhere). `CLAUDE.md` notes baseline-v1.1. |

---

## 4. Results so far (numbers for the Results chapter)

### 4.1 Retrieval and file extraction (baseline; `eval/runs/B0/retrieval.json`, `extraction.json`)
| Search over 349 law questions with a gold chunk | group hit@5 | chunk hit@5 | chunk MRR@10 |
|---|---|---|---|
| all domains searched | 0.714 | 0.673 | 0.554 |
| oracle (only the right domain) | 0.797 | 0.759 | 0.625 |

| File text extraction (CER, lower is better) | Bangla | English |
|---|---|---|
| text documents | 0.040 | 0.010 |
| scans | 0.056 | 0.057 |
| phone photos | 0.149 | 0.144 |

### 4.2 Gemma 4 E4B, B0 (judged by the 80B; `eval/runs/B0/gemma*/summary.md`)
| | Law (3,285) | Files (684) |
|---|---|---|
| Correctness (1–5) | **3.94** [3.79, 4.08] | **3.15** [2.80, 3.51] |
| Faithfulness (1–5) | 4.52 [4.43, 4.60] | 4.13 [3.90, 4.35] |
| Technicality fit | 4.89 | 4.76 |
| Routed to the right domain | 0.96 | 1.00 |
| Right source retrieved (group) | 0.70 | 0.46 |
| Mean answer time | 9.2 s | 12.3 s |

**Reading:** law answers are good. File questions are the weak spot, mainly because retrieval finds the right law for a document question only 46% of the time.

### 4.3 Speeds (pilots; `benchmark/README.md`)
| Model | Law answers/min | File answers/min |
|---|---|---|
| Gemma 4 E4B | ~19 | ~17 |
| Qwen3 30B | ~7.3 | ~6.3 |
| Qwen3-Next 80B | ~6.7 | ~5.9 |

### 4.4 Judge sanity check (`eval/runs/judge-calibration/README.md`)
- Reference answer: correctness 5 / faithfulness 5 (4 of 4).
- Reference with facts flipped: 1 (3 of 4; one 3 because only the section number was wrong).
- "Sorry, I could not find this.": 1.
- Polite decline on an out-of-scope question: 5.
- No parse errors.

### 4.5 Pending
- Qwen 30B B0 and 80B B0 judged results.
- The three-model comparison.
- Human and Claude agreement with the judge, and the 80B's self-preference bias (`human.py analyze`).
- Fine-tuned ("after") runs, privacy runs.

---

## 5. Problems found and how we fixed them (threats to validity)

### 5.1 Broken Bangla text in PDFs (22 Nov)
Some PDFs have a Bangla text layer that is unreadable (old Bijoy/SutonnyMJ fonts, split vowel signs). Such pages are now detected and OCR'd. Bangla text-PDF CER fell from 0.23 to 0.04; English was unchanged.

### 5.2 Comparing different models (24 Nov)
`score.py compare` paired answers by model tier, so it could not compare two different models. We added `--across-models`, which pairs by question + effort + technicality. Same-model before/after comparisons are unchanged.

### 5.3 Silently cut-off answers (24 Nov): baseline-v1 → v1.1
- **What happened:** some answers stopped mid-sentence, but the runner saved them as complete. No error appeared in `errors.jsonl`.
- **Cause 1, context overflow:** models were loaded with context 49,152 and 4 parallel requests, which share the context. Long high-effort answers ran out of room, and LM Studio logged "Context size has been exceeded". This was seen on PC B with Qwen 30B; on PC A the detailed LM Studio logs show none for Gemma or the 80B.
- **Cause 2, effort length caps:** the caps were low 700 / mid 1,500 / high 3,000 tokens.
  - Qwen's tokenizer needs about **one token per Bangla character**, so Qwen's Bangla answers hit the cap and stopped mid-word.
  - Gemma's tokenizer is far more efficient for Bangla, so Gemma was not affected.
- **How many answers were affected:**

  | Model | Affected | How measured |
  |---|---|---|
  | Gemma | **0** of 3,969 | exact count with Gemma's tokenizer |
  | Qwen3-Next 80B | **29** of 1,456 at the cap, plus 1 harmless false positive | exact count |
  | Qwen 30B | ~**100** of the first 1,568, almost all Bangla, low/mid effort | heuristic; the exact count runs on PC B |

- **Fix (approved by the team):**
  1. **Caps raised** to low 1,500 / mid 3,000 / high 6,000 tokens. The effort instruction in the prompt still sets the intended length.
  2. **Every model is loaded with context 131,072.** The runner refuses to start with less.
  3. **The runner records `finishReason` for every answer and never saves a cut answer.** It redoes it at once with 2×, then 4× the limit (max 16,000 tokens). If the answer is still cut, it goes to `errors.jsonl` instead. Every redo is logged in `cut.jsonl`. This was tested with a forced 40-token limit.
  4. **Old cut answers** were found with `eval/cut_check.py` (exact token count + "ends mid-sentence" check) and removed with backups (`answers.before-cap-fix.jsonl`), then redone by the normal run.
- **Why redoing only the cut answers is valid:** at temperature 0, a higher cap changes only the answers that reached the old cap. Every other answer would come out the same, so "redo the cut ones" is equivalent to "rerun everything with the new caps".
- **For the thesis:**
  - Report the cap change as a protocol amendment (baseline-v1.1).
  - Report that tokenization makes the same "short answer" instruction much more expensive for Qwen in Bangla than for Gemma. This is a real finding about deploying LLMs for Bangla.

### 5.4 The judge rates its own answers (design risk)
The 80B is both an answer model and the judge. It is checked by human ratings (AinSutro) and an independent second judge (Claude) on the same answers. The report measures the self-preference bias with a 95% CI; if the CI excludes 0, the model ranking uses human and Claude scores.

### 5.5 Other known limits
- **Test-set recheck postponed:** questions were generated by the 80B and first-pass reviewed by an LLM. The team recheck must happen before fine-tuning. Thesis wording: "generated by an LLM, first-pass reviewed by an LLM, verified by the authors (agreement X%)".
- **Raters can see the model name** unless they tick "hide model name". The guide recommends hiding it.
- **Machine translation** of questions is only a reading aid; ratings are made against the original.
- **Read-aloud voice** quality depends on the browser (best in Microsoft Edge or Android).
- **Bangla questions about English Acts** retrieve worse than English ones (a cross-language search gap); fine-tuning bge-m3 may help.

---

## 6. Next (plan)
| When | PC A | PC B |
|---|---|---|
| 24–25 Nov | 80B B0 law (high effort) + files finish | Qwen 30B: apply the fix, remove cut answers, finish law + files |
| 25–26 Nov | Judge the 80B B0 (~4 h, context 131,072). Add the 80B answers to AinSutro. | Judge Qwen 30B B0 with its own 80B. Push. Then PC A adds the 30B to AinSutro. |
| ongoing | Team rates in AinSutro. Claude scores the same answers (ask before each batch). | |
| ~26–27 Nov | `human.py analyze` + `score.py compare --across-models` → three-model report → **team chooses the model to fine-tune** | |
| after | Team recheck of the test set → B0 clean-up → fine-tuning → "after" runs (E1–E3) → privacy layers and attack sets (`PRIVACY_PLAN.md`) | |

**Open decisions (team / supervisor):**
- which model to fine-tune;
- whether to keep the raised caps for the "after" runs (yes, by default, for comparability with v1.1);
- the privacy-plan choices in `PRIVACY_PLAN.md` section 9.

---

## 7. Draft wording for the thesis (edit freely)
- *Answers were generated locally with LM Studio (Q4_K_M quantization, temperature 0, 4 parallel requests, context 131,072 tokens) on two NVIDIA DGX Spark machines.*
- *Each test question was answered at 9 settings (3 effort levels × 3 technicality levels).*
- *Answers were scored by a fixed LLM judge (Qwen3-Next 80B, rubric j1) for correctness, faithfulness to the retrieved excerpts, technicality fit, language and refusal.*
- *The judge was validated against human ratings collected with a purpose-built tool (AinSutro) and against an independent LLM judge (Claude) on the same answers. We report inter-rater agreement (weighted κ), judge–human agreement (Spearman ρ, weighted κ) and the judge's self-preference bias with 95% bootstrap confidence intervals.*
- *During the baseline runs we found that answers were silently truncated, by the per-effort generation limit and, at a smaller context, by context overflow. Because Qwen's tokenizer needs roughly one token per Bangla character, this affected Qwen's Bangla answers far more than Gemma's. We raised the limits, enlarged the context, made the runner detect truncation (finish_reason) and regenerate affected answers with a higher limit, and re-ran only the affected answers, which is equivalent under greedy decoding (protocol v1.1).*

---

## 8. Changes to this file
- 24 Nov 2026: created (PC A), covering 17–24 Nov.
- 24 Nov 2026: renamed THESIS_LOG.md → THESIS_LOG_PC_A.md (PC B keeps THESIS_LOG_PC_B.md).
