# Results: runs/pilot/gemma-files

- answers: 90, judged: 90 (judge qwen3-next-80b-a3b-instruct, aebea71088b8)
- test set sha256: c1c3832aeff7c338ddd150b7818c68fac7c949fa02fc3efb49fd4b9c012ee4dd, git: 0da8df29d9ec10450510a9b06fe4c10ab42fc9be
- values: mean; [95% bootstrap CI over questions]; scores 1-5, rates 0-1

### Overall

| variant | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| PILOT | 90 | 3.96 [3.00, 4.73] | 4.10 [3.22, 4.80] | 4.93 | 1.00 [1.00, 1.00] | 0.67 [0.17, 1.00] | 0.63 [0.17, 0.96] | 0.90 | 174 | 13.39 |

### By setting

| model | effort | tech | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| low | high | auto | 10 | 4.20 [3.40, 5.00] | 4.40 [3.40, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.17, 1.00] | 0.67 [0.17, 1.00] | 0.85 | 245 | 18.75 |
| low | high | high | 10 | 3.80 [2.80, 4.80] | 4.10 [3.20, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 0.86 | 296 | 20.79 |
| low | high | low | 10 | 4.00 [3.00, 4.80] | 4.00 [3.10, 4.80] | 4.80 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.50 [0.17, 0.83] | 0.83 | 235 | 18.60 |
| low | low | auto | 10 | 4.00 [3.00, 5.00] | 3.90 [2.80, 4.80] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.17, 1.00] | 0.67 [0.17, 1.00] | 0.92 | 88.00 | 7.25 |
| low | low | high | 10 | 3.80 [2.80, 4.60] | 3.90 [2.90, 4.80] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.17, 1.00] | 0.67 [0.17, 1.00] | 1.00 | 98.60 | 8.20 |
| low | low | low | 10 | 3.40 [2.40, 4.40] | 3.70 [2.70, 4.60] | 4.70 | 1.00 [1.00, 1.00] | 0.67 [0.17, 1.00] | 0.67 [0.17, 1.00] | 0.92 | 99.30 | 7.57 |
| low | mid | auto | 10 | 4.00 [3.00, 5.00] | 4.10 [3.00, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 0.85 | 153 | 12.17 |
| low | mid | high | 10 | 4.00 [3.00, 5.00] | 4.40 [3.40, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.17, 1.00] | 0.50 [0.17, 0.83] | 0.83 | 191 | 14.65 |
| low | mid | low | 10 | 4.40 [3.60, 5.00] | 4.40 [3.60, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 1.00 | 161 | 12.48 |

### By domain

| domain | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| - | 36 | 4.17 [2.50, 5.00] | 4.28 [2.83, 5.00] | 5.00 | 1.00 [1.00, 1.00] | – | – | – | 115 | 8.04 |
| labour | 36 | 4.50 [3.78, 4.94] | 4.83 [4.58, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 1.00 [1.00, 1.00] | 0.94 [0.83, 1.00] | 0.97 | 248 | 19.15 |
| land | 18 | 2.44 [1.00, 3.89] | 2.28 [1.56, 3.00] | 4.58 | 1.00 [1.00, 1.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.75 | 146 | 12.55 |

### By language

| lang | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| bn | 45 | 3.00 [1.71, 4.24] | 3.22 [2.07, 4.27] | 4.84 | 1.00 [1.00, 1.00] | 0.33 [0.00, 1.00] | 0.33 [0.00, 1.00] | 0.83 | 154 | 12.95 |
| en | 45 | 4.91 [4.82, 5.00] | 4.98 [4.93, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 1.00 [1.00, 1.00] | 0.93 [0.78, 1.00] | 0.96 | 194 | 13.82 |

### By question type

| type | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| file | 54 | 3.81 [2.56, 4.70] | 3.98 [2.76, 4.89] | 4.89 | 1.00 [1.00, 1.00] | 0.67 [0.17, 1.00] | 0.63 [0.17, 0.96] | 0.90 | 214 | 16.95 |
| file_general | 36 | 4.17 [2.50, 5.00] | 4.28 [2.83, 5.00] | 5.00 | 1.00 [1.00, 1.00] | – | – | – | 115 | 8.04 |

### By file format (file questions only; '-' = no file)

| format | lang | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|
| photo | bn | 18 | 2.56 [1.67, 3.44] | 3.28 [2.11, 4.44] | 5.00 | 1.00 [1.00, 1.00] | 1.00 | 1.00 | 1.00 | 199 | 16.69 |
| photo | en | 9 | 4.78 | 5.00 | 5.00 | 1.00 | 1.00 | 1.00 | 1.00 | 281 | 20.07 |
| scan | bn | 18 | 4.44 [3.89, 5.00] | 4.00 [3.00, 5.00] | 4.77 | 1.00 [1.00, 1.00] | 0.00 | 0.00 | 0.58 | 137 | 11.33 |
| scan | en | 9 | 5.00 | 5.00 | 5.00 | 1.00 | 1.00 | 1.00 | 1.00 | 116 | 9.13 |
| text | bn | 9 | 1.00 | 1.56 | 4.60 | 1.00 | 0.00 | 0.00 | 0.89 | 99.11 | 8.70 |
| text | en | 27 | 4.93 [4.78, 5.00] | 4.96 [4.89, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 1.00 | 0.78 | 0.87 | 192 | 13.31 |

### Routing (expected vs actual)

| expected_route | route | n | judge_correctness |
|---|---|---|---|
| general | general | 36 | 4.17 [2.50, 5.00] |
| law | law | 54 | 3.81 [2.56, 4.70] |
