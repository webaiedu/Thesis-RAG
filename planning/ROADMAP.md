# AinSutro 2.0 (formerly Ainkhoj): case-trained model, no-RAG answering, and a vision module

## Context
AinSutro today answers law questions only from retrieved statute excerpts (RAG over 8 Chroma domains, about 70 MB of `.jsonl`). The thesis wants three more things:
1. a model trained on real Bangladeshi court cases,
2. answers that work without RAG,
3. computer vision and pattern recognition.

Hardware: the current laptop (RTX 3050, **4 GB VRAM**) is for development only. **Training and the CV models will run on a more powerful AI PC later.** The trained model is exported to GGUF and served by **LM Studio**, which `LlmService` already supports, so the serving side needs very few code changes.

How much GPU memory you need (VRAM):
- **16–24 GB** (RTX 4080/4090/5090): QLoRA on a 7–8B model, and a full YOLO/ViT training run. This is the realistic target.
- **24 GB+ or 2 GPUs:** plain LoRA in bf16 on 7–8B, or QLoRA on 12–14B. Larger models do noticeably better on Bangla.
- If the PC isn't ready yet, free Kaggle (2×T4) or Colab can run small test runs in the meantime.

---

## Part 1: Case dataset (do this first, everything else depends on it)
- **Sources:** judgments from the Bangladesh Supreme Court website (supremecourt.gov.bd, HCD/AD judgments), plus law reports (DLR, BLD, BLC, MLR) where you have legal access. Ask your supervisor or the university library about access. Respect each site's ToS and rate limits.
- **New script `prepareDataset/cases/`:**
  1. `scrape_cases.py`: downloads judgment PDFs and HTML.
  2. `extract_cases.py`: extracts text with PyMuPDF. Scanned PDFs go to OCR (this connects to Part 3).
  3. `structure_cases.py`: uses an LLM to extract a JSON record per case: `{case_id, court, year, parties, domain, facts, issues, statutes_cited[], held, outcome, text}`. Reuse the existing `prepare.py` cleaning functions (mojibake and spacing fixes) and keep the rule that legal wording is never changed.
- Anonymise names of victims and children (needed for women/children cases).
- **Target:** 2–5k cases. A split of about 80/10/10 for train/val/test, divided **by case**, not by chunk.

## Part 2: Fine-tuned model and the no-RAG mode
**Recommendation:** fine-tune a multilingual instruct model with **Unsloth** on the AI PC: QLoRA, or LoRA if the PC has enough VRAM. Start with **Qwen2.5-7B-Instruct** or **Gemma-3-4B-it**. If you have 24 GB or more, try a 12–14B model too, because size is an interesting variable to compare in the thesis. Both models handle Bangla reasonably.

**Building the training data (SFT pairs):**
- From the cases: "Summarise this judgment", "What did the court hold on issue X?", "Which sections were applied?", and "Given these facts, what is the likely outcome and why?".
- From the existing statute `.jsonl`: "What does section N of Act Y say?" and "What is the punishment for …".
- Generate the Q&A pairs with Gemini from the source text (you already have a key). **Hand-check about 300 of them** so you have a clean test set.
- Mix Bangla and English.

**Export:** merge the LoRA → convert to GGUF Q4_K_M → load in LM Studio.

**Backend changes (small):**
- Add a mode `expert` (no RAG). It goes in the `Mode` type in `backend/src/chat/chat.types.ts` / `chat.dto.ts` and must be mirrored in `frontend/lib/api.ts`.
- `ChatService.reply()` gets a branch that calls `LlmService` with a new `FINETUNED_MODEL` env and a lawyer-oriented system prompt. Add a **disclaimer** that the answer is not grounded in retrieved sources.
- Optional "hybrid" mode: the fine-tuned model **plus** RAG. This will probably score best. Keep it as the main experiment.

**Evaluation (this is the core of the thesis):** compare 4 systems on the same held-out test set:
- base model without RAG
- fine-tuned model without RAG
- base model with RAG (the current system)
- fine-tuned model with RAG

Metrics:
- outcome-prediction accuracy/F1
- statute-citation precision/recall, checked against `statutes_cited`
- ROUGE/BERTScore for summaries
- an LLM-judge plus a small human (lawyer) rating

**Be honest about hallucination.** Measure it, because that is exactly why RAG exists.

## Part 3: Computer vision and pattern recognition (choose 1–2)
Ranked by how useful they are and how well they fit the thesis:

1. **Legal document intake via OCR (recommended main CV piece).** The user uploads a photo or scan of an FIR, court notice, land deed (দলিল/খতিয়ান) or judgment.
   - The pipeline runs: image preprocessing (deskew, denoise, binarise with OpenCV) → layout detection (find stamps, signatures, tables, text blocks with a YOLOv8 model) → Bangla OCR (Tesseract `ben`, or EasyOCR/PaddleOCR).
   - The extracted text goes to the chat as context: "Explain this notice / what are my options?"
   - The same OCR is used for the scanned judgments in Part 1, so the effort pays off twice.
2. **Document type classification.** A small CNN or ViT fine-tune (for example EfficientNet/DiT) labels an image as FIR, deed, court order, notice, affidavit, and so on, then routes it to the right domain automatically. This is classic pattern recognition and is easy to evaluate with a confusion matrix.
3. **Stamp/seal and signature verification.** Detect the court seal and the non-judicial stamp paper. A Siamese network compares a signature against a reference. This is a good thesis topic, but data is hard to get, so treat it as a stretch goal.
4. **Pattern recognition on text (no images):**
   - Cluster cases by facts.
   - Find similar precedents ("cases like mine"). This reuses bge-m3 embeddings over a new `cases` Chroma collection.
   - Show citation-network analysis of which sections are cited together.

**Recommended combination:** #1 + #2 for the CV chapter, and #4 (similar-case retrieval) as the pattern-recognition piece.

**Where the CV code goes:** a new Python service `vision/` (FastAPI, port 8001, same layout as `retrieval/`). Endpoints:
- `/ocr`
- `/classify`
- `/detect`

On the backend side, add a `POST /api/chat/upload` multipart route. It is guarded by `FirebaseAuthGuard`, calls the vision service, and stores the extracted text (not the image) in the chat. On the frontend, add an attach button in the chat input.

## Phased roadmap
| Phase | Work | Output |
|---|---|---|
| 1 | Case scraping, OCR, structuring | `cases.jsonl` + test set |
| 2 | Similar-case search (a `cases` domain in Chroma, which needs no code changes because domains are data-driven) | Quick win and a demo |
| 3 | SFT data generation + QLoRA on Kaggle → GGUF | Fine-tuned model |
| 4 | `expert` and `hybrid` modes in the backend/frontend | No-RAG answering |
| 5 | `vision/` service: OCR + doc classifier + upload UI | CV module |
| 6 | Evaluation of the 4 systems + CV metrics | Results chapter |

## Verification
- **Fine-tune:** run the held-out test script `eval/run_eval.py` against all 4 configurations through LM Studio's API, and report the metric table.
- **Expert mode:** `POST /api/chat` with `mode: "expert"` returns an answer without calling retrieval. Stop the retrieval service to prove it.
- **Vision:** `curl -F file=@fir.jpg localhost:8001/ocr` returns Bangla text. The classifier is reported with accuracy and a confusion matrix on a held-out image set. Upload in the UI, then ask a question about the document.
- **Builds:** `npm run build` in `backend/` and `frontend/` still type-checks.
