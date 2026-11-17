'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AnswerMeta, AttachmentInfo, AttachmentRef, ChatSummary, FileKind, LawDomain, Message, Mode, RouteInfo, Source,
  StreamError, UsageStatus, getChat, getUsage, listDomains, streamMessage, uploadFile,
} from '@/lib/api';
import { BOT_NAME } from '@/lib/brand';
import { AnswerSettings, DEFAULT_SETTINGS, EFFORTS, MODELS, isSettings } from '@/lib/models';
import AttachMenu from './AttachMenu';
import {
  BookIcon, CheckIcon, CloseIcon, CopyIcon, FileIcon, ImageIcon, InfoIcon, MenuIcon, PaperclipIcon,
  RetryIcon, ScaleIcon, SendIcon, SparkIcon,
} from './Icons';
import ModelPicker from './ModelPicker';
import ModePicker from './ModePicker';
import ThemeToggle from './ThemeToggle';
import TypedAnswer from './TypedAnswer';
import UsageMeter from './UsageMeter';

const MAX_LEN = 8000;
const MODE_KEY = 'answer-mode'; // remembered choice: { mode, domain }
const SETTINGS_KEY = 'answer-settings'; // remembered model / effort / technicality
const MAX_FILE = 20 * 1024 * 1024;
const FILE_ONLY_PROMPT = 'Summarize this file and point out anything legally important.';

/** A file chosen for the next message: being read, ready, or failed. */
type Pending =
  | { status: 'uploading'; name: string; kind: FileKind }
  | { status: 'ready'; name: string; kind: FileKind; info: AttachmentInfo }
  | { status: 'error'; name: string; kind: FileKind; error: string };

const kindOf = (f: File): FileKind =>
  f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    ? 'pdf'
    : f.type.startsWith('image/') || /\.(heic|heif|avif)$/i.test(f.name)
      ? 'image'
      : 'file';

/** "Reading…" / result line under the attached file's name. */
function fileStatus(p: Pending): string {
  if (p.status === 'error') return p.error;
  if (p.status === 'uploading') {
    return p.kind === 'pdf' ? 'Reading PDF (OCR if scanned)…' : p.kind === 'image' ? 'Reading photo…' : 'Reading file…';
  }
  const { pages, method, chars, notes } = p.info;
  return [
    p.kind === 'pdf' && `${pages} page${pages === 1 ? '' : 's'}`,
    p.kind === 'file' && `${chars.toLocaleString()} characters`,
    method === 'ocr' || method === 'text+ocr' ? 'read with OCR' : 'text extracted',
    ...notes,
  ]
    .filter(Boolean)
    .join(' · ');
}

function FileChip({ name, kind, children }: { name: string; kind: FileKind; children?: React.ReactNode }) {
  return (
    <span className={`file-chip ${kind}`}>
      <span className="file-chip-icon">
        {kind === 'pdf' ? <FileIcon size={16} /> : kind === 'image' ? <ImageIcon size={16} /> : <PaperclipIcon size={16} />}
      </span>
      <span className="file-chip-text">
        <strong title={name}>{name}</strong>
        {children}
      </span>
    </span>
  );
}

function MetaTag({ meta }: { meta: AnswerMeta }) {
  const effort = EFFORTS.find((e) => e.id === meta.effort)?.label ?? meta.effort;
  const tech = meta.technicality === 'high' ? ' · Technical' : meta.technicality === 'low' ? ' · Plain' : '';
  return (
    <span className="tag model" title={`Model: ${meta.model}`}>
      {meta.modelLabel} · {effort} effort{tech}
    </span>
  );
}

const SUGGESTIONS: { text: string; kind: 'Law' | 'General' }[] = [
  { text: 'What does the law say about cheating in public examinations?', kind: 'Law' },
  { text: 'What is the punishment for theft?', kind: 'Law' },
  { text: 'Who can be punished for leaking exam question papers?', kind: 'Law' },
  { text: 'Explain how photosynthesis works', kind: 'General' },
];

function RouteBadge({ route }: { route: RouteInfo }) {
  if (route.type === 'law') {
    return (
      <span className="tag law">
        <ScaleIcon size={13} />
        {route.domains.map((d) => d.label).join(' · ') || 'Law databases'}
      </span>
    );
  }
  if (route.type === 'general') {
    return (
      <span className="tag general">
        <SparkIcon size={13} />
        General answer
      </span>
    );
  }
  return (
    <span className="tag unsupported">
      <InfoIcon size={13} />
      Not covered by the law databases
    </span>
  );
}

function Sources({ sources, multiDomain }: { sources: Source[]; multiDomain: boolean }) {
  return (
    <details className="sources">
      <summary>
        <BookIcon size={14} />
        {sources.length} {sources.length === 1 ? 'source' : 'sources'}
      </summary>
      <ol>
        {sources.map((src, i) => (
          <li key={src.id} className="source">
            <div className="source-head">
              <span className="source-num">{i + 1}</span>
              <div className="source-ref">
                <strong>{src.act}</strong>
                <span>
                  {[
                    src.section && `Section ${src.section}`,
                    src.title,
                    src.chapter,
                    multiDomain && src.domain,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {typeof src.score === 'number' && (
                <span className="score" title="How closely this excerpt matched your question">
                  {Math.round(src.score * 100)}%
                </span>
              )}
            </div>
            {src.excerpt && <p>{src.excerpt}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: nothing useful to do */
    }
  }
  return (
    <button className="icon-btn small" onClick={copy} aria-label="Copy answer" title="Copy answer">
      {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
    </button>
  );
}

type Props = {
  chatId: string | null;
  title: string | null;
  resetKey: number;
  onChatSaved: (c: ChatSummary) => void;
  onBusyChange: (busy: boolean) => void;
  onOpenMenu: () => void;
};

function errorText(e: unknown) {
  return e instanceof TypeError
    ? 'Can’t reach the server. Make sure the backend is running on port 4000.'
    : (e as Error).message;
}

export default function Chat({ chatId, title, resetKey, onChatSaved, onBusyChange, onOpenMenu }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState<{ mode: Mode; domain: string | null; model: string } | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [domain, setDomain] = useState<string | null>(null);
  const [domains, setDomains] = useState<LawDomain[] | null>(null);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AnswerSettings>(DEFAULT_SETTINGS);
  const [pending, setPending] = useState<Pending | null>(null);
  const [chatFile, setChatFile] = useState<AttachmentRef | null>(null); // used for follow-ups
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  // Follow the answer as it grows, unless the user scrolled up to read.
  const pinned = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Text the user had typed before "/" replaced it; restored after a field is chosen.
  const stash = useRef('');
  // When we create a chat ourselves we already hold its messages: don't reload them.
  const skipLoadFor = useRef<string | null>(null);

  // Restore the last answer mode, then load the law databases for "Specific law".
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MODE_KEY) ?? 'null');
      if (saved && ['auto', 'general', 'law'].includes(saved.mode)) {
        setMode(saved.mode);
        setDomain(typeof saved.domain === 'string' ? saved.domain : null);
      }
    } catch {
      /* storage unavailable or corrupt: keep Auto */
    }
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
      if (isSettings(saved)) setSettings(saved);
    } catch {
      /* keep the defaults */
    }
    listDomains()
      .then(setDomains)
      .catch((e) => setDomainsError(errorText(e)));
  }, []);

  // A remembered law database that no longer exists falls back to Auto.
  useEffect(() => {
    if (domains && mode === 'law' && !domains.some((d) => d.id === domain)) changeMode('auto', null);
  }, [domains, mode, domain]);

  function changeMode(m: Mode, d: string | null) {
    setMode(m);
    setDomain(m === 'law' ? d : null);
    try {
      localStorage.setItem(MODE_KEY, JSON.stringify({ mode: m, domain: m === 'law' ? d : null }));
    } catch {
      /* storage unavailable: the choice still applies for this visit */
    }
    inputRef.current?.focus();
  }

  function changeSettings(s: AnswerSettings) {
    setSettings(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* the choice still applies for this visit */
    }
  }

  // ---------- "/" law-field list ----------
  const slashMatch = slashDismissed ? null : /^\/(\S*)$/.exec(input);
  const slashOpen = !!slashMatch && !sending;
  const slashQuery = (slashMatch?.[1] ?? '').toLowerCase();
  const fieldMatches = (domains ?? []).filter(
    (d) =>
      !slashQuery ||
      d.label.toLowerCase().includes(slashQuery) ||
      d.id.includes(slashQuery) ||
      d.description.toLowerCase().includes(slashQuery),
  );

  useEffect(() => setSlashIndex(0), [slashQuery]);
  useEffect(() => {
    if (!input.startsWith('/')) setSlashDismissed(false);
  }, [input]);

  /** Shows the law-field list by putting "/" in the chat box (keeps what was typed). */
  function openFieldList() {
    if (!input.startsWith('/')) stash.current = input;
    setInput('/');
    setSlashDismissed(false);
    inputRef.current?.focus();
  }

  function pickField(d: LawDomain) {
    changeMode('law', d.id);
    setInput(stash.current);
    stash.current = '';
  }

  function closeFieldList() {
    setSlashDismissed(true);
    if (input === '/' && stash.current) {
      setInput(stash.current);
      stash.current = '';
    }
  }

  function onModeChange(m: Mode) {
    if (m === 'law') {
      changeMode('law', null);
      openFieldList(); // "Specific": pick the field from the "/" list
    } else {
      changeMode(m, null);
    }
  }

  // ---------- file upload ----------
  async function attach(file: File) {
    if (file.size > MAX_FILE) {
      setPending({ status: 'error', name: file.name, kind: kindOf(file), error: 'File is larger than 20 MB.' });
      return;
    }
    const base = { name: file.name, kind: kindOf(file) };
    setPending({ status: 'uploading', ...base });
    try {
      const info = await uploadFile(file);
      // Ignore the result if the user removed or replaced the file meanwhile.
      setPending((p) => (p?.status === 'uploading' && p.name === file.name ? { status: 'ready', ...base, info } : p));
    } catch (e) {
      setPending((p) =>
        p?.status === 'uploading' && p.name === file.name ? { status: 'error', ...base, error: errorText(e) } : p,
      );
    }
    inputRef.current?.focus();
  }

  function onPaste(e: React.ClipboardEvent) {
    const f = e.clipboardData.files?.[0];
    if (f) {
      e.preventDefault();
      attach(f);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !sending) attach(f);
  }

  useEffect(() => {
    onBusyChange(!!sending || loadingChat);
  }, [sending, loadingChat, onBusyChange]);

  useEffect(() => {
    setError(null);
    setPending(null);
    if (!chatId) {
      setMessages([]);
      setChatFile(null);
      inputRef.current?.focus();
      return;
    }
    if (skipLoadFor.current === chatId) {
      skipLoadFor.current = null;
      return;
    }
    let cancelled = false;
    setLoadingChat(true);
    setMessages([]);
    setChatFile(null);
    getChat(chatId)
      .then((c) => {
        if (cancelled) return;
        setMessages(c.messages);
        setChatFile(c.attachment);
      })
      .catch((e) => !cancelled && setError(errorText(e)))
      .finally(() => !cancelled && setLoadingChat(false));
    return () => {
      cancelled = true;
    };
  }, [chatId, resetKey]);

  const refreshUsage = useCallback(() => {
    getUsage().then(setUsage).catch(() => {
      /* the bar just stays as it was */
    });
  }, []);
  useEffect(refreshUsage, [refreshUsage]);

  // Keep the newest text in view while it is typed, unless the user scrolled away.
  useEffect(() => {
    const main = endRef.current?.closest('.main') as HTMLElement | null;
    const thread = main?.querySelector('.thread');
    if (!main || !thread) return;
    const onScroll = () => {
      pinned.current = main.scrollHeight - main.scrollTop - main.clientHeight < 120;
    };
    const ro = new ResizeObserver(() => {
      if (pinned.current) main.scrollTop = main.scrollHeight;
    });
    main.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(thread);
    return () => {
      main.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  // A new message or a reply starting: jump to the bottom.
  useEffect(() => {
    pinned.current = true;
    const main = endRef.current?.closest('.main') as HTMLElement | null;
    if (main) main.scrollTop = main.scrollHeight;
  }, [messages.length, sending]);

  /** Updates the answer being streamed (always the last message). */
  const updateLast = (fn: (m: Message) => Message) =>
    setMessages((ms) => {
      const last = ms[ms.length - 1];
      return last?.role === 'assistant' && last.streaming ? [...ms.slice(0, -1), fn(last)] : ms;
    });

  const finishTyping = useCallback((i: number) => {
    setMessages((ms) => (ms[i]?.typing ? ms.map((m, j) => (j === i ? { ...m, typing: false } : m)) : ms));
  }, []);

  // Grow the textarea with its content (up to the CSS max-height).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  async function send(
    text: string,
    base: Message[] = messages,
    how: { mode: Mode; domain: string | null } = { mode, domain },
  ) {
    if (sending || loadingChat || pending?.status === 'uploading') return;
    const file = pending?.status === 'ready' ? pending.info : null;
    let content = text.trim() || (file ? FILE_ONLY_PROMPT : '');
    if (!content) return;

    // "/criminal what is theft?" picks the field inline.
    const inline = /^\/(\S+)\s+([\s\S]+)$/.exec(content);
    const inlineField = inline && domains?.find((d) => d.id === inline[1].toLowerCase());
    if (inline && inlineField) {
      how = { mode: 'law', domain: inlineField.id };
      changeMode('law', inlineField.id);
      content = inline[2].trim();
    }
    // "Specific" without a field yet: ask for one first.
    if (how.mode === 'law' && !how.domain) {
      stash.current = content;
      setInput('/');
      setSlashDismissed(false);
      inputRef.current?.focus();
      return;
    }

    const ref: AttachmentRef | null = file ? { id: file.id, name: file.name, kind: file.kind } : null;
    setMessages([...base, { role: 'user', content, attachment: ref }]);
    setInput('');
    setError(null);
    const model = MODELS.find((m) => m.id === settings.model)?.short ?? 'The model';
    setSending({ ...how, model });

    let started = false;
    try {
      const data = await streamMessage(
        chatId,
        content,
        { mode: how.mode, domain: how.domain, settings, attachmentId: file?.id },
        {
          onStart: (s) => {
            started = true;
            setMessages((m) => [
              ...m,
              { role: 'assistant', content: '', ...s, streaming: true, typing: true },
            ]);
          },
          onDelta: (t) => updateLast((m) => ({ ...m, content: m.content + t })),
        },
      );
      updateLast((m) => ({
        ...m,
        content: data.reply,
        sources: data.sources,
        route: data.route,
        meta: data.meta,
        streaming: false,
      }));
      setUsage(data.usage);
      if (file) setPending(null);
      setChatFile(data.attachment);
      if (!chatId) skipLoadFor.current = data.chatId;
      onChatSaved({ id: data.chatId, title: data.title, updatedAt: data.updatedAt });
    } catch (e) {
      // A half-written answer was not saved, so don't keep it on screen.
      if (started) setMessages((m) => (m[m.length - 1]?.streaming ? m.slice(0, -1) : m));
      if (e instanceof StreamError && e.usage) setUsage(e.usage);
      else refreshUsage();
      setError(errorText(e));
    } finally {
      setSending(null);
      inputRef.current?.focus();
    }
  }

  function retry() {
    const last = messages[messages.length - 1];
    if (last?.role !== 'user') return;
    const base = messages.slice(0, -1);
    send(last.content, base);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen) {
      const n = fieldMatches.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (n) setSlashIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (n) pickField(fieldMatches[Math.min(slashIndex, n - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFieldList();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  const canRetry = error && messages[messages.length - 1]?.role === 'user';
  const busy = !!sending || loadingChat;
  const uploading = pending?.status === 'uploading';
  const fieldLabel = domains?.find((d) => d.id === domain)?.label;
  const limitReached = !!usage && usage.used >= usage.limit && !!usage.resetAt && usage.resetAt > Date.now();
  const canSend =
    !busy && !uploading && !slashOpen && !limitReached && (!!input.trim() || pending?.status === 'ready');
  const streamingNow = !!messages[messages.length - 1]?.streaming;
  const nearLimit = input.length > MAX_LEN * 0.9;

  return (
    <div className="shell">
      <header className="bar">
        <button className="icon-btn menu-btn" onClick={onOpenMenu} aria-label="Open chat history">
          <MenuIcon />
        </button>
        <h1 title={title ?? undefined}>{chatId ? title ?? 'Chat' : 'New chat'}</h1>
        <ThemeToggle />
      </header>

      <main className="thread" aria-live="polite" aria-busy={busy}>
        {loadingChat && (
          <div className="skeleton" aria-label="Loading chat">
            <span className="sk sk-user" />
            <span className="sk sk-bot" />
            <span className="sk sk-bot short" />
          </div>
        )}

        {!loadingChat && messages.length === 0 && !error && (
          <section className="empty">
            <div className="empty-mark">
              <ScaleIcon size={28} />
            </div>
            <h2>Hi, I’m {BOT_NAME}. Ask about Bangladesh law, or anything else.</h2>
            <p>
              Legal answers come only from the Acts in the law databases and cite the sections
              they used. Everything else is answered by a general assistant.
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  className="chip"
                  onClick={() => send(s.text, messages, { mode: 'auto', domain: null })}
                >
                  <span className={`chip-kind ${s.kind.toLowerCase()}`}>
                    {s.kind === 'Law' ? <ScaleIcon size={13} /> : <SparkIcon size={13} />}
                    {s.kind}
                  </span>
                  <span className="chip-text">{s.text}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg user">
              <div className="user-col">
                {m.attachment && <FileChip name={m.attachment.name} kind={m.attachment.kind} />}
                <div className="bubble">{m.content}</div>
              </div>
            </div>
          ) : (
            <div key={i} className="msg assistant">
              <div className="avatar-bot" aria-hidden="true">
                <ScaleIcon size={16} />
              </div>
              <div className="col">
                <TypedAnswer
                  text={m.content}
                  streaming={!!m.streaming}
                  animate={!!m.typing}
                  onDone={() => finishTyping(i)}
                />
                {!m.streaming && !m.typing && (
                  <div className="meta">
                    {m.route && <RouteBadge route={m.route} />}
                    {m.meta && m.route?.type !== 'unsupported' && <MetaTag meta={m.meta} />}
                    <CopyButton text={m.content} />
                  </div>
                )}
                {!m.streaming && !m.typing && m.sources && m.sources.length > 0 && (
                  <Sources
                    sources={m.sources}
                    multiDomain={!!m.route && m.route.domains.length > 1}
                  />
                )}
              </div>
            </div>
          ),
        )}

        {sending && !streamingNow && (
          <div className="msg assistant" role="status">
            <div className="avatar-bot" aria-hidden="true">
              <ScaleIcon size={16} />
            </div>
            <div className="thinking">
              <span className="dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {sending.mode === 'law'
                ? `Searching ${domains?.find((d) => d.id === sending.domain)?.label ?? 'the law database'}…`
                : `${sending.model} is thinking…`}
            </div>
          </div>
        )}

        {error && (
          <div className="error" role="alert">
            <InfoIcon size={18} />
            <span className="error-text">{error}</span>
            {canRetry && (
              <button className="ghost" onClick={retry}>
                <RetryIcon size={14} />
                Retry
              </button>
            )}
          </div>
        )}
      </main>

      <div className="dock">
        {slashOpen && (
          <div className="slash" role="listbox" id="law-fields" aria-label="Law fields">
            <div className="slash-head">
              <ScaleIcon size={14} />
              Choose a law field to search
              <kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd>
            </div>
            {domains === null && !domainsError && <p className="slash-note">Loading law fields…</p>}
            {domainsError && <p className="slash-note err">{domainsError}</p>}
            {domains && fieldMatches.length === 0 && (
              <p className="slash-note">
                {domains.length ? `No law field matches “${slashQuery}”.` : 'No law databases yet.'}
              </p>
            )}
            {fieldMatches.map((d, i) => (
              <button
                key={d.id}
                type="button"
                role="option"
                id={`field-${d.id}`}
                aria-selected={i === slashIndex}
                className={`slash-item${i === slashIndex ? ' on' : ''}${mode === 'law' && domain === d.id ? ' current' : ''}`}
                onMouseEnter={() => setSlashIndex(i)}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the chat box
                onClick={() => pickField(d)}
              >
                <span className="slash-cmd">/{d.id}</span>
                <span className="slash-text">
                  <strong>{d.label}</strong>
                  {d.description && <small>{d.description}</small>}
                </span>
                {mode === 'law' && domain === d.id && <CheckIcon size={15} className="mode-check" />}
              </button>
            ))}
          </div>
        )}

        <form
          className={`composer${dragging ? ' dragging' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {(pending || chatFile) && (
            <div className="attach-row">
              {pending ? (
                <span className={`attach ${pending.status}`}>
                  <FileChip name={pending.name} kind={pending.kind}>
                    <small>{fileStatus(pending)}</small>
                  </FileChip>
                  {pending.status === 'uploading' && <span className="attach-spin" aria-label="Reading file" />}
                  <button
                    type="button"
                    className="icon-btn small"
                    onClick={() => setPending(null)}
                    aria-label="Remove file"
                    title="Remove file"
                  >
                    <CloseIcon size={14} />
                  </button>
                </span>
              ) : (
                chatFile && (
                  <span className="attach context" title="Follow-up questions in this chat also use this file">
                    <FileChip name={chatFile.name} kind={chatFile.kind}>
                      <small>Used as context in this chat</small>
                    </FileChip>
                  </span>
                )
              )}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={
              mode === 'law' && fieldLabel
                ? `Ask ${BOT_NAME} about ${fieldLabel}…`
                : `Message ${BOT_NAME}… (type / to choose a law field)`
            }
            rows={1}
            maxLength={MAX_LEN}
            aria-label="Message"
            aria-controls={slashOpen ? 'law-fields' : undefined}
            aria-activedescendant={slashOpen && fieldMatches[slashIndex] ? `field-${fieldMatches[slashIndex].id}` : undefined}
          />

          <div className="composer-bar">
            <div className="bar-left">
              <AttachMenu disabled={!!sending || uploading} onFile={attach} />
              <ModePicker mode={mode} disabled={!!sending} onChange={onModeChange} />
              {mode === 'law' && fieldLabel && (
                <span className="field-chip">
                  <button type="button" className="field-chip-main" onClick={openFieldList} title="Change law field">
                    <ScaleIcon size={13} />
                    <span>{fieldLabel}</span>
                  </button>
                  <button
                    type="button"
                    className="field-chip-x"
                    onClick={() => changeMode('auto', null)}
                    aria-label="Clear law field (back to Auto)"
                    title="Clear (back to Auto)"
                  >
                    <CloseIcon size={12} />
                  </button>
                </span>
              )}
            </div>
            <div className="bar-right">
              <ModelPicker value={settings} disabled={!!sending} onChange={changeSettings} />
              <button
                type="submit"
                className="send"
                disabled={!canSend}
                aria-label="Send message"
                title="Send (Enter)"
              >
                <SendIcon size={18} />
              </button>
            </div>
          </div>
        </form>
        <div className="dock-foot">
          <UsageMeter usage={usage} onExpired={refreshUsage} />
          <p className="note">
            {nearLimit ? (
              <span className="count">
                {input.length.toLocaleString()} / {MAX_LEN.toLocaleString()} characters
              </span>
            ) : (
              <>
                <span className="kbd-hint">
                  <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line ·{' '}
                </span>
                General information only, not legal advice.
              </>
            )}
          </p>
        </div>
      </div>
      <div ref={endRef} />
    </div>
  );
}
