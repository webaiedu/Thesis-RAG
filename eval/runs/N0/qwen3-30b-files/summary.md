# Results: runs/N0/qwen3-30b-files

- answers: 228, judged: 228 (judge qwen3-next-80b-a3b-instruct, aebea71088b8)
- test set sha256: 1e608e56e8816d8038f6c4b8fbd3a392d7f20b5e770feb1efb50f90b8ee86f53, git: 10187d1d48483555f140f8995f8c32185c87b42c
- values: mean; [95% bootstrap CI over questions]; scores 1-5, rates 0-1

### Overall

| variant | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| N0 | 228 | 2.72 [2.39, 3.03] | 2.18 [1.86, 2.51] | 4.78 | – | 0.00 [0.00, 0.00] | 0.11 [0.05, 0.16] | 0.00 | 214 | 21.54 |

### By setting

| model | effort | tech | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mid | high | auto | 76 | 2.61 [2.26, 2.95] | 1.99 [1.66, 2.34] | 4.86 | – | 0.00 [0.00, 0.00] | 0.14 [0.07, 0.22] | 0.00 | 405 | 40.38 |
| mid | low | auto | 76 | 2.84 [2.47, 3.18] | 2.41 [2.03, 2.82] | 4.17 | – | 0.00 [0.00, 0.00] | 0.08 [0.03, 0.15] | 0.00 | 73.92 | 7.67 |
| mid | mid | auto | 76 | 2.71 [2.37, 3.05] | 2.14 [1.78, 2.54] | 5.00 | – | 0.00 [0.00, 0.00] | 0.10 [0.03, 0.17] | 0.00 | 164 | 16.56 |

### By domain

| domain | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| - | 12 | 4.00 [2.00, 5.00] | 4.00 [2.00, 5.00] | – | – | – | – | – | 57.42 | 5.99 |
| children_women | 18 | 1.89 [1.44, 2.33] | 1.67 [1.00, 3.00] | – | – | 0.00 [0.00, 0.00] | 0.06 [0.00, 0.17] | 0.00 | 206 | 33.85 |
| criminal | 18 | 4.11 [3.33, 4.78] | 3.00 [1.67, 4.33] | 5.00 | – | 0.00 [0.00, 0.00] | 0.17 [0.06, 0.28] | 0.00 | 271 | 10.55 |
| family | 36 | 2.72 [2.11, 3.33] | 1.67 [1.25, 2.17] | 5.00 | – | 0.00 [0.00, 0.00] | 0.33 [0.08, 0.58] | 0.00 | 247 | 24.12 |
| labour | 54 | 2.59 [2.15, 3.00] | 1.69 [1.24, 2.15] | 5.00 | – | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 | 260 | 19.38 |
| land | 18 | 3.22 [1.67, 4.56] | 3.00 [1.56, 4.33] | 4.33 | – | 0.00 [0.00, 0.00] | 0.11 [0.00, 0.28] | 0.00 | 133 | 23.95 |
| tax | 36 | 3.28 [2.39, 4.00] | 3.44 [2.89, 4.00] | 3.50 | – | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 | 154 | 20.12 |
| uncategorized | 36 | 1.39 [1.11, 1.67] | 1.00 [1.00, 1.00] | – | – | 0.00 [0.00, 0.00] | 0.14 [0.03, 0.28] | 0.00 | 242 | 26.92 |

### By language

| lang | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| bn | 114 | 2.37 [1.95, 2.81] | 2.13 [1.69, 2.61] | 4.00 | – | 0.00 [0.00, 0.00] | 0.18 [0.07, 0.29] | 0.00 | 198 | 33.46 |
| en | 114 | 3.07 [2.65, 3.49] | 2.23 [1.76, 2.73] | 5.00 | – | 0.00 [0.00, 0.00] | 0.04 [0.01, 0.07] | 0.00 | 231 | 9.62 |

### By question type

| type | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| file | 216 | 2.65 [2.35, 2.96] | 2.08 [1.77, 2.38] | 4.78 | – | 0.00 [0.00, 0.00] | 0.11 [0.05, 0.16] | 0.00 | 223 | 22.40 |
| file_general | 12 | 4.00 [2.00, 5.00] | 4.00 [2.00, 5.00] | – | – | – | – | – | 57.42 | 5.99 |

### By file format (file questions only; '-' = no file)

| format | lang | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|
| photo | bn | 39 | 1.97 [1.26, 2.69] | 2.10 [1.36, 2.90] | 3.33 | – | 0.00 [0.00, 0.00] | 0.22 [0.06, 0.44] | 0.00 | 202 | 34.74 |
| photo | en | 36 | 3.06 [2.28, 3.83] | 2.28 [1.39, 3.19] | 5.00 | – | 0.00 [0.00, 0.00] | 0.03 [0.00, 0.08] | 0.00 | 227 | 9.43 |
| scan | bn | 39 | 2.74 [2.13, 3.41] | 2.23 [1.51, 3.05] | 4.00 | – | 0.00 [0.00, 0.00] | 0.22 [0.03, 0.44] | 0.00 | 201 | 33.61 |
| scan | en | 36 | 2.83 [2.17, 3.50] | 2.00 [1.31, 2.78] | 5.00 | – | 0.00 [0.00, 0.00] | 0.03 [0.00, 0.08] | 0.00 | 244 | 10.21 |
| text | bn | 36 | 2.39 [1.67, 3.11] | 2.06 [1.28, 2.94] | 5.00 | – | 0.00 [0.00, 0.00] | 0.08 [0.00, 0.22] | 0.00 | 191 | 31.91 |
| text | en | 42 | 3.29 [2.62, 4.05] | 2.38 [1.52, 3.31] | 5.00 | – | 0.00 [0.00, 0.00] | 0.06 [0.00, 0.14] | 0.00 | 222 | 9.26 |

### Routing (expected vs actual)

| expected_route | route | n | judge_correctness |
|---|---|---|---|
| general | general | 12 | 4.00 [2.00, 5.00] |
| law | general | 216 | 2.65 [2.35, 2.96] |
