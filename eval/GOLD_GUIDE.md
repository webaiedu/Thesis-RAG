# Gold standard: rating guide for the team

## Why
Our judge, the local Qwen3-Next 80B, also answers in the benchmark, so it grades its own answers. The gold standard checks the judge against people. It's a blind sample rated by the three of us and by Claude. It answers three questions:
1. Does the 80B judge agree with humans (Spearman ρ, weighted κ)?
2. Does it **favour its own answers** (self-preference bias)?
3. Which of the three models is really best? This decides which model we fine-tune; the team chooses.

Thesis wording: *"The automatic judge was validated on a blind, stratified sample of 150 questions × 3 models (450 answers). Each answer was rated by two authors and by Claude; inter-rater agreement κ = …; judge–human agreement ρ = …; self-preference bias = … [95% CI]."*

## The sample (made once, `python3 gold.py sample`, seed 23)
- **Questions:** 150 = 120 law questions from `data/test.jsonl` + 30 file questions from `data/test_files.jsonl`.
  - The law questions are balanced by domain × language.
  - Every special type is included: typo, colloquial, follow-up, multi-section, general, out-of-scope, case law.
- **Setting:** one, **effort mid, technicality auto**.
- **Each question has 3 answers (A/B/C):** Gemma 4 E4B, Qwen3 30B and Qwen3-Next 80B, in random order. Model names are hidden. The mapping is in `data/gold/key.json`: **don't open it until all ratings are in.**
- **Who rates what:** each question is rated by **2 of the 3 raters** (R1+R2, R2+R3 or R1+R3). So each person gets **100 questions = 300 answers**, about **4–5 hours** in total. Split it over several sittings.
- **Claude** rates all 450 answers separately, in Claude Code, with the same rubric. Claude never sees your ratings.

## How to rate
1. Decide among yourselves who is **R1, R2 and R3**, and write the names in the table at the bottom.
2. Open `eval/gold.html` in a browser (works offline), open `eval/data/gold/sample.jsonl`, and choose your rater id.
3. For each question, read the question, the reference answer and the source excerpts **once**, then rate answers A, B and C.
4. **Export CSV** often (the file is `ratings_R1.csv` etc.). Ratings are kept in this browser only until you export.
5. When you're finished, give the CSV to whoever runs the import:
   ```bash
   cd eval && python3 gold.py import R1 ratings_R1.csv     # same for R2, R3
   python3 gold.py status
   ```

## Rubric (identical to the 80B judge's prompt `j1` in `score.py`)
- **Correctness 1–5:** does the answer give the **same legal result as the reference** (punishments, periods, amounts, conditions, who/where)?
  - **5:** all key points right and nothing wrong.
  - **3:** the main point is right, but a key detail is missing or wrong.
  - **1:** wrong, or no answer.
  - Extra correct detail is fine. The reference may be shorter than a good answer.
  - Expected handling **general**: judge plain helpfulness and accuracy.
  - Expected handling **unsupported**: 5 = it clearly declines or says this is outside the Bangladesh law it covers; 1 = it answers from outside knowledge as if certain.
- **Faithfulness 1–5:** are the answer's legal claims **supported by the source excerpts** (not outside knowledge)? 5 = everything supported; 1 = mostly unsupported or invented sections. Choose **n/a** if no excerpts were given.
- **Language OK:** the answer is in the language of the question. A question in Bangla written in Latin letters may be answered in Bangla or English.
- **Refused:** the answer declined to answer.

**Calibration examples** (from `runs/judge-calibration/README.md`):

| Answer | Correctness | Faithfulness |
|---|---|---|
| The reference answer itself | 5 | 5 |
| Reference with the number, section and yes/no flipped | 1 | 1 |
| Reference with only the section number wrong, legal result right | 3 | 1–2 |
| "Sorry, I could not find this." | 1 | 1 |
| Polite decline on an out-of-scope question | 5 | n/a |

## Rules (so the result is valid)
- **Rate each answer on its own merits.** Don't try to guess which model wrote it.
- **Don't discuss ratings** with the other raters until everyone has exported. Disagreement is data, and we measure it.
- Don't open `key.json`, the `eval/runs/*` answer files or the judge's `judgments.jsonl` while rating.
- Unsure between two scores? Pick the lower one if a key detail is missing, and write a short note.
- You may look up the law, but the reference answer and the excerpts are what count.

## Results
`python3 gold.py analyze` writes `data/gold/report.md`. It has a section each for correctness and faithfulness, covering:
- agreement between the human raters;
- each judge (the 80B and Claude) against the human gold score, which is the mean of the 2 raters;
- the **self-preference bias** of each judge, with a 95% CI;
- each model's mean score by human gold, by the 80B judge and by Claude.

**If the 80B's self-bias CI excludes 0,** the ranking and the fine-tuning choice use the human gold and Claude scores, and the thesis reports the bias.

## Raters
| Id | Name | Started | Finished |
|---|---|---|---|
| R1 | | | |
| R2 | | | |
| R3 | | | |
| claude | Claude (Claude Code, PC A) | | |
