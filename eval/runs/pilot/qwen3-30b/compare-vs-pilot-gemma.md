# runs/pilot/qwen3-30b minus runs/pilot/gemma (paired, 180 question-setting pairs)

| metric | A | B | B - A [95% CI] |
|---|---|---|---|
| judge_correctness | 3.64 | 3.74 | 0.10 [-0.21, 0.42] |
| judge_faithfulness | 4.57 | 4.28 | -0.29 [-0.74, 0.09] |
| judge_technicality_fit | 4.94 | 4.88 | -0.06 [-0.19, 0.07] |
| route_ok | 0.95 | 0.95 | 0.00 [0.00, 0.00] |
| ctx_hit_group | 0.59 | 0.59 | 0.00 [0.00, 0.00] |
| cite_recall | 0.63 | 0.62 | -0.01 [-0.07, 0.06] |
| cite_precision | 0.94 | 0.85 | -0.08 [-0.17, -0.01] |
| words | 155 | 119 | -35.37 [-64.94, -5.34] |
| seconds | 12.15 | 32.38 | 20.23 [10.67, 30.12] |

correctness: B better 19, worse 11, equal 150
