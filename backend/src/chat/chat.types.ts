export interface Source {
  id: string;
  /** Human label of the knowledge base this came from, e.g. "Criminal law" */
  domain: string;
  act: string;
  year: string;
  actNo: string;
  section: string;
  title: string;
  chapter: string;
  score: number;
  excerpt: string;
  /** "case" = a court decision (fields below are set); "act" or missing = a section of an Act. */
  kind?: 'act' | 'case';
  /** e.g. "Shahin Vs. The State" */
  caseTitle?: string;
  /** e.g. "19 SCOB [2024] AD 148" */
  citation?: string;
  /** "Appellate Division" | "High Court Division" */
  court?: string;
  judge?: string;
  decided?: string;
  /** Official PDF on supremecourt.gov.bd, opened at the case's first page. */
  url?: string;
}

/** One searchable knowledge base = one .jsonl file in backend/data. */
export interface Domain {
  id: string;
  label: string;
  description: string;
  chunks: number;
  acts: string[];
  /** Number of court decisions (case-law database only). */
  cases?: number;
}

/** Which model / effort / technicality produced an answer; stored and shown in the UI. */
export interface AnswerMeta {
  model: string;
  modelLabel: string;
  effort: string;
  technicality: string;
}

/** A file attached to a user message (no text; that stays in users/{uid}/uploads). */
export interface AttachmentRef {
  id: string;
  name: string;
  kind: 'pdf' | 'image' | 'file';
}

/** How a question was handled; stored with the answer and shown in the UI. */
export interface RouteInfo {
  type: 'law' | 'general' | 'unsupported';
  domains: { id: string; label: string }[];
}
