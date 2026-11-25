# Human scoring: guide for the team

## What this is
**AinSutro** is the shared web page where we score the benchmark answers. It covers every model (Gemma 4 E4B, Qwen3 30B, Qwen3-Next 80B) and every setting (3 effort × 3 technicality).
- Scoring starts with Gemma, which is finished. The other models are added as their runs finish, so nobody waits for the end.
- **Ratings are stored** in the **Ratings** tab of the Google Sheet **"AinSutro human scoring"** (Drive folder **Gold Judge**).
- Claude scores **the same answers** separately. The 80B judge has already scored everything. `python3 human.py analyze` compares humans, Claude and the 80B judge.

Everything is free: Firebase Hosting and Firebase Auth (free Spark plan), Google Sheets and Apps Script on normal Google accounts, Google's built-in translation in Apps Script, and the browser's own voices. No paid APIs.

## How it works
- **Acknowledgement (required, since 25 Nov):** before signing in, every rater must tick: *"I confirm that I have knowledge of law, including the acts and ordinances of Bangladesh, the Constitution and other legal matters. I am a lawyer, judge, legal specialist, law student, or otherwise work or study in law. I understand that my ratings are used as the human gold standard for the AinSutro thesis."* Sign-in stays disabled until it is ticked; raters who were already signed in are asked the same before they can rate. The store refuses questions and ratings without it, and records each acknowledgement in the Sheet tab **Acks** (time, rater, version `ack-1`; export: store action `admin_acks`). Change `ACK_VERSION` (store) and `ACK_V` (page) together if the wording changes; everyone is then asked again.
- **Sign-in:** AinSutro shows one "Sign in with Google" button (name and email only, so Google shows no warning) and the browser remembers the rater. Their Google name and email identify them; nobody types a name.
- **Two sections:** **Law questions** (3,285 answers per model) and **File questions** (684 per model, questions about an uploaded document). Each shows its own progress. On a first visit the page opens the section the team is further behind in.
- **One unit of work** is one question × one model, which means its **9 answers** (effort low/mid/high × technicality low/auto/high). You read the question and reference once, then rate the 9 answers.
- **Choosing what to rate (since 25 Nov):** the sections are called **Law Answers** and **File Answers**. Next to the progress line a rater picks a group. Law: **English** (default; normal law questions in English, 161), **Bangla** (158), **Other** (46 special questions: typos, informal or Banglish wording, follow-ups, general and out-of-scope, either language). Files: **all types** (default), PDF (15), scanned PDF (25), photo (25), Word document (11). Each question is in exactly one group. The choice only decides which questions a rater gets; the questions, answers and excerpts are exactly the ones the 80B judge and Claude score.
- **Model choice (since 25 Nov):** next to File Answers a rater picks All models, Gemma 4 E4B, Qwen3 30B or Qwen3-Next 80B; a model is greyed out until its answers are imported. The progress line shows the chosen model's count for the section/group, the model's total and all models; the account menu shows the rater's count per model. Uniqueness is per question × model, as before.
- **My ratings (account menu):** a rater sees the questions they scored (newest first), can reopen one with their scores filled in and change any score. The new score is added to the Sheet; `human.py` always uses each rater's **latest** score per answer. The first/second rater roles of overlap questions stay as they were.
- **Nobody scores the same thing twice.** Each question×model goes to one person only, handed out under a server lock. Outside the planned overlap, every answer has exactly one rater (enforced by the store, since 25 Nov):
  - A question nobody has started scoring is released after **3 hours** idle. A **started** question stays with its rater for **7 days**.
  - **Skip** is possible only before the first answer of a question is scored.
  - If a question passes to someone else (after 7 days), the answers the first rater scored stay theirs and are shown to the new rater as "scored by another rater" (locked); the new rater scores only the rest. The first rater can still change their own earlier scores (My ratings) but cannot add new ones to that question.
  - Overlap questions (every 20th) go to exactly one second rater, only after the first has finished.
- **Order:** every question has a fixed priority (balanced over law areas, Bangla/English and the special question types), so whatever we finish is a fair sample. A new model's answers to the early questions come first, so we get the same questions for every model.
- **Overlap (~5%):** every 20th question is also given to a second person, who isn't told. This measures how much we agree with each other (κ).
- **Help on the page:** the speaker button reads the question, translation, reference or answer aloud. A Bangla translation is shown for English questions, and an English one for Bangla questions (machine translation; score against the original). **Guide** opens a short guide in English and বাংলা.

## How it is built (owner)
Since 25 Nov 2026 the page is a static site on **Firebase Hosting**; the data stays in the Google Sheet.

| Folder | What it is | What it does |
|---|---|---|
| `site/` | static page on Firebase Hosting, free project the AinSutro Firebase project (name on PC A only) (owner: the PC A Google account) | The page (`public/index.html`, `app.js`, `app.css`). Raters sign in with **Firebase Auth, Google provider** (basic profile only). It calls the store with the rater's Firebase ID token. Shows each answer in full (Markdown rendered, sanitised), the same 6,000-char excerpts as the judge, and attached files as real page images + the original file + the text. |
| `store/` | Apps Script bound to the Sheet, runs as **the owner**, open to anyone | All data and the API. Rater actions need a valid Firebase ID token, which it checks with Google (`verifyUser`, Identity Toolkit `accounts:lookup`); the email and name come from Google, never from the page. Admin actions (`admin_*`, for `human.py`) need the shared secret. Sheet menu **AinSutro**. |
| `web/` | the OLD page's Apps Script project, now runs as the owner, no sign-in | Shows "AinSutro has a new address" with a button, so old bookmarks still work and show no warning. |

**Why it moved (25 Nov):** the old page ran "as the visitor" with an extra permission, so Google showed every rater an "unverified app" warning, and browsers signed into several Google accounts got a Google Drive error ("unable to open the file"). Both come from Apps Script itself. Firebase sign-in with basic profile needs no Google verification and works on phones and every normal browser. In-app browsers (Messenger, Facebook, WhatsApp) are told to open the link in Chrome or Safari, because Google blocks sign-in inside them.

- **Not committed:** `Secret.gs` (store: `API_SECRET`, `UI_URL`, `FIREBASE_API_KEY`; web: `UI_URL`), `.clasp.json`, `site/.firebaserc`, `eval/data/human/api.json` (store URL + secret) and `eval/data/human/firebase.json` (Firebase web config). **The page link is on PC A only** (`UI_URL`); it is `https://<projectId>.web.app`.
- **Build and publish the page:** `retrieval/.venv/bin/python eval/human_app/site/build.py` (writes `public/config.js` and `public/files/`: every benchmark file as page images, Word files via LibreOffice), then in `eval/human_app/site`: `npx -y firebase-tools@13 deploy --only hosting` (logged in as the owner with `firebase-tools login` in a normal terminal).
- **Change the store:** edit `store/`, `clasp push -f`, then `clasp deploy -i <deploymentId> -d "…"` with the same deployment id, so its URL in `api.json` stays the same (`clasp deployments` lists them). `clasp` is `npx -y @google/clasp@2.4.2`, logged in as the Sheet owner.
- **One-time owner step (done 25 Nov):** Sheet menu **AinSutro → Allow the sign-in check**, so the store may call Google's token check.
- **Sheet menu AinSutro:**
  - Import files from Gold Judge folder
  - Translate questions
  - Show progress (law and file, per model, per rater)
  - Release all claims
  - Allow the sign-in check (once, owner)
  - Delete ALL ratings and claims (asks first)

## Adding a model when its run finishes
On PC A, in `eval/`:
```bash
python3 human.py export --model qwen3-30b        # refuses until all 3,969 answers exist
```
1. `python3 human.py push --model qwen3-30b` sends the new CSVs straight to the store (since 25 Nov; no Drive upload needed) and builds the queue. Rows already in the Sheet are skipped, so it can be run again safely. (The Drive way still works: upload to Gold Judge, then **AinSutro → Import files from Gold Judge folder**.)
2. New questions appear in both sections right away, and the model becomes selectable in the Model menu.
3. **Existing ratings are never touched.** The import only adds.

## How to rate
1. Open the AinSutro link and press **Sign in with Google** (once; the browser remembers you). Pick **Law** or **File** questions.
2. You see the question, the reference answer and a badge row. Then you rate **answers 1–9** one at a time:
   - The badges show the model, effort and technicality.
   - Each answer has the source excerpts the chatbot was given.
   - Use **Back** or the 3 × 3 grid (effort × technicality) to change an earlier rating.
3. **Skip this question** gives the whole question to someone else, for example if you can't judge that area of law.
4. Rate in short sittings and stop whenever you like. Your current question waits for you for 3 hours.

**Tip:** the model name is shown at the top of the question and above each answer (team decision, 25 Nov). Judge the answer, not the model. To rate blind, use account menu → "Hide model names". Knowing which model wrote an answer biases people, and the thesis is stronger if you rate blind.

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
| `eval/human_app/site/` | the page on Firebase Hosting (`build.py`, `firebase.json`, `public/`) |
| `eval/human_app/store/` | the data store (Apps Script bound to the Sheet) |
| `eval/human_app/web/` | the old link, now a "moved" page |
| `eval/data/human/upload/` | CSVs for the Sheet (not committed; rebuild with `export`) |
| `eval/data/human/ratings.jsonl`, `claude.jsonl`, `report.md` | pulled human ratings, Claude's ratings, the report |

