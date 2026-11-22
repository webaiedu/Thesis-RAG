# Results: runs/pilot/gemma-files

- answers: 90, judged: 90 (judge qwen3-next-80b-a3b-instruct, aebea71088b8)
- test set sha256: c1c3832aeff7c338ddd150b7818c68fac7c949fa02fc3efb49fd4b9c012ee4dd, git: 9d82732a18b9daccf763ddee989be332e0fe1eae
- values: mean; [95% bootstrap CI over questions]; scores 1-5, rates 0-1

### Overall

| variant | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| PILOT | 90 | 3.96 [3.04, 4.76] | 4.33 [3.64, 4.87] | 4.89 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.63 [0.30, 0.96] | 0.85 | 181 | 13.55 |

### By setting

| model | effort | tech | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| low | high | auto | 10 | 4.20 [3.40, 5.00] | 4.80 [4.40, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 0.79 | 257 | 19.19 |
| low | high | high | 10 | 3.80 [2.80, 4.80] | 4.40 [3.50, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 0.83 | 295 | 20.00 |
| low | high | low | 10 | 4.00 [3.20, 4.80] | 4.40 [3.70, 5.00] | 4.90 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.50 [0.17, 0.83] | 0.87 | 240 | 18.37 |
| low | low | auto | 10 | 4.00 [3.00, 5.00] | 4.00 [3.10, 4.80] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 0.92 | 88.90 | 7.24 |
| low | low | high | 10 | 3.80 [2.60, 4.80] | 4.00 [3.00, 4.80] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 1.00 | 94.90 | 7.94 |
| low | low | low | 10 | 3.40 [2.60, 4.20] | 3.70 [2.70, 4.60] | 4.50 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 0.86 | 105 | 8.03 |
| low | mid | auto | 10 | 4.00 [3.00, 5.00] | 4.50 [3.60, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 0.75 | 172 | 13.05 |
| low | mid | high | 10 | 4.00 [3.00, 5.00] | 4.40 [3.60, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.50 [0.17, 0.83] | 0.73 | 201 | 14.96 |
| low | mid | low | 10 | 4.40 [3.60, 5.00] | 4.80 [4.40, 5.00] | 4.80 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.67 [0.33, 1.00] | 0.89 | 173 | 13.17 |

### By domain

| domain | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| - | 36 | 4.17 [2.50, 5.00] | 4.28 [2.83, 5.00] | 5.00 | 1.00 [1.00, 1.00] | – | – | – | 115 | 8.04 |
| labour | 36 | 4.50 [3.78, 4.94] | 4.83 [4.58, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 1.00 [1.00, 1.00] | 0.94 [0.83, 1.00] | 0.97 | 248 | 19.15 |
| land | 18 | 2.44 [1.00, 3.89] | 3.44 [3.00, 3.89] | 4.38 | 1.00 [1.00, 1.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.60 | 178 | 13.37 |

### By language

| lang | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| bn | 45 | 3.00 [1.76, 4.24] | 3.69 [2.82, 4.56] | 4.76 | 1.00 [1.00, 1.00] | 0.33 [0.00, 1.00] | 0.33 [0.00, 1.00] | 0.74 | 167 | 13.27 |
| en | 45 | 4.91 [4.82, 5.00] | 4.98 [4.93, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 1.00 [1.00, 1.00] | 0.93 [0.78, 1.00] | 0.96 | 194 | 13.82 |

### By question type

| type | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| file | 54 | 3.81 [2.52, 4.70] | 4.37 [3.78, 4.89] | 4.83 | 1.00 [1.00, 1.00] | 0.67 [0.33, 1.00] | 0.63 [0.30, 0.96] | 0.85 | 225 | 17.22 |
| file_general | 36 | 4.17 [2.50, 5.00] | 4.28 [2.83, 5.00] | 5.00 | 1.00 [1.00, 1.00] | – | – | – | 115 | 8.04 |

### By file format (file questions only; '-' = no file)

| format | lang | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|
| photo | bn | 18 | 2.56 [1.67, 3.44] | 3.28 [2.11, 4.44] | 5.00 | 1.00 [1.00, 1.00] | 1.00 | 1.00 | 1.00 | 199 | 16.69 |
| photo | en | 9 | 4.78 | 5.00 | 5.00 | 1.00 | 1.00 | 1.00 | 1.00 | 281 | 20.07 |
| scan | bn | 18 | 4.44 [3.89, 5.00] | 4.00 [3.00, 5.00] | 4.77 | 1.00 [1.00, 1.00] | 0.00 | 0.00 | 0.58 | 137 | 11.33 |
| scan | en | 9 | 5.00 | 5.00 | 5.00 | 1.00 | 1.00 | 1.00 | 1.00 | 116 | 9.13 |
| text | bn | 9 | 1.00 | 3.89 | 4.17 | 1.00 | 0.00 | 0.00 | 0.61 | 165 | 10.34 |
| text | en | 27 | 4.93 [4.78, 5.00] | 4.96 [4.89, 5.00] | 5.00 | 1.00 [1.00, 1.00] | 1.00 | 0.78 | 0.87 | 192 | 13.31 |

### Routing (expected vs actual)

| expected_route | route | n | judge_correctness |
|---|---|---|---|
| general | general | 36 | 4.17 [2.50, 5.00] |
| law | law | 54 | 3.81 [2.52, 4.70] |
