// Answer settings shown in the model menu under the chat box.
// Keep the ids in sync with backend/src/chat/answer.config.ts.

export type ModelTier = 'high' | 'mid' | 'low';
export type Effort = 'low' | 'mid' | 'high';
export type Technicality = 'auto' | 'high' | 'low';
export type AnswerSettings = { model: ModelTier; effort: Effort; technicality: Technicality };

export const DEFAULT_SETTINGS: AnswerSettings = { model: 'mid', effort: 'mid', technicality: 'auto' };

export const MODELS: { id: ModelTier; name: string; short: string; tier: string; hint: string }[] = [
  { id: 'high', name: 'Qwen3-Next 80B', short: 'Qwen3-Next 80B', tier: 'High', hint: 'Most capable, for complex legal questions' },
  { id: 'mid', name: 'Qwen3 30B Instruct', short: 'Qwen3 30B', tier: 'Mid', hint: 'Fast and accurate for everyday questions' },
  { id: 'low', name: 'Gemma 4 E4B', short: 'Gemma 4 E4B', tier: 'Low', hint: 'Fastest, for quick and simple answers' },
];

export const EFFORTS: { id: Effort; label: string; hint: string }[] = [
  { id: 'low', label: 'Low', hint: 'Short answers from the top 3 excerpts' },
  { id: 'mid', label: 'Mid', hint: 'Balanced answers from the top 5 excerpts' },
  { id: 'high', label: 'High', hint: 'In-depth answers from the top 8 excerpts' },
];

export const TECHNICALITIES: { id: Technicality; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Default style' },
  { id: 'high', label: 'High', hint: 'Precise legal terms, exact wording and citations' },
  { id: 'low', label: 'Low', hint: 'Plain language anyone can follow' },
];

export function isSettings(v: unknown): v is AnswerSettings {
  const s = v as AnswerSettings;
  return (
    !!s &&
    MODELS.some((m) => m.id === s.model) &&
    EFFORTS.some((e) => e.id === s.effort) &&
    TECHNICALITIES.some((t) => t.id === s.technicality)
  );
}
