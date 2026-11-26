# Results: runs/N0/qwen3-30b

- answers: 1095, judged: 1095 (judge qwen3-next-80b-a3b-instruct, aebea71088b8)
- test set sha256: e085d165b541068da649ad882324027141794fcf404636646c81d08db73c0f7d, git: 10187d1d48483555f140f8995f8c32185c87b42c
- values: mean; [95% bootstrap CI over questions]; scores 1-5, rates 0-1

### Overall

| variant | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| N0 | 1095 | 2.77 [2.65, 2.90] | – | 4.37 | – | 0.00 [0.00, 0.00] | 0.06 [0.04, 0.07] | 0.00 | 206 | 20.20 |

### By setting

| model | effort | tech | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mid | high | auto | 365 | 2.83 [2.68, 2.99] | – | 4.70 | – | 0.00 [0.00, 0.00] | 0.11 [0.07, 0.14] | 0.00 | 416 | 40.96 |
| mid | low | auto | 365 | 2.66 [2.53, 2.79] | – | 3.00 | – | 0.00 [0.00, 0.00] | 0.02 [0.01, 0.04] | 0.00 | 53.41 | 4.94 |
| mid | mid | auto | 365 | 2.82 [2.68, 2.97] | – | 4.07 | – | 0.00 [0.00, 0.00] | 0.04 [0.02, 0.06] | 0.00 | 150 | 14.69 |

### By domain

| domain | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| - | 48 | 2.92 [1.92, 3.92] | – | 1.00 | – | – | – | – | 169 | 14.53 |
| cases | 108 | 3.41 [2.89, 3.89] | – | 4.79 | – | 0.00 [0.00, 0.00] | 0.31 [0.20, 0.41] | 0.00 | 204 | 19.60 |
| children_women | 120 | 2.83 [2.52, 3.15] | – | 4.65 | – | 0.00 [0.00, 0.00] | 0.03 [0.00, 0.07] | 0.00 | 218 | 22.16 |
| criminal | 153 | 3.11 [2.79, 3.41] | – | 4.67 | – | 0.00 [0.00, 0.00] | 0.07 [0.02, 0.14] | 0.00 | 224 | 20.57 |
| education | 93 | 2.38 [2.03, 2.74] | – | 2.64 | – | 0.00 [0.00, 0.00] | 0.01 [0.00, 0.03] | 0.00 | 170 | 16.17 |
| family | 114 | 3.04 [2.63, 3.44] | – | 4.58 | – | 0.00 [0.00, 0.00] | 0.02 [0.00, 0.05] | 0.00 | 230 | 22.56 |
| labour | 132 | 2.74 [2.38, 3.08] | – | 4.20 | – | 0.00 [0.00, 0.00] | 0.01 [0.00, 0.02] | 0.00 | 196 | 20.12 |
| land | 105 | 2.30 [1.90, 2.73] | – | 3.42 | – | 0.00 [0.00, 0.00] | 0.04 [0.00, 0.09] | 0.00 | 215 | 22.37 |
| tax | 111 | 2.39 [1.95, 2.82] | – | 4.84 | – | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 | 212 | 19.54 |
| uncategorized | 111 | 2.48 [2.15, 2.84] | – | 4.33 | – | 0.00 [0.00, 0.00] | 0.03 [0.00, 0.05] | 0.00 | 193 | 20.26 |

### By language

| lang | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| bn | 540 | 2.48 [2.30, 2.64] | – | 4.40 | – | 0.00 [0.00, 0.00] | 0.04 [0.02, 0.06] | 0.00 | 197 | 32.54 |
| en | 555 | 3.06 [2.86, 3.26] | – | 4.35 | – | 0.00 [0.00, 0.00] | 0.07 [0.04, 0.10] | 0.00 | 215 | 8.19 |

### By question type

| type | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| case_law | 18 | 3.11 [2.11, 4.11] | – | 4.50 | – | 0.00 [0.00, 0.00] | 0.22 [0.06, 0.44] | 0.00 | 170 | 15.92 |
| colloquial | 30 | 1.93 [1.47, 2.33] | – | 3.50 | – | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 | 182 | 24.73 |
| follow_up | 30 | 3.17 [2.20, 4.13] | – | 5.00 | – | 0.00 [0.00, 0.00] | 0.30 [0.10, 0.53] | 0.00 | 137 | 12.80 |
| general | 24 | 4.83 [4.50, 5.00] | – | 1.00 | – | – | – | – | 131 | 10.98 |
| generated | 915 | 2.76 [2.63, 2.90] | – | 4.37 | – | 0.00 [0.00, 0.00] | 0.04 [0.03, 0.06] | 0.00 | 212 | 20.76 |
| multi_section | 24 | 2.67 [1.75, 3.50] | – | 4.80 | – | 0.00 [0.00, 0.00] | 0.12 [0.04, 0.25] | 0.00 | 246 | 22.46 |
| out_of_scope | 24 | 1.00 [1.00, 1.00] | – | – | – | – | – | – | 207 | 18.07 |
| typo | 30 | 3.07 [2.40, 3.80] | – | 5.00 | – | 0.00 [0.00, 0.00] | 0.17 [0.00, 0.40] | 0.00 | 176 | 15.67 |

### By file format (file questions only; '-' = no file)

| format | lang | n | judge_correctness | judge_faithfulness | judge_technicality_fit | route_ok | ctx_hit_group | cite_recall | cite_precision | words | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|
| - | bn | 540 | 2.48 [2.30, 2.64] | – | 4.40 | – | 0.00 [0.00, 0.00] | 0.04 [0.02, 0.06] | 0.00 | 197 | 32.54 |
| - | en | 555 | 3.06 [2.86, 3.26] | – | 4.35 | – | 0.00 [0.00, 0.00] | 0.07 [0.04, 0.10] | 0.00 | 215 | 8.19 |

### Routing (expected vs actual)

| expected_route | route | n | judge_correctness |
|---|---|---|---|
| general | general | 24 | 4.83 [4.50, 5.00] |
| law | general | 1047 | 2.76 [2.64, 2.89] |
| unsupported | general | 24 | 1.00 [1.00, 1.00] |
