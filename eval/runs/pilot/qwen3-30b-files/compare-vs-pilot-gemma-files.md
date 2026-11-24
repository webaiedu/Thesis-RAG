# runs/pilot/qwen3-30b-files minus runs/pilot/gemma-files (paired, 90 question-setting pairs)

| metric | A | B | B - A [95% CI] |
|---|---|---|---|
| judge_correctness | 3.96 | 3.76 | -0.20 [-0.71, 0.29] |
| judge_faithfulness | 4.33 | 3.50 | -0.83 [-1.44, -0.29] |
| judge_technicality_fit | 4.89 | 4.88 | 0.00 [-0.09, 0.09] |
| route_ok | 1.00 | 1.00 | 0.00 [0.00, 0.00] |
| ctx_hit_group | 0.67 | 0.67 | 0.00 [0.00, 0.00] |
| cite_recall | 0.63 | 0.74 | 0.11 [-0.02, 0.26] |
| cite_precision | 0.85 | 0.78 | -0.07 [-0.16, -0.01] |
| words | 181 | 148 | -33.04 [-81.17, 7.27] |
| seconds | 13.55 | 36.40 | 22.85 [11.59, 35.70] |

correctness: B better 10, worse 20, equal 60
