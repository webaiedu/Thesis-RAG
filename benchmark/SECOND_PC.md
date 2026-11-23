# Using a second DGX Spark

Both PCs are DGX Spark (same hardware), each used 09:15–16:30 with nothing overnight.

## Who does what
| PC | Answer runs (before **and** after fine-tuning) | Other work |
|---|---|---|
| **PC A** (current DGX) | **Gemma 4 E4B**: B0 (done 22 Nov). **Qwen3-Next 80B**: B0 (from 24 Nov, [before-qwen3-next-80b.md](before-qwen3-next-80b.md)) | the 80B judge; gold standard (Claude's ratings); training questions; fine-tuning |
| **PC B** (new DGX, folder `Thesis-RAG PC-B`) | **Qwen3 30B**: B0 | judging Qwen 30B's answers with its own 80B (**same file hash as PC A**, see step 3) |

**From 23 Nov: three models, and only the best one is fine-tuned** (chosen after the gold-standard check, `eval/GOLD_GUIDE.md`). The "after fine-tuning" runs are then done only for that model, on the PC that ran its B0.

**Why split by model:**
- Speed is compared before vs after fine-tuning. Each answer model must therefore run on the **same machine** both times. The two PCs are the same hardware, but not mixing them removes any doubt.
- The judge's scores don't depend on which PC runs it. Only the model and the prompt in `eval/config.json` count.

## One-time setup of PC B (~1–1.5 h, first morning)
1. **Code.** The folder name has a space, so always put the path in quotes:
   ```bash
   cd ~/Desktop   # or wherever PC B keeps projects
   git clone https://github.com/webaiedu/Thesis-RAG.git "Thesis-RAG PC-B"
   cd "Thesis-RAG PC-B" && git checkout benchmark-setup
   ```
   **About the space in the path:** scripts inside a Python venv have a path-based first line (`#!`), and that line breaks when the path contains a space. So always call Python tools as `python -m pip ...` and `python -m uvicorn ...`, never as bare `pip` or `uvicorn`. If anything still fails because of the space, use the folder `Thesis-RAG-PC-B` instead; only the folder name differs, nothing else.
2. **Copy the files that aren't in Git from PC A.** `git clone` brings the code, test sets, law data (`backend/data`) and all results. It does **not** bring these:

   | Missing after clone | Size | What to do |
   |---|---|---|
   | `retrieval/chroma_db/` (search index) | 904 MB | **Copy from PC A.** Don't rebuild with `ingest.py` |
   | `retrieval/.env`, `backend/.env` | tiny | **Copy from PC A.** Never commit them |
   | Qwen3 30B GGUF | 18.6 GB | Download in LM Studio. If its sha256 (step 3) differs, copy PC A's file |
   | bge-m3 and EasyOCR models | ~2.5 GB | Nothing to do: they download on first use. Step 5 proves they match |

   Not needed: `backend/firebase-service-account.json` (the runner doesn't use Firebase).

   **Option A, USB drive (simplest).**
   1. On PC A, copy to the drive `~/Desktop/Thesis-RAG/retrieval/chroma_db` (the whole folder), `retrieval/.env` and `backend/.env`. Press Ctrl+H in the file manager to see hidden `.env` files.
   2. On PC B, put them in the same places inside `Thesis-RAG PC-B/`.

   **Option B, network.** PC A is `spark-8ab1`, IP `172.16.60.57`, user `aiub`. SSH is off by default.
   ```bash
   # once, on PC A (asks for the password):
   sudo apt install -y openssh-server && sudo systemctl enable --now ssh
   # on PC B, inside the cloned folder:
   cd ~/Desktop/"Thesis-RAG PC-B"
   rsync -a aiub@172.16.60.57:Desktop/Thesis-RAG/retrieval/chroma_db retrieval/
   scp aiub@172.16.60.57:Desktop/Thesis-RAG/retrieval/.env retrieval/
   scp aiub@172.16.60.57:Desktop/Thesis-RAG/backend/.env backend/
   # only if the Qwen hash doesn't match (step 3):
   scp aiub@172.16.60.57:.lmstudio/models/lmstudio-community/Qwen3-30B-A3B-Instruct-2507-GGUF/Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf \
       ~/.lmstudio/models/lmstudio-community/Qwen3-30B-A3B-Instruct-2507-GGUF/
   ```
   If PC B's folder isn't in `~/Desktop`, adjust the path. The IP can change; check it on PC A with `hostname -I`.

3. **Check the model files are identical.** Run `sha256sum` on PC B. It must print:

   | file | sha256 |
   |---|---|
   | `Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf` | `88168cc35481e44b7d3d03ce79f59a90d15197e4d633006555a0bc44c57886d8` |
   | `gemma-4-E4B-it-Q4_K_M.gguf` | `0ffb122c8b6921f13cbc34186e052524d0b5803b17f4867b7197a561400b3770` |
   | `mmproj-gemma-4-E4B-it-BF16.gguf` | `bdfc4935857658dfdc8d1adebfa3897c2fec8b3323410f4f73ade36d6efa02be` |
   | `Qwen3-Next-80B-A3B-Instruct-Q4_K_M.gguf` (lmstudio-community, 48.5 GB; the judge) | `eeece92fb61a7810d58a76bf211cb38331b74945e277921cd3fa7b8b575a4472` |

   **The 80B must match before PC B judges anything:** the judge must be the identical file on both PCs, or PC B's scores can't be compared with PC A's.

4. **Software** (as on PC A):
   - **LM Studio:** the same version if possible.
   - **Node 22** in `~/.local/node-v22.20.0-linux-arm64`, then `cd backend && npm install`.
   - **Python 3.12 venv:**
     ```bash
     cd "Thesis-RAG PC-B/retrieval" && python3.12 -m venv .venv && source .venv/bin/activate
     python -m pip install -r requirements.txt
     # then pin PC A's exact torch/torchvision (requirements.txt pulls a non-matching torchvision):
     python -m pip install "torch==2.14.1" --index-url https://download.pytorch.org/whl/cu130
     python -m pip install "torchvision==0.29.2" --no-deps      # from normal PyPI: not on the cu130 index
     python -c "import torch, torchvision; print(torch.__version__, torchvision.__version__, torch.cuda.is_available())"
     # must print: 2.14.1+cu130 0.29.2+cu132 True   (the same as PC A)
     ```
     **Not the cu128 index:** on this hardware it gave a CPU-only torch (corrected 23 Nov). If it still prints `False` with the right versions, the cause is the NVIDIA driver: `nvidia-smi` must work and show driver 580 or newer (PC A: 580.178.04, kernel 7.0.0-1025-nvidia). Update the system and reboot.
5. **Verify the search is identical to PC A.** Start the retrieval server (`cd retrieval && source .venv/bin/activate && python -m uvicorn server:app --port 8000`), then in a second terminal:
   ```bash
   cd eval && python eval_retrieval.py --url http://localhost:8000 --test data/test.jsonl --k 3,5,8,10 --out /tmp/retrieval-pcB.json
   ```
   The "overall" lines must equal `eval/runs/B0/retrieval.json` from PC A: all-domains hit@5 **0.714**, hit@10 **0.802**. If they differ, the index or the embedding model differs: stop and copy them again.

## Daily routine on both PCs
- **09:15:** `git pull` first.
- **16:15:** commit **only your own run folders**, then `git push`:
  - PC A: `eval/runs/*/gemma*`, judgements, reports;
  - PC B: `eval/runs/*/qwen3-30b*`.
- **Don't change the shared files on PC B:**
  - `eval/runs/route-cache.jsonl` and `eval/runs/file-cache.jsonl` already cover every test question, so the runner only reads them. If `git status` shows them changed on PC B, tell Claude before committing.
  - Don't edit code, prompts or test sets on either PC: the baseline is `baseline-v1`.

## Plan from 23 Nov
| Day | PC A | PC B |
|---|---|---|
| 23 Nov | Load the 80B. Judge the Qwen pilot + Gemma B0 (~2.9 h), reports. Then start training-question generation with the same 80B (`make_questions.py --split train`, resumable). | Setup (~1–1.5 h), verify search. Load **only Qwen 30B** (context 49152, Parallel 4). Then **Qwen B0 answers** (law, ~4.5 h of the ~7.5 h). |
| 24 Nov | Training questions (continue); fine-tuning preparation. | Finish Qwen B0 law answers (~3 h) + files (~1.8 h). Push. If time is left, unload Qwen, load the 80B and start judging Qwen B0. |
| 25 Nov | Pull PC B's results; Gemma-vs-Qwen comparison. **Before fine-tuning:** the team recheck. | Finish judging Qwen B0 (~2.7 h total), `score.py report runs/B0/qwen3-30b` (+ `-files`), push. |

So the "before fine-tuning" part ends on **25 Nov**, instead of about 4 days on one PC.

## Working with Claude Code on PC B
Open Claude Code in the `Thesis-RAG PC-B` folder. It reads `CLAUDE.md` and `planning/NEXT_STEPS.md`, which hold the full state, so it needs no memory from PC A. The ready-made start prompt for each PC is in `planning/NEXT_STEPS.md` → "Start prompts".
