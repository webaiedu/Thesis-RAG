# Judge sanity check (22 Nov 2026)

Judge: `qwen3-next-80b-a3b-instruct` (LM Studio, context 40192), `eval/config.json` prompt `j1`, hash `aebea71088b8`.
14 answers with known quality: 12 random generated test questions, plus 2 out-of-scope questions.
- **right:** the reference answer itself.
- **wrong:** the reference with numbers, sections and yes/no flipped.
- **junk:** "Sorry, I could not find this."
- **refuse:** the 2 out-of-scope questions, answered with a polite decline.

| kind | n | correctness | faithfulness |
|---|---|---|---|
| right | 4 | 5, 5, 5, 5 | 5, 5, 5, 5 |
| wrong | 4 | 1, 1, 3, 1 | 1, 1, 1, 1 |
| junk | 4 | 1, 1, 1, 1 | 1, 1, 1, 1 |
| refuse (out of scope) | 2 | 5, 5 | n/a |

The 3 for one "wrong" answer is defensible: only the section number was wrong, and the legal outcome was still right.
- **Parse errors:** none.
- **Speed:** ~25 judgements/min with 4 workers.

Files: `answers.jsonl` (the 14 answers), `judgments.jsonl` (the judge's output).
