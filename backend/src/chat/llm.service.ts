import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MessageDto } from './chat.dto';

export type Provider = 'gemini' | 'lmstudio';

/** Counts the tokens a request uses (prompt + answer), across every model call. */
export class Meter {
  tokens = 0;
  add(n: number) {
    if (Number.isFinite(n) && n > 0) this.tokens += Math.round(n);
  }
}

export interface LlmOptions {
  temperature?: number;
  /** Model id. LM Studio falls back to LMSTUDIO_CHAT_MODEL, Gemini to GEMINI_MODEL. */
  model?: string;
  /** Ask Gemini for a JSON-only reply. */
  json?: boolean;
  /** Upper limit on the answer length. */
  maxTokens?: number;
  /** Adds this call's token usage. */
  meter?: Meter;
  /** Stream the answer: called with each new piece of visible text. */
  onDelta?: (text: string) => void;
  /** Aborts the call (e.g. the browser disconnected). */
  signal?: AbortSignal;
}

/** Rough count when a provider doesn't report usage (Bangla/English mix ~3 chars per token). */
const estimate = (...parts: string[]) => Math.ceil(parts.reduce((n, p) => n + p.length, 0) / 3);

/**
 * Turns streamed raw text into visible text: drops <think>...</think> blocks and holds back a
 * possibly unfinished tag at the end, so it is never shown and then taken back.
 */
class VisibleText {
  private raw = '';
  private sent = 0;
  constructor(private readonly emit: (t: string) => void) {}
  push(chunk: string) {
    this.raw += chunk;
    let visible = this.raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart();
    const partial = /<\/?[a-z]*$/i.exec(visible);
    if (partial) visible = visible.slice(0, partial.index);
    if (visible.length > this.sent) {
      this.emit(visible.slice(this.sent));
      this.sent = visible.length;
    }
  }
  /** The full answer, flushing anything held back. */
  finish(): string {
    const all = this.raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
    if (all.length > this.sent) this.emit(all.slice(this.sent));
    this.sent = all.length;
    return all;
  }
}

/** Yields the JSON payload of each "data: ..." line of a server-sent-events response. */
async function* sseEvents(res: Response): AsyncGenerator<any> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {
        /* keep-alive or partial line: ignore */
      }
    }
  }
}

const signalFor = (opts: LlmOptions, ms: number) =>
  opts.signal ? AbortSignal.any([AbortSignal.timeout(ms), opts.signal]) : AbortSignal.timeout(ms);

/** The only place that talks to Gemini / LM Studio chat endpoints. */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  /** Returns the full answer; with `opts.onDelta` it also streams it piece by piece. */
  complete(
    provider: Provider,
    system: string,
    history: MessageDto[],
    opts: LlmOptions = {},
  ): Promise<string> {
    return provider === 'gemini'
      ? this.gemini(system, history, opts)
      : this.lmStudio(system, history, opts);
  }

  async lmStudio(system: string, history: MessageDto[], opts: LlmOptions): Promise<string> {
    const base = process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1';
    const model = opts.model ?? process.env.LMSTUDIO_CHAT_MODEL;
    if (!model) throw new InternalServerErrorException('LMSTUDIO_CHAT_MODEL is not set.');
    const stream = !!opts.onDelta;

    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.2,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
          messages: [{ role: 'system', content: system }, ...history],
        }),
        signal: signalFor(opts, stream ? 300_000 : 180_000), // local models can be slow
      });
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      this.logger.error('LM Studio unreachable', err as Error);
      throw new BadGatewayException(
        'Could not reach LM Studio. Make sure its local server is running and a model is loaded.',
      );
    }
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`LM Studio ${res.status} (${model}): ${body}`);
      throw new BadGatewayException(
        /model|not found|load/i.test(body)
          ? `LM Studio could not run the model "${model}". Download it in LM Studio (or set its id in backend/.env).`
          : 'LM Studio returned an error. Check its logs.',
      );
    }

    const prompt = system + history.map((m) => m.content).join('');
    let text: string;
    let usage: number | undefined;
    if (stream) {
      const out = new VisibleText(opts.onDelta!);
      for await (const ev of sseEvents(res)) {
        const piece = ev?.choices?.[0]?.delta?.content;
        if (piece) out.push(piece);
        if (ev?.usage?.total_tokens) usage = ev.usage.total_tokens;
      }
      text = out.finish();
    } else {
      const data: any = await res.json();
      text = String(data?.choices?.[0]?.message?.content ?? '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();
      usage = data?.usage?.total_tokens;
    }
    opts.meter?.add(usage ?? estimate(prompt, text));
    if (!text) throw new BadGatewayException('The model returned an empty answer.');
    return text;
  }

  /**
   * Reads an image with a local vision model (VISION_MODEL in LM Studio): transcribes its
   * text and describes what it shows. Returns '' when no vision model is set or it fails,
   * so uploads still work with OCR alone.
   */
  async describeImage(jpegBase64: string, meter?: Meter): Promise<string> {
    const model = process.env.VISION_MODEL?.trim();
    if (!model) return '';
    const base = process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1';
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 1500,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    'Transcribe all text in this image exactly, in its original language (Bangla or English). ' +
                    'Then, under the heading "Description:", briefly describe what the image shows ' +
                    '(type of document, stamps, signatures, tables, people or objects). Do not add anything else.',
                },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data: any = await res.json();
      meter?.add(data?.usage?.total_tokens ?? 1500);
      return String(data?.choices?.[0]?.message?.content ?? '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();
    } catch (e) {
      this.logger.warn(`Vision model "${model}" failed, using OCR only: ${(e as Error).message}`);
      return '';
    }
  }

  async gemini(system: string, history: MessageDto[], opts: LlmOptions): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException('GEMINI_API_KEY is not set in backend/.env.');
    }
    const model = opts.model ?? process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
    const base =
      process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta';

    const generationConfig: Record<string, unknown> = {};
    if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
    if (opts.json) generationConfig.responseMimeType = 'application/json';
    if (opts.maxTokens) generationConfig.maxOutputTokens = opts.maxTokens;

    const stream = !!opts.onDelta;
    let res: Response;
    try {
      const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
      res = await fetch(`${base}/models/${model}:${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: history.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig,
        }),
        signal: signalFor(opts, stream ? 180_000 : 60_000),
      });
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      this.logger.error('Could not reach Gemini', err as Error);
      throw new BadGatewayException('Could not reach the AI service.');
    }
    if (res.status === 429) {
      throw new BadGatewayException(
        'The AI service is busy (rate limit reached). Please try again in a minute.',
      );
    }
    if (res.status === 503) {
      this.logger.warn(`Gemini 503 (${model}): ${await res.text()}`);
      throw new BadGatewayException(
        'The AI model is overloaded right now (high demand). Please try again shortly.',
      );
    }
    if (!res.ok) {
      this.logger.error(`Gemini ${res.status} (${model}): ${await res.text()}`);
      throw new BadGatewayException('The AI service returned an error. Check the server logs.');
    }
    const partsText = (d: any) =>
      (d?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    let text: string;
    let usage: number | undefined;
    if (stream) {
      const out = new VisibleText(opts.onDelta!);
      for await (const ev of sseEvents(res)) {
        out.push(partsText(ev));
        if (ev?.usageMetadata?.totalTokenCount) usage = ev.usageMetadata.totalTokenCount;
      }
      text = out.finish();
    } else {
      const data: any = await res.json();
      text = partsText(data).trim();
      usage = data?.usageMetadata?.totalTokenCount;
    }
    opts.meter?.add(usage ?? estimate(system, ...history.map((m) => m.content), text));
    if (!text) {
      throw new BadGatewayException('The AI service returned no answer. Try rephrasing.');
    }
    return text;
  }
}
