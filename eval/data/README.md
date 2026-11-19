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

## Hand-check (fill in when done)
- Reviewers:
- Dates:
- Candidates reviewed / kept / fixed / dropped:
- Hand-written questions added:
- Final `test.jsonl` sha256 (from `test.stats.txt`):
