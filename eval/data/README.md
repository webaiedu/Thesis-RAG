# Benchmark dataset: provenance

Keep this file up to date. It's the record the thesis cites for how the test set was made.

## Source
- Chunks: every `backend/data/*.jsonl` file (statutes per domain + `cases.jsonl` from the Supreme Court Online Bulletin), as of git commit `a78e820` plus the Child Marriage Restraint Act 2017 move to `children_women` (19 Nov 2026).
- 57,132 chunks in 35,748 groups. A group is one statute section (all its parts) or one whole court case.

## Split (no leakage)
- Each group is assigned by `sha256(group key) mod 100`: 0–79 train, 80–89 val, 90–99 test (`make_questions.py`). This gave 28,643 / 3,597 / 3,508 groups.
- No question in train/val is about a section or case that has a test question. Check: `python3 make_questions.py --check data/test_candidates.jsonl data/val.jsonl data/train.jsonl`.

## Generation
- Model: `qwen3-next-80b-a3b-instruct` (Q4_K_M, LM Studio), temperature 0.7, thinking off.
- Per sampled chunk: 2 questions (1 Bangla, 1 English) with a 1–3 sentence reference answer taken only from that chunk. The model may skip chunks with nothing to ask.
- Sampling: up to 34 chunks per domain, at most 1 chunk per group, fixed seed (`--seed 1`).
- Leakage check passed (19 Nov 2026): `OK: no leakage across 538 groups`.
- Prompt revision 2 (19 Nov 2026): questions must make sense without the source text. The trial file `trial.jsonl` used revision 1 and is not part of the dataset.

| File | Split | Made | Questions | Hand-checked |
|---|---|---|---|---|
| `test_candidates.jsonl` | test | 19 Nov 2026 | 532 (266 bn / 266 en; 300 chunks sampled, 34 skipped by the model) | → `test.jsonl` |
| `val.jsonl` | val | 19 Nov 2026 | 544 (272 bn / 272 en; 27 chunks skipped) | no |
| `train.jsonl` | train | (not yet) | | no (spot-check ~100) |

## Hand-check
Two passes: an LLM first pass over every row, then the authors recheck a subset (rows with `recheck = yes`).

**First pass:** Claude (Anthropic, model `claude-opus-5-5`), 22 Nov 2026, `reviewer = claude`. It followed `eval/REVIEW_GUIDE.md` row by row, with the retrieval server running for `review.py find`.
- **Reviewed:** all 532 candidates. 148 kept, 157 fixed, 227 dropped, which leaves 305 questions (151 bn / 154 en, 30–37 per domain).
- **Notes:** every fix and drop has a one-line reason in `notes`.

| domain | keep bn | fix bn | drop bn | keep en | fix en | drop en | kept+fixed |
|---|---|---|---|---|---|---|---|
| cases | 1 | 13 | 11 | 12 | 4 | 9 | 30 |
| children_women | 6 | 12 | 12 | 10 | 8 | 12 | 36 |
| criminal | 4 | 14 | 16 | 15 | 4 | 15 | 37 |
| education | 6 | 8 | 14 | 11 | 6 | 11 | 31 |
| family | 3 | 14 | 10 | 10 | 7 | 10 | 34 |
| labour | 13 | 6 | 14 | 13 | 4 | 16 | 36 |
| land | 4 | 13 | 12 | 11 | 5 | 13 | 33 |
| tax | 5 | 13 | 14 | 14 | 3 | 15 | 35 |
| uncategorized | 3 | 13 | 12 | 7 | 10 | 11 | 33 |
| **total** | 45 | 106 | 115 | 103 | 51 | 112 | 305 |

**Most common problems:**
- **Wrong or incomplete answers (~64 fixes):**
  - wrong section letters, e.g. "9K" for ৯খ;
  - "maximum" read as "less than";
  - a key proviso left out.
- **Poor Bangla (~44 fixes, ~38 drops):** wrong legal terms (দণ্ডবিধি for ফৌজদারি কার্যবিধি, আত্মসমর্থন for স্বীকারোক্তি), mixed script, garbled sentences. Only 45 of 151 kept Bangla rows needed no change.
- **Questions that need the source text (~35 fixes):**
  - city-specific police laws asked without naming the city;
  - "this law" or "the Board" left unnamed;
  - Parsi, Hindu or Christian personal law asked without naming the community.
- **Case law: the passage was a party's argument, not the holding (~13 drops).** This is why only 30 of the 50 case rows survived.
- **Over target or not worth asking (~132 drops):** definitions, board procedure, transitional clauses, obsolete provisions. These were dropped to keep each domain at about 30–35 rows.

**Extra gold:** 4 rows got `extra_gold_chunk_ids`. Sections 9খ and 24ক of the Nari O Shishu Act appear both in the consolidated 2000 Act and in the 2025 amendment ordinance.

**Hand-written questions:** 60 in `review/handwritten.csv`:
- 10 typo, 10 colloquial (some in Banglish), 8 multi-section, 6 case-law, 8 general, 8 out-of-scope, 10 follow-up;
- 29 bn / 31 en (Banglish counted as en);
- gold ids found with `review.py find`, reference answers taken only from those chunks.

`notes` records each gold chunk's split. Many common sections (theft, murder, maternity leave) are in the **train** split, so a fine-tuned model may have seen training questions on them. Report the hand-written set separately, or with and without the train-split rows.

**Recheck by the authors:** `recheck = yes` marks every fix (157), every drop (227), a random 20% of keeps (30; `review.py mark-recheck --keep-frac 0.2 --seed 42`) and all 60 hand-written rows, 474 rows in total.
- Reviewers: _(fill in)_
- Dates: _(fill in)_
- Agreement Claude vs team (printed by `review.py import` and in `test.stats.txt`): _(fill in)_

**Final `test.jsonl`:**
- 365 questions (305 reviewed + 60 hand-written).
- **Provisional:** the team recheck isn't done yet, so the current `test.stats.txt` (sha256 `e085d165…`, with follow-up conversation history added) will change. Re-run `review.py import` after the recheck, then record the final sha256 here.
- Final sha256: _(fill in after recheck)_
