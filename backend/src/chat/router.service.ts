import { Injectable, Logger } from '@nestjs/common';
import { BOT_NAME } from '../bot.config';
import { MessageDto } from './chat.dto';
import { Domain } from './chat.types';
import { LlmService, Meter, Provider } from './llm.service';

/** `question`: the latest message with spelling and grammar fixed by the router, if it changed. */
export type Decision = (
  | { type: 'general' }
  | { type: 'unsupported' }
  | { type: 'law'; domains: Domain[] }
) & { question?: string };

/** Id of the catch-all database searched when the specific ones find nothing ("" = off). */
export const fallbackDomainId = () =>
  (process.env.FALLBACK_DOMAIN ?? 'uncategorized').trim().toLowerCase();

/** Id of the court-decisions database ("" = off). Never routed to: ChatService searches it
 *  alongside the chosen law database(s) on every legal question. */
export const casesDomainId = () => (process.env.CASES_DOMAIN ?? 'cases').trim().toLowerCase();

const clip = (s: string, n = 300) => (s.length > n ? s.slice(0, n) + '…' : s);

/**
 * Decides, for every message: is it a legal question? If so, which knowledge
 * base(s) can answer it? The list of knowledge bases comes from the search
 * service, so adding a .jsonl file needs no change here.
 */
@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);

  constructor(private readonly llm: LlmService) {}

  /** `fileHint`: a short description of a file the user attached, if any. */
  async route(
    messages: MessageDto[],
    allDomains: Domain[],
    fileHint?: string | null,
    call: { meter?: Meter; signal?: AbortSignal } = {},
  ): Promise<Decision> {
    // The catch-all fallback database is never offered to the router; ChatService
    // searches it only when the specific databases have nothing relevant. The same goes
    // for the court decisions, which ChatService adds to every legal answer itself.
    const hidden = new Set([fallbackDomainId(), casesDomainId()]);
    const domains = allDomains.filter((d) => !hidden.has(d.id));
    allDomains = allDomains.filter((d) => d.id !== casesDomainId());
    const provider = (process.env.ROUTER_PROVIDER ?? 'gemini') as Provider;
    // LM Studio: ROUTER_LMSTUDIO_MODEL, else LMSTUDIO_CHAT_MODEL. Independent of the
    // model the user picked for answers, so routing stays fast and consistent.
    const model =
      provider === 'gemini'
        ? (process.env.ROUTER_MODEL ?? 'gemini-flash-lite-latest')
        : process.env.ROUTER_LMSTUDIO_MODEL?.trim() || undefined;

    let raw: string;
    try {
      raw = await this.llm.complete(
        provider,
        this.systemPrompt(domains),
        [{ role: 'user', content: this.userPrompt(messages, fileHint) }],
        { temperature: 0, model, json: true, ...call },
      );
    } catch (e) {
      if (call.signal?.aborted) throw e; // the user left: don't fall back, just stop
      this.logger.warn(`Router call failed (${(e as Error).message})`);
      return this.fallback(allDomains);
    }

    const parsed = this.parse(raw);
    if (!parsed) {
      this.logger.warn(`Router returned something unreadable: ${clip(raw, 200)}`);
      return this.fallback(allDomains);
    }
    const question = parsed.question;
    if (parsed.category === 'general') return { type: 'general', question };

    const byId = new Map(domains.map((d) => [d.id.toLowerCase(), d]));
    const picked = [...new Set(parsed.ids)]
      .map((id) => byId.get(id))
      .filter((d): d is Domain => !!d)
      .slice(0, 2);
    return picked.length ? { type: 'law', domains: picked, question } : { type: 'unsupported', question };
  }

  /** If routing itself fails, stay safe: answer only from the law databases. */
  private fallback(domains: Domain[]): Decision {
    this.logger.warn('Falling back to searching every law database.');
    return domains.length ? { type: 'law', domains } : { type: 'general' };
  }

  private systemPrompt(domains: Domain[]): string {
    const list = domains.length
      ? domains
          .map((d) => {
            const acts = d.acts.slice(0, 20).map((a) => clip(a, 90)).join('; ');
            const more = d.acts.length > 20 ? ` (+${d.acts.length - 20} more)` : '';
            return `- ${d.id}: ${d.label}. ${d.description ? d.description + ' ' : ''}Acts include: ${acts}${more}`;
          })
          .join('\n')
      : '(none)';

    return [
      `You are the routing step of ${BOT_NAME}, a Bangladesh legal assistant.`,
      'Read the conversation and decide how the LATEST user message must be handled.',
      '',
      'Legal knowledge bases available:',
      list,
      '',
      'Reply with ONLY a JSON object: {"category": "law" | "general", "domains": ["<id>", ...], "question": "<corrected latest message>"}',
      '',
      'Rules:',
      '- "law": the message asks about laws, legal rules, rights, offences, penalties, legal procedure, courts, Acts or sections.',
      '- "general": everything else (greetings, small talk, coding, maths, science, recipes, news, opinions, advice that is not about the law).',
      '- Questions about the assistant itself (its name, who it is, who made it, what it can do) are "general".',
      '- "domains": for "law", the ids from the list above that could contain the answer. Pick 1, or at most 2 if the question truly spans two areas. Use [] if it is a legal question but no knowledge base fits. For "general" use [].',
      '- Users often type quickly: misspellings ("low" for "law", "withe" for "with"), missing words, wrong grammar, Banglish (Bangla written in English letters). Work out what they mean and decide from that.',
      '- "question": the latest user message rewritten with its spelling and grammar mistakes fixed, in the same language and with exactly the same meaning. Do not answer it, add details or change what is asked. If it has no mistakes, repeat it unchanged.',
      '- A short follow-up (for example "and what is the penalty?") belongs to the same topic as the earlier messages. Use them to decide.',
      '- If the user attached a file, decide from the question together with the file: a question about the legal effect of a legal document (deed, notice, contract, FIR, judgment) is "law"; a request to just summarise, translate or describe the file is "general".',
    ].join('\n');
  }

  private userPrompt(messages: MessageDto[], fileHint?: string | null): string {
    const latest = messages[messages.length - 1]?.content ?? '';
    const earlier = messages
      .slice(-5, -1)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${clip(m.content)}`)
      .join('\n');
    const file = fileHint ? `\n\n${clip(fileHint, 800)}` : '';
    return `${earlier ? `Earlier messages:\n${earlier}\n\n` : ''}Latest user message:\n${clip(latest, 1500)}${file}`;
  }

  private parse(raw: string): { category: 'law' | 'general'; ids: string[]; question?: string } | null {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const j = JSON.parse(m[0]);
      const category = String(j.category ?? '').toLowerCase();
      if (category !== 'law' && category !== 'general') return null;
      const ids = Array.isArray(j.domains)
        ? j.domains.map((x: unknown) => String(x).toLowerCase().trim())
        : [];
      const q = typeof j.question === 'string' ? j.question.trim() : '';
      // Ignore a "correction" that is empty or suspiciously long (the model answered instead).
      return { category, ids, question: q && q.length <= 2000 ? q : undefined };
    } catch {
      return null;
    }
  }
}
