# Human scoring: guide for the team

## What this is
**AinSutro** is the shared web page where we score the benchmark answers. It covers every model (Gemma 4 E4B, Qwen3 30B, Qwen3-Next 80B) and every setting (3 effort × 3 technicality).
- Scoring starts with Gemma, which is finished. The other models are added as their runs finish, so nobody waits for the end.
- **Ratings are stored** in the **Ratings** tab of the Google Sheet **"AinSutro human scoring"** (Drive folder **Gold Judge**).
- Claude scores **the same answers** separately. The 80B judge has already scored everything. `python3 human.py analyze` compares humans, Claude and the 80B judge.

Everything is free: Google Sheets, Apps Script and Google sign-in on normal Google accounts, Google's built-in translation in Apps Script, and the browser's own voices. No paid APIs.

## How it works
- **Sign-in:** AinSutro asks visitors to choose a Google account once and then remembers them. Their Google name and email identify them; nobody types a name.
- **Two sections:** **⚖️ Law questions** (3,285 answers per model) and **📄 File questions** (684 per model, questions about an uploaded document). Each shows its own progress. On a first visit the page opens the section the team is further behind in.
- **One unit of work** is one question × one model, which means its **9 answers** (effort low/mid/high × technicality low/auto/high). You read the question and reference once, then rate the 9 answers.
- **Nobody scores the same thing twice.** Each question×model goes to one person only. If they are idle for **3 hours**, it is released to someone else.
- **Order:** every question has a fixed priority (balanced over law areas, Bangla/English and the special question types), so whatever we finish is a fair sample. A new model's answers to the early questions come first, so we get the same questions for every model.
- **Overlap (~5%):** every 20th question is also given to a second person, who isn't told. This measures how much we agree with each other (κ).
- **Help on the page:** 🔊 reads the question, translation, reference or answer aloud. A Bangla translation is shown for English questions, and an English one for Bangla questions (machine translation; score against the original). 📘 **Guide** opens a short guide in English and বাংলা.

## How it is built (owner)
Two Google Apps Script projects, both in `eval/human_app/`, uploaded with Google's free `clasp` tool (`npx -y @google/clasp@2.4.2`, logged in as the Sheet owner):

| Folder | Project | Runs as | What it does |
|---|---|---|---|
| `web/` | standalone "AinSutro" | **the visitor** (anyone with a Google account) | The page. It reads the visitor's Google email and name, then calls the store. Visitors get no access to the Sheet. |
| `store/` | bound to the Sheet | **the owner** (anyone, protected by a secret) | All data, the private API, the Sheet menu **AinSutro**. Its old link now shows "AinSutro has moved → Open AinSutro". |

- `Secret.gs` (in both folders), `.clasp.json` and `eval/data/human/api.json` are **not committed**. They hold the shared secret and the project ids.
- **To change the code:** edit the folder, then run `clasp push -f` there, then `clasp deploy -i <deploymentId> -d "…"`. Use the same deployment id so the link stays the same; `clasp deployments` lists them.
- **Sheet menu AinSutro:**
  - Import files from Gold Judge folder
  - Translate questions
  - Show progress (law and file, per model, per rater)
  - Release all claims
  - Delete ALL ratings and claims (asks first)

## Adding a model when its run finishes
On PC A, in `eval/`:
```bash
python3 human.py export --model qwen3-30b        # refuses until all 3,969 answers exist
```
1. Claude uploads the new `answers-qwen3-30b-*.csv` and the updated `chunks.csv` to the Gold Judge folder.
2. Then the import runs, either through the store API or with **AinSutro → Import files from Gold Judge folder** in the Sheet. New questions appear in both sections right away.
3. **Existing ratings are never touched.** The import only adds.

## How to rate
1. Open the AinSutro link and choose your Google account (once; the browser remembers it). Pick **⚖️ Law** or **📄 File** questions.
2. You see the question, the reference answer and a badge row. Then you rate **answers 1–9** one at a time:
   - The badges show the model, effort and technicality.
   - Each answer has the source excerpts the chatbot was given.
   - Use **Back** or the numbered dots to change an earlier rating.
3. **Skip this question** gives the whole question to someone else, for example if you can't judge that area of law.
4. Rate in short sittings and stop whenever you like. Your current question waits for you for 3 hours.

**Tip:** tick **hide model name** at the top. Knowing which model wrote an answer biases people, and the thesis is stronger if you rate blind.

**Same rules as the 80B judge:** the page only offers the judge's scores. Faithfulness can't be skipped when excerpts were given, and is n/a automatically when none were. Technicality fit is n/a for *auto* and required for *low*/*high*. Each rating is stamped with rubric `j1`.

## Rubric (identical to the 80B judge's prompt `j1` in `score.py`)
**Correctness 1–5:** does the answer give the **same legal result as the reference** (punishments, periods, amounts, conditions, who/where)?

| Score | Label | Meaning |
|---|---|---|
| 5 | Perfect | all key points right, nothing wrong |
| 4 | Good | right, with a small gap or imprecision |
| 3 | Partly good | the main point is right, but a key detail is missing or wrong |
| 2 | Mostly wrong | little of the legal result is right |
| 1 | Wrong / no answer | wrong, or no real answer |

- Extra correct detail is fine. The reference may be shorter than a good answer.
- Expected handling **general**: judge plain helpfulness and accuracy.
- Expected handling **unsupported**: 5 = it clearly declines or says this is outside the Bangladesh law it covers; 1 = it answers from outside knowledge as if certain.

**Faithfulness 1–5 / n/a:** are the answer's legal claims **supported by the source excerpts** rather than outside knowledge?
- 5 = everything is supported.
- 1 = mostly unsupported, or invented sections.
- Choose **n/a** if no excerpts were given.

**Technicality fit 1–5 / n/a:** rate this only when technicality is low or high.
- low = plain everyday words, little jargon.
- high = precise legal terms and section references.
- Choose **n/a** for auto.

**Language OK:** the answer is in the language of the question. A question in Bangla written in Latin letters may be answered in Bangla or English.

**Refused:** the answer declined to answer.

| Calibration example | Correctness | Faithfulness |
|---|---|---|
| The reference answer itself | 5 | 5 |
| Reference with the number, section and yes/no flipped | 1 | 1 |
| Only the section number wrong, legal result right | 3 | 1–2 |
| "Sorry, I could not find this." | 1 | 1 |
| Polite decline on an out-of-scope question | 5 | n/a |

**Rules:**
- Rate each answer on its own merits.
- Unsure between two scores? Pick the lower one if a key detail is missing, and write a short note.
- **Don't discuss scores** with the other raters. Disagreement is data, and we measure it.
- Don't look at the 80B judge's scores (`eval/runs/*/judgments.jsonl`) or Claude's scores while you're rating.

## Getting the results (PC A)
1. Fetch the ratings:
   ```bash
   cd eval
   python3 human.py pull            # straight from the store (needs data/human/api.json); or: pull Ratings.csv
   python3 human.py status          # progress + how many answers Claude still has to score (and the token estimate)
   ```
   - In the repo, raters appear only as anonymous ids (`r-` + a hash of the email). Names and emails stay in the private Sheet.
3. **Claude scoring:** `python3 human.py claude-batch --size 20` prints answers without any scores. Claude rates them and saves its JSON lines with `python3 human.py claude-add file.jsonl`.
   - Claude gives a token estimate and **asks before each batch** (about 3k tokens per answer).
   - It runs in Claude Code with no extra cost, but it uses the session's usage limits.
4. `python3 human.py analyze` writes `data/human/report.md`. It covers correctness, faithfulness and technicality fit:
   - coverage per model and setting;
   - human–human κ on the overlap;
   - 80B judge and Claude vs humans (Spearman ρ, weighted κ, mean difference, MAE);
   - the 80B's **self-preference bias** with a 95% CI, which needs human ratings of 80B answers;
   - model means on the same answers, and human means per setting.

## Files
| File | What |
|---|---|
| `eval/human.py` | export / pull / status / claude-batch / claude-add / analyze |
| `eval/human_app/web/`, `eval/human_app/store/` | the two Apps Script projects (page / data store) |
| `eval/data/human/upload/` | CSVs for the Sheet (not committed; rebuild with `export`) |
| `eval/data/human/ratings.jsonl`, `claude.jsonl`, `report.md` | pulled human ratings, Claude's ratings, the report |

