/**
 * What the user picks under the chat box: which local model answers, how much effort
 * it spends, and how technical the answer is. Keep the ids in sync with
 * frontend/lib/models.ts.
 */
export const MODEL_TIERS = ['high', 'mid', 'low'] as const;
export const EFFORTS = ['low', 'mid', 'high'] as const;
export const TECHNICALITIES = ['auto', 'high', 'low'] as const;

export type ModelTier = (typeof MODEL_TIERS)[number];
export type Effort = (typeof EFFORTS)[number];
export type Technicality = (typeof TECHNICALITIES)[number];

export interface AnswerSettings {
  model: ModelTier;
  effort: Effort;
  technicality: Technicality;
}

export const DEFAULT_SETTINGS: AnswerSettings = { model: 'mid', effort: 'mid', technicality: 'auto' };

/** LM Studio model id for each tier (exact ids from http://localhost:1234/v1/models). */
const MODEL_IDS: Record<ModelTier, { env: string; fallback: string; label: string }> = {
  high: { env: 'LMSTUDIO_MODEL_HIGH', fallback: 'qwen/qwen3-next-80b-a3b-instruct', label: 'Qwen3-Next 80B' },
  mid: { env: 'LMSTUDIO_MODEL_MID', fallback: 'qwen/qwen3-30b-a3b-2507', label: 'Qwen3 30B' },
  low: { env: 'LMSTUDIO_MODEL_LOW', fallback: 'google/gemma-4-e4b', label: 'Gemma 4 E4B' },
};

export const modelId = (tier: ModelTier) =>
  process.env[MODEL_IDS[tier].env]?.trim() || MODEL_IDS[tier].fallback;
export const modelLabel = (tier: ModelTier) => MODEL_IDS[tier].label;

export interface EffortProfile {
  /** Law excerpts retrieved per search. */
  topK: number;
  /** Court decisions (case-law excerpts) added to a legal answer. */
  cases: number;
  /** Passages of the user's uploaded file put in the prompt. */
  filePassages: number;
  /** Earlier messages sent to the model. */
  history: number;
  maxTokens: number;
  temperature: number;
  /** Extra instruction describing the depth of the answer. */
  depth: string;
}

export const EFFORT: Record<Effort, EffortProfile> = {
  low: {
    cases: 1,
    topK: 3,
    filePassages: 3,
    history: 4,
    maxTokens: 1500,   // was 700 (baseline-v1): cut Qwen's Bangla answers mid-sentence
    temperature: 0.3,
    depth:
      'Effort: LOW. Give a short, direct answer (about 2-5 sentences or a few bullets). ' +
      'Cover only the main point.',
  },
  mid: {
    cases: 2,
    topK: 5,
    filePassages: 5,
    history: 6,
    maxTokens: 3000,   // was 1500 (baseline-v1)
    temperature: 0.2,
    depth:
      'Effort: MEDIUM. Give a clear, complete answer with the key conditions and penalties, ' +
      'organised in short paragraphs or bullets.',
  },
  high: {
    cases: 3,
    topK: 8,
    filePassages: 8,
    history: 10,
    maxTokens: 6000,   // was 3000 (baseline-v1)
    temperature: 0.1,
    depth:
      'Effort: HIGH. Before answering, silently work through every excerpt and decide which ' +
      'ones apply and how they interact. Then give a thorough, well-structured answer: the ' +
      'governing provisions, conditions and elements, exceptions, penalties or consequences, ' +
      'related sections, and anything the excerpts leave unclear. Use headings where helpful.',
  },
};

export const TECHNICALITY: Record<Technicality, string> = {
  auto: '',
  high:
    'Technicality: HIGH. Write for a lawyer. Use precise legal terminology, quote the exact ' +
    'statutory wording for key points, and cite the Act, year and section (and sub-section or ' +
    'clause when present) for every statement.',
  low:
    'Technicality: LOW. Write for someone with no legal background. Use plain, everyday words ' +
    'and short sentences, explain any legal term you must use, and give a simple example if ' +
    'it helps. Keep citations brief, e.g. "(Section 379)".',
};

/** Same idea for non-legal (General) answers, which have no law excerpts. */
const GENERAL_DEPTH: Record<Effort, string> = {
  low: 'Effort: LOW. Answer briefly and directly, in a few sentences.',
  mid: 'Effort: MEDIUM. Give a clear, complete answer with the key details.',
  high:
    'Effort: HIGH. Think the question through carefully before answering, then give a thorough, ' +
    'well-structured answer with reasoning, examples and edge cases. Use headings where helpful.',
};
const GENERAL_TECHNICALITY: Record<Technicality, string> = {
  auto: '',
  high: 'Technicality: HIGH. Use precise technical terminology and exact definitions, as an expert would.',
  low: 'Technicality: LOW. Use plain, everyday words and short sentences; explain any technical term.',
};

/** The extra system-prompt lines for these settings. */
export function styleLines(s: AnswerSettings, kind: 'law' | 'general' = 'law'): string[] {
  return kind === 'law'
    ? [EFFORT[s.effort].depth, TECHNICALITY[s.technicality]].filter(Boolean)
    : [GENERAL_DEPTH[s.effort], GENERAL_TECHNICALITY[s.technicality]].filter(Boolean);
}
