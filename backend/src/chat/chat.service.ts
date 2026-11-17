import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BOT_NAME, identityLine } from '../bot.config';
import { AnswerSettings, DEFAULT_SETTINGS, EFFORT, modelId, modelLabel, styleLines } from './answer.config';
import { AnswerMode, MessageDto } from './chat.dto';
import { AnswerMeta, Domain, RouteInfo, Source } from './chat.types';
import { LlmService, Meter, Provider } from './llm.service';
import { Hit, RetrievalService } from './retrieval.service';
import { RouterService, fallbackDomainId } from './router.service';

const GENERAL_PROMPT = [
  identityLine(),
  'You are friendly and helpful. Answer clearly and concisely, in the same language the user writes in.',
].join(' ');

type Answer = { reply: string; sources: Source[]; route: RouteInfo; meta: AnswerMeta };
/** Known before the answer is written: how the question is handled and from which sources. */
export type AnswerStart = Omit<Answer, 'reply'>;

/** An uploaded file the question is about (full extracted text). */
export interface FileContext {
  name: string;
  text: string;
}

export interface ReplyOptions {
  mode?: AnswerMode;
  domainId?: string;
  settings?: AnswerSettings;
  file?: FileContext | null;
  /** Collects the tokens used by every model call. */
  meter?: Meter;
  /** Streaming: called once before the answer, then with each piece of it. */
  onStart?: (s: AnswerStart) => void;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

/** Everything one request needs, worked out once. */
interface Ctx {
  messages: MessageDto[];
  settings: AnswerSettings;
  file: { name: string; passages: string[] } | null;
  opts: ReplyOptions;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly router: RouterService,
    private readonly llm: LlmService,
  ) {}

  async reply(messages: MessageDto[], opts: ReplyOptions = {}): Promise<Answer> {
    const mode = opts.mode ?? 'auto';
    const settings = opts.settings ?? DEFAULT_SETTINGS;
    const ctx: Ctx = { messages, settings, file: await this.filePassages(messages, settings, opts.file), opts };

    // The user chose "General": no router, no search.
    if (mode === 'general') return this.general(ctx);

    // The user picked one law database: no router, search only that one.
    if (mode === 'law') {
      const domain = (await this.retrieval.domains()).find((d) => d.id === opts.domainId);
      if (!domain) {
        throw new BadRequestException(
          'That law database isn’t available any more. Pick another one or switch to Auto.',
        );
      }
      return this.law(ctx, [domain]);
    }

    // Auto: ask the router. If the search service is down, general questions still work.
    let domains: Domain[] = [];
    let searchError: unknown = null;
    try {
      domains = await this.retrieval.domains();
    } catch (e) {
      searchError = e;
    }
    const decision = await this.router.route(messages, domains, ctx.file && this.fileHint(ctx.file), {
      meter: opts.meter,
      signal: opts.signal,
    });
    if (searchError && decision.type !== 'general') throw searchError;

    // 1) Not a legal question -> general assistant
    if (decision.type === 'general') return this.general(ctx);

    const k = EFFORT[settings.effort].topK;
    const fallback = domains.find((d) => d.id === fallbackDomainId());
    // With a file attached there is still something to answer from.
    const unsupported = (): Promise<Answer> | Answer => {
      if (ctx.file) return this.general(ctx);
      const answer: Answer = {
        reply: this.unsupportedMessage(domains.filter((d) => d !== fallback)),
        sources: [],
        route: { type: 'unsupported', domains: [] },
        meta: this.meta(settings, 'none'),
      };
      opts.onStart?.(answer);
      opts.onDelta?.(answer.reply);
      return answer;
    };

    // 2) Legal, but no specific database covers it -> try the catch-all one, else don't guess
    if (decision.type === 'unsupported') {
      if (!fallback) return unsupported();
      const hits = await this.retrieval.search(this.buildQuery(ctx), [fallback.id], k);
      if (!this.relevant(hits)) return unsupported();
      return this.answer(ctx, hits, [fallback]);
    }

    // 3) Legal and covered -> search the right database(s); if nothing relevant is
    //    found there, also search the catch-all database. Answer only from the excerpts.
    const query = this.buildQuery(ctx);
    let used = decision.domains;
    let hits = await this.retrieval.search(query, used.map((d) => d.id), k);
    if (fallback && !used.includes(fallback) && !this.relevant(hits)) {
      const extra = await this.retrieval.search(query, [fallback.id], k);
      hits = [...hits, ...extra].sort((a, b) => b.score - a.score).slice(0, k);
      used = [...used, fallback];
    }
    return this.answer(ctx, hits, used);
  }

  /** True when at least one hit is similar enough to count as "found". */
  private relevant(hits: Hit[]): boolean {
    const min = Number(process.env.FALLBACK_MIN_SCORE ?? 0.56);
    return hits.some((h) => h.score >= min);
  }

  /** The parts of the uploaded file that matter for this question (more with higher effort). */
  private async filePassages(
    messages: MessageDto[],
    settings: AnswerSettings,
    file?: FileContext | null,
  ): Promise<Ctx['file']> {
    if (!file?.text) return null;
    const n = EFFORT[settings.effort].filePassages;
    const question = this.lastUser(messages) || file.name;
    try {
      return { name: file.name, passages: await this.retrieval.rank(file.text, question, n) };
    } catch (e) {
      // Search service down: use the start of the document instead.
      this.logger.warn(`Ranking the file failed, using its beginning: ${(e as Error).message}`);
      return { name: file.name, passages: [file.text.slice(0, n * 900)] };
    }
  }

  private fileHint(file: NonNullable<Ctx['file']>): string {
    const start = file.passages.join('\n').replace(/\s+/g, ' ').slice(0, 600);
    return `The user attached a file "${file.name}". It contains:\n${start}`;
  }

  private fileBlock(file: Ctx['file']): string[] {
    if (!file) return [];
    return [
      '',
      `USER'S FILE "${file.name}" (relevant parts; uploaded by the user, it is NOT law):`,
      file.passages.map((p, i) => `<<part ${i + 1}>>\n${p}`).join('\n\n'),
    ];
  }

  private async general(ctx: Ctx): Promise<Answer> {
    const { settings } = ctx;
    const provider = (process.env.GENERAL_PROVIDER ?? 'gemini') as Provider;
    const model =
      provider === 'gemini' ? (process.env.GENERAL_MODEL ?? 'gemini-flash-latest') : modelId(settings.model);
    const effort = EFFORT[settings.effort];
    const system = [
      GENERAL_PROMPT,
      ...styleLines(settings, 'general'),
      ...(ctx.file
        ? [
            'The user attached a file. Its text (from text extraction or OCR, so it may contain small reading errors) is below. Use it to answer, and say so if it does not contain what was asked.',
          ]
        : []),
      ...this.fileBlock(ctx.file),
    ].join('\n');
    const start: AnswerStart = { sources: [], route: { type: 'general', domains: [] }, meta: this.meta(settings, model) };
    ctx.opts.onStart?.(start);
    const reply = await this.llm.complete(provider, system, this.recent(ctx.messages, effort.history), {
      model,
      temperature: effort.temperature + 0.3,
      maxTokens: effort.maxTokens,
      ...this.callOpts(ctx),
    });
    return { reply, ...start };
  }

  private async law(ctx: Ctx, domains: Domain[]): Promise<Answer> {
    const hits = await this.retrieval.search(
      this.buildQuery(ctx),
      domains.map((d) => d.id),
      EFFORT[ctx.settings.effort].topK,
    );
    return this.answer(ctx, hits, domains);
  }

  /** Answer from already-retrieved excerpts. */
  private async answer(ctx: Ctx, hits: Hit[], domains: Domain[]): Promise<Answer> {
    const provider = (process.env.LLM_PROVIDER ?? 'lmstudio') as Provider;
    const model = provider === 'gemini' ? (process.env.GEMINI_MODEL ?? 'gemini-flash-latest') : modelId(ctx.settings.model);
    const effort = EFFORT[ctx.settings.effort];
    const start: AnswerStart = {
      sources: hits.map(({ _text, ...s }) => s),
      route: {
        type: 'law',
        domains: domains.map((d) => ({ id: d.id, label: d.label })),
      },
      meta: this.meta(ctx.settings, model),
    };
    ctx.opts.onStart?.(start);
    const reply = await this.llm.complete(provider, this.lawPrompt(hits, ctx), this.recent(ctx.messages, effort.history), {
      model,
      temperature: effort.temperature,
      maxTokens: effort.maxTokens,
      ...this.callOpts(ctx),
    });
    return { reply, ...start };
  }

  private callOpts(ctx: Ctx) {
    const { meter, onDelta, signal } = ctx.opts;
    return { meter, onDelta, signal };
  }

  private meta(s: AnswerSettings, model: string): AnswerMeta {
    return { model, modelLabel: modelLabel(s.model), effort: s.effort, technicality: s.technicality };
  }

  /** Last n turns, never starting with an assistant message. */
  private recent(messages: MessageDto[], n: number): MessageDto[] {
    const h = messages.slice(-n);
    while (h.length && h[0].role === 'assistant') h.shift();
    return h;
  }

  private lastUser(messages: MessageDto[]): string {
    return [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  }

  /**
   * Short follow-ups ("and section 3?") are searched together with the previous question.
   * With a file attached, its most relevant parts are part of the search too, so
   * "is this legal?" finds the laws the document is about.
   */
  private buildQuery(ctx: Ctx): string {
    const users = ctx.messages.filter((m) => m.role === 'user');
    const last = users[users.length - 1]?.content ?? '';
    const prev = users[users.length - 2]?.content;
    const q = last.length < 40 && prev ? `${prev}\n${last}` : last;
    if (!ctx.file) return q;
    const doc = ctx.file.passages.join('\n').replace(/\s+/g, ' ').slice(0, 1500);
    return `${q}\n${doc}`.slice(0, 3900);
  }

  private lawPrompt(hits: Hit[], ctx: Ctx): string {
    const excerpts = hits.length
      ? hits.map((h, i) => `[${i + 1}] ${h._text}`).join('\n\n')
      : '(no relevant excerpts were found)';
    return [
      identityLine(),
      'You answer questions about Bangladesh law using ONLY the excerpts below.',
      'Rules:',
      `- If the user only asks who you are or what your name is, just reply "I am ${BOT_NAME}, an AI assistant for Bangladesh law" in your own words; no excerpts are needed for that.`,
      '- Cite the Act and section number for every claim, e.g. (Public Examinations (Offences) Act, 1980, Section 2).',
      '- If the excerpts do not contain the answer, say you could not find it in the available laws. Never guess or use outside knowledge.',
      '- Do not invent section numbers or quotes.',
      '- The excerpts may be in Bangla or English. Reply in the same language the user writes in; if that differs from an excerpt, translate its meaning faithfully without adding anything.',
      '- Keep Act names and section numbers exactly as they appear in the excerpts (Bangla digits such as ২৮ are fine).',
      '- You give general information, not legal advice.',
      ...(ctx.file
        ? [
            "- The user attached a file (shown after the excerpts). Use it for the facts of the user's situation and quote it when relevant, but take every legal rule from the EXCERPTS only. Its text came from extraction or OCR and may contain small reading errors.",
          ]
        : []),
      ...styleLines(ctx.settings).map((l) => `- ${l}`),
      '',
      'EXCERPTS:',
      excerpts,
      ...this.fileBlock(ctx.file),
    ].join('\n');
  }

  private unsupportedMessage(domains: Domain[]): string {
    const covered = domains.map((d) => d.label).join(', ') || 'none yet';
    return (
      `This looks like a legal question, but it isn't about an area I (${BOT_NAME}) have laws for, so I won't guess. ` +
      `I currently cover Bangladesh: ${covered}. ` +
      `You can rephrase your question, or ask me something else.`
    );
  }
}
