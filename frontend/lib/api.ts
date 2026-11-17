import { getFirebaseAuth } from './firebase';
import type { AnswerSettings } from './models';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export type Source = {
  id: string;
  domain: string;
  act: string;
  year: string;
  actNo: string;
  section: string;
  title: string;
  chapter: string;
  score: number;
  excerpt: string;
};
export type RouteInfo = {
  type: 'law' | 'general' | 'unsupported';
  domains: { id: string; label: string }[];
};
/** Which model / effort / technicality produced an answer (backend chat.types.ts). */
export type AnswerMeta = { model: string; modelLabel: string; effort: string; technicality: string };
/** A file attached to a message or chat (backend chat.types.ts AttachmentRef). */
export type AttachmentRef = { id: string; name: string; kind: FileKind };
export type FileKind = 'pdf' | 'image' | 'file';
/** Returned by POST /files after the text was extracted. */
export type AttachmentInfo = AttachmentRef & { pages: number; method: string; chars: number; notes: string[] };
export type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  route?: RouteInfo | null;
  meta?: AnswerMeta | null;
  attachment?: AttachmentRef | null;
  /** Client only: the answer is still arriving / being typed out. */
  streaming?: boolean;
  typing?: boolean;
};
/** This hour's token usage (backend usage.service.ts). resetAt null = window not started. */
export type UsageStatus = { used: number; limit: number; resetAt: number | null };
export type ChatSummary = { id: string; title: string; updatedAt: number };
/** auto = the router decides; general = no law search; law = search one database ("Specific"). */
export type Mode = 'auto' | 'general' | 'law';
export type LawDomain = { id: string; label: string; description: string };

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isForm = init.body instanceof FormData; // the browser sets the multipart header
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('You are signed out. Please sign in again.');
  const token = await user.getIdToken(); // refreshed automatically when expired

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

async function errorFrom(res: Response): Promise<Error> {
  const data = await res.json().catch(() => ({}));
  const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
  return new Error(msg || 'Something went wrong. Try again.');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

export const getUsage = () => request<UsageStatus>('/usage');

export const listChats = () => request<ChatSummary[]>('/chats');

export const getChat = (id: string) =>
  request<{ id: string; title: string; attachment: AttachmentRef | null; messages: Message[] }>(
    `/chats/${id}`,
  );

export const deleteChat = (id: string) =>
  request<{ deleted: boolean }>(`/chats/${id}`, { method: 'DELETE' });

export const listDomains = () => request<LawDomain[]>('/domains');

/** Uploads a PDF or image; the server extracts its text (Bangla + English OCR). */
export function uploadFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<AttachmentInfo>('/files', { method: 'POST', body: form });
}

export type SendOptions = {
  mode: Mode;
  domain?: string | null;
  settings: AnswerSettings;
  attachmentId?: string | null;
};

const body = (chatId: string | null, message: string, o: SendOptions) =>
  JSON.stringify({
    ...(chatId ? { chatId } : {}),
    message,
    mode: o.mode,
    ...(o.mode === 'law' && o.domain ? { domain: o.domain } : {}),
    ...o.settings,
    ...(o.attachmentId ? { attachmentId: o.attachmentId } : {}),
  });

export type ChatResult = {
  chatId: string;
  title: string;
  updatedAt: number;
  reply: string;
  sources: Source[];
  route: RouteInfo;
  meta: AnswerMeta;
  attachment: AttachmentRef | null;
  usage: UsageStatus;
};

export const sendMessage = (chatId: string | null, message: string, o: SendOptions) =>
  request<ChatResult>('/chat', { method: 'POST', body: body(chatId, message, o) });

/** Thrown when an answer fails after streaming began; carries the updated usage. */
export class StreamError extends Error {
  constructor(message: string, readonly usage: UsageStatus | null) {
    super(message);
  }
}

/**
 * Streams an answer (POST /chat/stream, newline-delimited JSON). Calls `onStart` once the
 * route and sources are known, then `onDelta` with each new piece of text. Resolves when the
 * answer is saved.
 */
export async function streamMessage(
  chatId: string | null,
  message: string,
  o: SendOptions,
  on: {
    onStart: (s: { route: RouteInfo; sources: Source[]; meta: AnswerMeta }) => void;
    onDelta: (text: string) => void;
  },
): Promise<ChatResult> {
  const res = await authFetch('/chat/stream', { method: 'POST', body: body(chatId, message, o) });
  if (!res.ok) throw await errorFrom(res);
  if (!res.body) throw new Error('Streaming is not supported by this browser.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.type === 'start') on.onStart(ev);
      else if (ev.type === 'delta') on.onDelta(ev.text);
      else if (ev.type === 'done') return ev as ChatResult;
      else if (ev.type === 'error') throw new StreamError(ev.message, ev.usage ?? null);
    }
    if (done) break;
  }
  throw new Error('The connection closed before the answer finished. Try again.');
}
