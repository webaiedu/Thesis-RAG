# Thesis research log: PC A

PC B keeps its own log, `planning/THESIS_LOG_PC_B.md`. Each PC writes only its own file.

A running record of what we did, why, and what we found, written for the thesis (Methods, Results, Threats to validity). **Append only:** new entries go at the top of "Timeline"; never rewrite old entries. Correct them with a dated note instead. Every number points to the file it comes from.

- **Thesis:** *Privacy Driven AI Protection: Safeguarding Sensitive Information in RAG Systems Using Multi-Layer Filtering* (decided 23 Nov 2026).
- **System:** AinSutro (formerly Ainkhoj), a RAG chatbot for Bangladesh law (Bangla + English).
- **Human-scoring tool:** AinSutro Scoring Page.
- **Last updated:** 25 Nov 2026, 16:11 (PC A).

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

### 25 Nov 2026, 16:11 (PC A): stopped for the day
- **Stopped at 16:09** (user's request): the judge waiter, the answer chain and the runner (Ctrl+C equivalent; files intact, resume exactly). **80B B0 law 3,285 / 3,285 complete; files 273 / 684.** Retrieval server stopped; LM Studio keeps the 80B loaded (context 262,144, Parallel 4).
- **Human ratings pulled** (`human.py pull`): 4 rows → 3 answers rated by 1 rater (all Gemma; one re-score). `human.py status`: Gemma 3 / 3,969, Qwen3 30B 0 / 3,969, 80B not added yet.
- **Saved for reuse:** `eval/human_app/audit.py` (the scoring-page audit; tested again: Gemma 0 problems).
- **Kept out of git:** the scoring page link (the Firebase project name was replaced in today's docs by "name on PC A only"; secrets and generated files are git-ignored).
- **Handoff:** `planning/NEXT_STEPS.md` (25 → 26 Nov, incl. PC B's start prompt) and `~/Desktop/"Tomorrows promt.txt"` (PC A, 26 Nov).
- **Tomorrow:** resume `run80b.sh` (files, ~45 min) and `judge80b.sh` (pilot redo + 80B judging ~4 h); add the 80B to the scoring page (`human.py export` + `push`, then `human_app/audit.py qwen3-next-80b`); PC B judges the 30B.

### 25 Nov 2026, 15:39 (PC A): 80B B0 law answers complete
- **15:35 main pass ended:** "1,176 answers written, 3 errors, 0 cut saved (1 cut answer redone longer)". The 3 errors were the timeouts of `q-9869ae952f39` (high effort).
- **15:39 retry pass (try 2, with the length-based time limit):** "3 answers written, 0 errors, 0 cut saved". All 3 finished normally (`stop`), 4,217–5,532 chars, 164–205 s each even without other requests running, so the old 5-minute limit was simply too short for them; the fix worked.
- **Checked:** `runs/B0/qwen3-next-80b/answers.jsonl` 3,285 / 3,285, unique keys, 365 questions × 9, 0 cut flagged, 0 empty, 0 `<think>`. Cut redos today: 2 (both saved complete; `cut.jsonl`). The 1,426 answers from before the 24 Nov fix were checked with exact token counts this morning.
- **15:39 file run started** (684 answers, 4 workers, no router cache miss), estimate ~2 h. Then `judge80b.sh` redoes the 11 cut pilot answers and judges (~4 h).

### 25 Nov 2026, 15:29 (PC A): full audit of the scoring page data (Gemma + Qwen3 30B): 0 problems
- **Method:** new read-only store action `admin_audit` returns an MD5 fingerprint of every answer's reply text and of the excerpt texts a rater sees; PC A recomputes them from the run files the 80B judge used (`runs/B0/<model>[-files]/answers.jsonl`), with the excerpts built exactly as `score.py excerpts_for` builds them for the judge (cross-checked against that function for every answer).
- **Result:** Gemma 3,969 / 3,969 and Qwen3 30B 3,969 / 3,969 answers present; 0 missing, 0 extra, **0 reply differences, 0 excerpt differences**, 0 excerpt-count differences. All 441 questions identical (question, reference, file content, language, section, file, expected route, history). Queue: 441 entries per model, each pointing at its own question and exactly its own 9 answers (3 effort × 3 technicality), 0 wrong; the same 22 overlap questions for both models. So humans see exactly what the 80B judge saw.
- **Buttons:** Law/File Answers show the percentage as the main figure and "rated of all answers" small next to it (e.g. "0.04%  3 of 7,938"); phones show only the percentage. Published. Store v9 (audit only; no change for raters).

### 25 Nov 2026, 15:23 (PC A): scoring page counts
- **Reported:** the Law Answers button showed a small percentage before and "0%" after the 30B was added. Cause: rounding to one decimal; with the 30B the law total doubled (3,285 → 6,570), so a few ratings rounded to 0%. No data was lost.
- **Changed (team request):** the Law/File buttons now show rated answers **out of all answers in the scoring page**, e.g. "3 of 7,938" (with a model selected: out of that model's answers, e.g. "0 of 3,969"; tooltip gives the percentage and the section total). Percentages elsewhere never round progress to 0% (2 decimals under 1%, "<0.01%" for tiny values); the bar shows a sliver once anything is rated. On phones the buttons stay short and the progress line shows the numbers. Tested in headless Firefox; published.

### 25 Nov 2026, 15:14 (PC A): Qwen3 30B added to the AinSutro Scoring Page; model choice
- **PC B pushed the complete Qwen3 30B B0 run** (`18fb054`; fast-forwarded on PC A without touching the running 80B files). Checked: law 3,285 + files 684, no duplicates, 9 answers per question, none empty, no `<think>`, none flagged cut; all 25 earlier errors redone; the 2,630 older answers passed PC B's exact-token cut checks (0 flagged, `THESIS_LOG_PC_B.md`).
- **Added to the scoring page:** `human.py export --model qwen3-30b` (3,969 answers, 441 questions) and the new `human.py push`, which sends the CSVs straight to the store (new admin actions `import_rows`, `build_queue`; same import code and duplicate protection as the Drive import). 441 new questions queued. Two Google 500 errors during the excerpt import were retried; re-sending all 2,353 excerpts added 0, so every excerpt the 30B cites is in the store (verified). The page now holds 7,938 answers (Gemma 3,969 + Qwen3 30B 3,969).
- **Model choice (team request):** a Model menu next to File Answers (All models / Gemma 4 E4B / Qwen3 30B / Qwen3-Next 80B; models not imported yet are greyed out and marked "not in yet"). The progress line shows the chosen section/group/model count, the model total and all models; the account menu shows the rater's count per model. Store v7: `next` takes the model; progress has per-model counts. Uniqueness is per question × model as before.
- **Tested:** the real store code in Node (21/21 checks, incl. 30B-only questions, two raters on the 30B get different questions, per-model totals) and the page in headless Firefox (80B disabled, 30B selectable, counts shown, no errors). Store deployed at the same address; page published.

### 25 Nov 2026, 14:49 (PC A): third timeout, same question; status
- The third high-effort answer of `q-9869ae952f39` (`high|high|high`) also hit the old 5-minute limit (errors.jsonl: 3, all this question's high-effort answers). The chain's retry pass after law redoes all 3 with the length-based limit (12 min for 6,000 tokens). If one still fails, the chain stops before the file answers; check `eval/runs/logs/80b-chain-25nov.log`.
- Status: law 3,000+ / 3,285 saved, files 0 / 684. Judge step `judge80b.sh` still waiting. AinSutro Scoring Page: 3 / 3,969 rated.
- **Still to do (next session):** check the law retry pass and the file run finished with 0 errors; the pilot redo + judging start by themselves (`judge80b-25nov.log`); add the 80B to the AinSutro Scoring Page (`human.py export --model qwen3-next-80b`, upload to Gold Judge, admin_import); add the 30B when PC B pushes; `human.py pull` + status; commit; update ~/Desktop/"Tomorrows promt.txt".

### 25 Nov 2026, 14:13 (PC A): scoring page: one rater per answer, enforced
- **Team request:** every rater must get questions nobody else rates. Audit of all paths found three ways two people could score the same answer outside the planned 5% overlap: (1) a rater scores part of a question, is idle 3 h, it goes to someone else who scores all 9; (2) after that the first rater keeps scoring in the open tab; (3) Skip after scoring some answers.
- **Fixed in the store (v6):** a started question stays with its rater for 7 days (unstarted: 3 h as before); the store refuses new scores on a question another rater now holds or has finished (own earlier scores can still be changed); Skip only before the first score; if a question passes on after 7 days, answers already scored stay with their rater and are locked for the next one, who scores only the rest. The page hides Skip after the first score, shows locked answers as "scored by another rater" and moves a rater on when their question was taken.
- **Tested** by running the real `Code.gs` in Node against an in-memory Sheet with 7 simulated raters: 16/16 checks (different questions at the same time; started question kept after 4 h; released after 8 days with the scored answers locked; refusals for skip-after-scoring, new scores on a taken question and locked answers; overlap question to exactly one second rater, never a third; **no answer outside the overlap with two raters**). Page checked in headless Firefox. Store deployed at the same address; page published.
- Analysis unchanged: `human.py` already uses each rater's latest score per answer.

### 25 Nov 2026, 14:07 (PC A): scoring page bugs fixed (law question jumped to a file question)
- **Reported:** in Law Answers the page seemed to reload by itself and showed a file question.
- **Cause:** a "first visit" helper switched to the section the team was further behind in. Once some law answers were rated, a browser opening the page for the first time loaded a law question and then switched to File Answers by itself. A second weakness made it worse: when two loads overlapped (that switch, fast clicks or a slow network), the last reply won, so the highlighted section and the question shown could disagree.
- **Fixed** (`eval/human_app/site/public/app.js`): (1) auto-switch removed; the page stays in the section the rater chose (Law Answers by default). (2) Each load is numbered; replies from older loads are ignored. (3) A save that finishes after another question was opened no longer changes the screen (the score is still saved). (4) Typing 1–5 or Enter while the language/file-type menu has focus no longer changes or saves a score. (5) A failed load of the file list is retried instead of remembered. (6) Section and language/file-type changes are honoured even while a save is running.
- **Tested** in headless Firefox with a mock store that answers law slowly and file quickly: first visit stays on Law; File→Law→File clicked fast ends on a file question with File selected; switching language during a save shows the right question; no script errors. Published.
- No effect on stored ratings or on the benchmark.

### 25 Nov 2026, 13:56 (PC A): scoring page: choose language or file type, "My ratings" with re-scoring
- **Team request.** Section buttons renamed **Law Answers** / **File Answers**.
- **Choice of questions:** Law: English (default) / Bangla / Other; File: all types (default) / PDF / scanned PDF / photo / Word document. Groups on the real Sheet (checked): law en 161, bn 158, other 46 (typos, informal or Banglish, follow-ups, general, out of scope) = 365; files pdf 15, scan 25, photo 25, word 11 = 76. Each question is in exactly one group; the content is unchanged, so human, 80B and Claude scores stay on identical questions and answers. The progress line shows the chosen group's count. A question a rater claimed but had not started is released when they switch groups.
- **My ratings** (account menu): list of the rater's scored questions; reopen one (only their own) with their scores filled in and change any score. Re-scores are appended to the Ratings tab; `human.py` keeps each rater's latest score per answer, so a change replaces the old score in the analysis. Fixed on the way: a re-scoring overlap rater keeps their first/second role (was: re-scoring would have marked the second rater as first).
- **Threat to validity:** with free choice of language and file type, the rated sample may be unbalanced (e.g. more English than Bangla). The analysis should report coverage per group (law en/bn/other, file types) and weight or compare per group.
- Tested in headless Firefox with a mock store (filters, defaults, My ratings, reopen, re-score; no script errors). Store v5 deployed at the same address, page published. Docs: `eval/HUMAN_GUIDE.md`.

### 25 Nov 2026, 13:37 (PC A): project renamed Ainkhoj → AinSutro; scoring page = "AinSutro Scoring Page"
- **Team decision:** the thesis project and the chatbot are now called **AinSutro** (formerly Ainkhoj). The human-scoring web page is the **AinSutro Scoring Page** (title, header, sign-in page, old-link "moved" page; published). PC A does the rename in shared files; PC B only notes it in its own log (avoids git conflicts).
- **Renamed:** the chatbot's on-screen name (`frontend/lib/brand.ts`), `CLAUDE.md`, `planning/ROADMAP.md`, `planning/PRIVACY_PLAN.md`, names of the *future* fine-tuned models in `benchmark/after-*.md` (`ainsutro-gemma-4-e4b`, `bge-m3-ainsutro`, …), a message in `eval/human.py`, the download user-agent in `prepareDataset/fetch_cases.py`.
- **Kept on purpose (benchmark frozen):** the name inside the system prompt (`backend/src/bot.config.ts`, `BOT_NAME = 'Ainkhoj'` in `identityLine()`) stays **Ainkhoj until the whole benchmark (before and after fine-tuning) is finished**, so every model gets the identical prompt; only a comment was added. The question-generation prompts in `eval/make_questions.py` (which made the test set and training questions) are unchanged too. Saved answers in `eval/runs/` and older log entries keep the old name.
- **Checked:** no file that shapes answers or judge scores changed in substance (`answer.config.ts`, `chat.service.ts`, `router.service.ts`, `run-eval.ts`, `eval/config.json`, test sets, route and file caches, `retrieval/server.py` unchanged; `bot.config.ts` comments only; judge hash still `aebea71088b8`). Backend and frontend type-check OK.
- **Thesis wording:** the chatbot is "AinSutro"; note once that during the benchmark its system prompt still named it "Ainkhoj" (the old name), identically for all models.

### 25 Nov 2026, 13:14 (PC A): second timeout, same question
- A second 80B answer to the same Bangla question (`q-9869ae952f39`, labour compensation; `high|high|auto`) hit the old 5-minute limit (the running law pass still has the old limit; errors.jsonl now 2). Its mid-effort answers finished normally but slowly (~15 tokens/s with 4 in parallel: 1,700 chars in ~2 min), so this looks like slowness, not repetition. The retry pass (with the new length-based limit, 12 min for 6,000 tokens) should save both. If one is still cut at 16,000 tokens (a real loop), the chain stops and the watcher reports it.

### 25 Nov 2026, 13:13 (PC A): acknowledgement wording
- Sign-in heading and acknowledgement now say "the **AinSutro** thesis" instead of "the Ainkhoj thesis" (team's request). Nobody had acknowledged yet (Acks tab empty), so the version stays `ack-1`. Published.

### 25 Nov 2026, 13:10 (PC A): AinSutro requires a legal-background acknowledgement
- **Team decision:** only people with legal knowledge rate. The sign-in page now has a required tick box (English): *"I confirm that I have knowledge of law, including the acts and ordinances of Bangladesh, the Constitution and other legal matters. I am a lawyer, judge, legal specialist, law student, or otherwise work or study in law. I understand that my ratings are used as the human gold standard for the Ainkhoj thesis."*
- "Sign in with Google" stays disabled until it is ticked. Raters already signed in see the same box and a Continue button before they can rate.
- **Enforced by the store, not only the page:** without an acknowledgement the store refuses `next`, `submit` and `skip`. Each acknowledgement is recorded in the new Sheet tab **Acks** (time, rater, name, version `ack-1`), so the thesis can state that every rater confirmed a legal background (self-reported; not verified).
- Tested locally (both paths, no script errors); store deployed as v4 at the same address, page published. Docs: `eval/HUMAN_GUIDE.md`.

### 25 Nov 2026, 12:12 (PC A): AinSutro shows answer counts on phones
- On phones the header hid the team count and the Law/File buttons showed only a percentage. New progress line under the header on every screen size: "Law: N of M answers rated (x%) · All: … · You: …" with a thin bar, for the section the rater is in. Tested at phone width (no script errors, no sideways scroll); published.

### 25 Nov 2026, 11:48 (PC A): correction note
- The entries headed "11:50" (model name in AinSutro) and "11:58" (timeout fix) were written at about 11:44 and 11:46. Their content is correct. From now on, entry times come from the PC clock.

### 25 Nov 2026, 11:58 (PC A): fix: long answers were stopped by a 5-minute clock
- **Problem:** one 80B law answer (`B0|q-9869ae952f39|high|high|low|auto`) failed with "The operation was aborted due to timeout" (`runs/B0/qwen3-next-80b/errors.jsonl`). Each LM Studio call had a fixed **5-minute limit** (`backend/src/chat/llm.service.ts`). A high-effort answer may be up to 6,000 tokens and a redo after a cut up to 16,000; with 4 answers in parallel these can need more than 5 minutes. Every long redo would have failed the same way. Nothing was saved cut: the answer went to errors.jsonl, as designed.
- **Fix:** the limit now grows with the length limit: max(5 min, 0.12 s per allowed token), so 6,000 tokens → 12 min, 16,000 → 32 min. It only changes how long we wait, never what the model writes, so answers and comparability are unchanged. Type-check OK.
- The running law pass keeps its compiled code; the chain's retry pass (try 2) recompiles and redoes the failed answer with the fix, and the files run starts with it. So far 1 timeout in ~280 answers today; the longest saved high-effort answer took 199 s.

### 25 Nov 2026, 11:50 (PC A): AinSutro shows the model name
- **Team decision:** raters see which model wrote the answers. The model name ("Gemma 4 E4B" etc.) is now shown at the top of the question and above each answer; account menu → "Hide model names" lets a rater rate blind (remembered per browser). Before, names were hidden by default and the switch was hard to find.
- **Thesis note (threat to validity):** knowing the model can bias human ratings. The analysis should report that raters were *not* blind to the model (unless a rater chose to hide it; this is not recorded per rating).
- Published to Firebase Hosting; guide text (English and Bangla) and `eval/HUMAN_GUIDE.md` updated.

### 25 Nov 2026, 11:40 (PC A): correction note
- The two entries headed "11:50" and "12:05" below were written before those times; the real times were about 11:30 and 11:38. Their content is correct.

### 25 Nov 2026, 12:05 (PC A): checked that everything is free
- **Firebase project for AinSutro:** no billing account (`billingEnabled: false`, Cloud Billing API); the Google account has **no billing accounts at all**, so nothing can be charged. Spark plan limits (10 GB hosting, 360 MB/day transfer) are far above our use (13 MB).
- **Every benchmark run and the judge used only local LM Studio** (`run-config.json` of gemma, gemma-files, qwen3-30b, qwen3-next-80b: router, law and general providers all `lmstudio`; judge `http://localhost:1234/v1`). Image description also goes to LM Studio. No paid API host appears in `eval/`, `prepareDataset/` or `retrieval/`.
- **Gemini key switched off:** `backend/.env` had a `GEMINI_API_KEY` that nothing used, but the code falls back to Gemini when a provider setting is missing. The key is now commented out (git-ignored file; remove the `#` to restore), so an accidental Gemini call fails instead of using the key. No effect on the running 80B job.
- Other tools used: LM Studio, ChromaDB, bge-m3, Apps Script, Google Sheets, firebase-tools, clasp, LibreOffice, PyMuPDF, marked, DOMPurify, Selenium; all free.

### 25 Nov 2026, 11:50 (PC A): AinSutro moved to Firebase; fresh start for human scoring
- **Problems reported by the team:** (1) opening AinSutro showed Google's "this app isn't verified / unsafe" warning (Advanced → Go to …), which made raters feel unsafe; (2) on some PCs and phones the link showed a Google Drive error; (3) the attached file looked cut off; (4) the page looked machine-made.
- **Causes:** (1) the old page was an Apps Script web app that ran *as the visitor* and asked for an extra permission, so Google showed every rater its unverified-app warning; (2) Apps Script pages that need sign-in fail with a Drive error ("unable to open the file") when a browser is signed into several Google accounts, a known Apps Script limit; (3) the file text (at most 757 chars) was complete but sat inside a 420 px scrolling box, which looked cut off on phones.
- **Fix: the page now runs on Firebase Hosting** (free Spark plan), new Firebase project for AinSutro under the PC A account (name and link on PC A only). The chatbot's own Firebase project could not be used: it belongs to another account.
  - Sign-in: Firebase Auth, Google provider, name and email only, so Google needs no app verification and shows **no warning**; the browser remembers the rater. Pop-up sign-in (works in Chrome, Firefox, Safari, Edge, Android and iPhone); in-app browsers (Messenger, Facebook, WhatsApp) get a note to open the link in Chrome or Safari, because Google blocks sign-in there.
  - The **store** (Google Sheet + Apps Script) is unchanged in data and rules. It now checks each rater's Firebase ID token with Google (`verifyUser`, Identity Toolkit `accounts:lookup`) and takes the email and name from Google, not from the page. Admin calls (`human.py`) still use the shared secret. Tested live: valid admin works; fake, missing or old-style (secret + user) rater calls are refused; cross-site access from the page works.
  - The **old link** now shows "AinSutro has a new address" with a button; it runs as the owner with no sign-in, so it shows no warning either. The page link stays out of git (`UI_URL`, PC A only).
- **Comparable with the judge (unchanged rules):** every answer is shown **in full**, exactly as written (Markdown rendered and sanitised: tables, lists, bold); the same 6,000-char excerpts as `score.py`; faithfulness only with excerpts and technicality fit only for low/high; rubric `j1` on every rating.
- **Attachments:** each benchmark file is shown as its real pages (PDF pages; Word files via LibreOffice; photos as they are), with a link to the original and its full text, without a small scrolling box (`eval/human_app/site/build.py`, 40 files, 12.9 MB).
- **Guide (English + Bangla) extended:** what Language OK and Refused mean, why auto answers have no technicality buttons, why some answers have no faithfulness buttons, what "expected" and effort mean, the 3×3 answer grid.
- **Design** (unslop pass): quiet grey chrome, one green accent, IBM Plex Sans + Noto Sans Bengali, no emoji; the 9 answers as a 3×3 grid (effort × technicality); scores 1–5 as large buttons with keyboard shortcuts. Older phones: removed CSS `:has()`, `color-mix()` and a regex look-behind that old Safari cannot parse (it would have stopped the whole page on old iPhones). Checked in headless Firefox at desktop and phone width: no script errors, no sideways scrolling.
- **Fresh start (team's request):** the 12 test ratings (1 rater) were deleted and all claims cleared (store reset; backup `eval/data/human/upload/test-ratings-before-reset-25nov.json`, not committed). Progress now 0 / 3,969 (Gemma). Human ratings stay in the Sheet's Ratings tab; `human.py pull` copies them (anonymous ids) for the comparison with the 80B judge and Claude.
- Cost: all free (Firebase Spark, Apps Script, Sheets). Docs: `eval/HUMAN_GUIDE.md` ("How it is built"). Old page file `eval/human_app/web/Index.html` removed (in git history).

### 25 Nov 2026, 10:45 (PC A): Gemma's one long answer re-judged; 80B run paused and resumed; pilot fix queued
- On the team's request the 80B answer run was **stopped briefly** (no judging while answering) at 2,106 / 3,285 law answers (file intact, no duplicates, 0 errors), and the Gemma answer `B0|f-0f932978df1e|low|high|high|auto` (8,530 chars) was **re-judged with its full text**. Scores unchanged: correctness 3, faithfulness 5, technicality fit 5 (`judgments.before-fullanswer.jsonl` keeps the old line). `runs/B0/gemma-files/summary.md` rebuilt. So **all 3,969 Gemma answers are now judged on their full text.**
- Answer run resumed 10:45 (chain log `80b-chain-25nov.log`). Two mid-effort answers hit the 3,000-token cap and were redone at 6,000; both saved complete (`finishReason stop`; `cut.jsonl` logs the redo).
- **Past cut-offs in the 80B pilot** (24 Nov, before the fix; used only for speed): 11 cut answers (5 law, 6 files; `runs/logs/cutcheck-pilot80b-25nov.log`). `judge80b.sh` removes and re-answers them right after the B0 answers finish (GPU free), keeping the old run-config, then judges.

### 25 Nov 2026, 10:24 (PC A): the judge now sees the full answer
- **Problem found:** `score.py judge` cut every answer at **8,000 characters** before sending it to the judge. Checked across all runs (`runs/*/*/answers.jsonl`): only **1 of 3,969 Gemma B0 answers** was longer (`B0|f-0f932978df1e|low|high|high|auto`, files, 8,530 chars), so the judge missed its last ~530 chars (a closing paragraph). Every other answer so far (Gemma, Qwen 30B partial, 80B partial, all pilots) is ≤ 6,748 chars and was judged in full.
- **Fix:** the judge gets the full answer (`eval/score.py`). For answers ≤ 8,000 chars the prompt is byte-for-byte the same, and the judge hash stays **`aebea71088b8`**, so all existing judgments stay valid.
- **Second guard:** a judge reply without a correctness score or `language_ok` is now an error (retried, never saved). Checked: all 4,509 saved judgments are complete (0 missing scores). A cut judge reply has no closing `}`, so it was already rejected.
- **That one Gemma answer is judged again** with its full text before the 80B judging; the old judgment is kept in `runs/B0/gemma-files/judgments.before-fullanswer.jsonl`.
- **Judge chain armed:** `eval/runs/logs/judge80b.sh` (log `judge80b-25nov.log`) waits until the answer chain ends with ALL DONE and 3,285 + 684 answers. Then it re-judges the Gemma answer, judges the 80B law and files (+ reports, one retry on errors), and runs `compare --across-models` Gemma vs 80B (law and files). It never runs while answers are being made.
- Also checked: AinSutro CSV cells hold 49,000 chars (longest answer ~8,500), so humans see full answers too.
- **PC B** must `git pull` this fix before judging the Qwen 30B (pushed when the user says "commit").

### 25 Nov 2026, 10:08 (PC A): 80B B0 answers resumed
- **Start state** (checked): 1,875 / 3,285 law answers (low 1,095, mid 780), no duplicate keys, no empty answers, no `<think>` text. `git pull`: already up to date (`f6d77a2`).
- **Context raised to the maximum: 262,144** (was 131,072). The user loaded the 80B with its full context, Parallel 4 (`lms ps`). The runner's check is "at least 131,072", so it accepts this. It can only remove context-overflow cuts; at temperature 0 the same prompt gives the same answer. `run-config.json` now records `loadedContext 262144`; yesterday's value (131,072, for the first 1,875 answers) is in git history (`f6d77a2`). **For the thesis:** answers 1–1,875 were made at context 131,072, the rest at 262,144.
- **Cut check again** (`cut_check.py runs/B0/qwen3-next-80b`, exact token count with the 80B's tokenizer, ~10 min): 38 of 1,875 flagged, all made *after* the fix with `finishReason: stop`. They are longer than the *old* caps (low 13, mid 22) because they were answered with the new caps, not cut. The 3 "ends mid-sentence" flags are complete answers that end with a number or formula. The 1,426 answers from before the fix were all made before yesterday's removal (last 08:59 UTC, removal 09:23 UTC), so they were already checked with the same rule. **Result: 0 cut answers saved.**
- **Fix to the chain script** `eval/runs/logs/run80b.sh` (old copy `run80b.24nov.sh`): its logs were named "24nov" and appended to, so on a new day the cache-miss guard and the "Finished" check would have read yesterday's lines. Logs are now dated per day and per try (`80b-<step>-25nov-try1.log`, chain log `80b-chain-25nov.log`). No change to answers or code.
- Retrieval server started (log `eval/runs/logs/retrieval-25nov.log`, 9 domains). Router cache: 365 cached, 0 to route.
- Chain started 10:08: B0 law (1,410 left: mid 315, high 1,095), then B0 files (684). Estimate ~6.5–7.5 h. A watcher alerts on every error, cut redo, step end, or service failure.

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
