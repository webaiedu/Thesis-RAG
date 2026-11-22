# Hand-checking the test set (guide for the team)

The benchmark numbers in the thesis are only as good as this test set. Every test question must be checked by a person.

## Files
- `eval/data/review/test_review.csv`: ~600 generated questions to check. Open it in LibreOffice Calc (UTF-8, comma), Excel or Google Sheets. Save it back as **CSV, UTF-8**.
- `eval/data/review/handwritten.csv`: your own questions (~60). Delete the example row when you start.

Split the rows between team members by domain, and put your name in `reviewer`.

## For each row in `test_review.csv`
Read `question`, `reference_answer` and `source_text` (the law section or case passage it came from). Then set `decision`:

| decision | when |
|---|---|
| **keep** | A real person could ask this, the source text answers it, and the reference answer is correct and complete. |
| **fix** | It's mostly fine, but the wording is unnatural, the Bangla is poor, or the answer is wrong/incomplete. Write the corrected version in `question_fixed` and/or `answer_fixed`. |
| **drop** | Nobody would ask this (e.g. who staffs some committee), it isn't really answered by the source, it's a duplicate, or the source text is OCR noise. |

**The question must make sense on its own.** The chatbot never sees the source text, so "Who staffs the committees formed by the Board under this law?" or "If the chairman is ill for 6 months…" can't be answered: which board, which chairman? Either **fix** it (name the institution, office or law) or **drop** it. This was the most common problem in the trial run.

Rules for the reference answer:
- **Only what the source text says.** Don't add outside legal knowledge, even if it's true.
- Name the law and section (or the case and citation).
- 1–3 sentences, in the question's language.

**Other sections that also answer the question:** if another section or case answers it too (e.g. a later amendment, or the Bangla version of the same act), find its id and add it to `extra_gold_chunk_ids`, separated by `;`. Otherwise the search gets marked wrong when it finds that other correct section. To find the id (with the retrieval server running):
```bash
cd eval && python3 review.py find "your question or key words" --domain criminal
```

**Target:** about 300 kept/fixed rows in total, roughly 30–35 per domain, about half Bangla and half English. If a domain already has 35 good rows, drop the remaining weak ones.

## `handwritten.csv`: about 60 questions you write yourselves
These test what generated questions can't: real user behaviour. Aim for roughly:

| type | how many | example | expected_route |
|---|---|---|---|
| `typo` | 10 | `wat is the punisment for theft in bangladesh?` | law |
| `colloquial` | 10 | `বউ খোরপোষ না দিলে কি করবো?` (Banglish or everyday Bangla) | law |
| `multi_section` | 8 | a question that needs two sections (put both ids in `gold_chunk_ids`) | law |
| `case_law` | 6 | `can parliament give indemnity for killings in operation clean heart?` | law |
| `general` | 8 | `how do I write a CV?`, `what is the capital of Japan?` | general |
| `out_of_scope` | 8 | a law question our data doesn't cover (e.g. US immigration law) | unsupported |
| `follow_up` | 10 | Not supported yet. Write the 2-message pair in `notes`, put the second message in `question`. | law |

You can reuse the 70 questions in `retrieval/calibration/questions.jsonl` as ideas.

For `law` rows, `gold_chunk_ids` and `reference_answer` are required. For `general` / `out_of_scope` rows, leave `gold_chunk_ids` empty; the reference answer can be a short note like "should refuse: not Bangladesh law".

## Rechecking the first pass (`recheck` / `team_decision`)
Claude did the first pass on every row (`reviewer = claude`). The team now checks the rows with `recheck = yes`. That means every fix, every drop, a random 20% of keeps and every hand-written row, in both CSVs.
**Easiest way: `eval/recheck.html`.** Open it in Chrome or Firefox. It works offline and uploads nothing.
- **Using the page:**
  - Type your name, then open `test_review.csv` (or `handwritten.csv`). Choose your domain.
  - Each row shows the question, Claude's fix, the source text and Claude's reason.
  - Decide with the buttons or the keys <kbd>a</kbd>/<kbd>k</kbd>/<kbd>f</kbd>/<kbd>d</kbd>. Your work is kept in the browser until you click **Export CSV**.
- **Combining everyone's exports:**
  ```bash
  cd eval
  python3 review.py merge-team data/review/test_review.csv test_review.ali.csv test_review.mim.csv ...
  python3 review.py merge-team data/review/handwritten.csv handwritten.ali.csv ...
  ```
  It reports a CONFLICT if two people decided the same row differently. Settle it and merge again.

**In a spreadsheet instead:**
1. Filter the sheet on `recheck = yes`.
2. For each row, read `question`/`reference_answer` (and `question_fixed`/`answer_fixed` for fixes), `notes` and `source_text`, then fill in `team_decision`:
   - `agree`: Claude's decision is right; nothing else to change.
   - `keep` / `fix` / `drop`: you disagree. For `fix`, write your version in `question_fixed`/`answer_fixed`. In `handwritten.csv`, edit `question`/`reference_answer` directly. Add a reason to `notes`.
3. Leave rows without `recheck = yes` alone.

`review.py import` uses `team_decision` when it is filled and prints the Claude–team agreement rate. The rate goes into the thesis.

## When you're done
```bash
cd eval
python3 review.py import data/review/test_review.csv --handwritten data/review/handwritten.csv
```
This checks every row (decision filled, chunk ids exist) and writes `data/test.jsonl` plus `data/test.stats.txt` with the sha256. Then commit both CSVs, `test.jsonl` and `test.stats.txt`, and write in `eval/data/README.md` who checked it and when. **After that, don't edit `test.jsonl` again**: the before/after benchmark must use exactly the same file.
