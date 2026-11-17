import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Domain, Source } from './chat.types';

export type Hit = Source & { _text: string };

export interface Extracted {
  kind: 'pdf' | 'image' | 'file';
  text: string;
  /** PDF page count; 1 for images; 0 for other files. */
  pages: number;
  /** text = text layer / plain text, ocr = read by OCR, text+ocr = both, converted = Office/HTML */
  method: 'text' | 'ocr' | 'text+ocr' | 'converted';
  notes: string[];
  /** Images only: a JPEG copy (base64) for the vision model, whatever the original format. */
  image?: string;
}

/** Talks to the Python search service (one vector database per domain). */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private cache: { at: number; domains: Domain[] } | null = null;

  private base() {
    return (process.env.RETRIEVAL_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  }

  private async call<T>(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base()}${path}`, {
        ...init,
        headers: init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new InternalServerErrorException(
        `Cannot reach the search service at ${this.base()}. Start it: python -m uvicorn server:app --port 8000`,
      );
    }
    if (!res.ok && [413, 415, 422].includes(res.status)) {
      // A problem with the user's file: pass the service's explanation on.
      const detail = (await res.json().catch(() => ({}))).detail;
      throw new BadRequestException(typeof detail === 'string' ? detail : 'Could not read this file.');
    }
    if (!res.ok) {
      this.logger.error(`Search service ${res.status} on ${path}: ${await res.text()}`);
      this.cache = null;
      throw new InternalServerErrorException(
        res.status === 503
          ? 'No law databases yet. Run "python ingest.py" in the retrieval folder.'
          : 'The search service returned an error. Check its terminal.',
      );
    }
    return (await res.json()) as T;
  }

  /** Every available knowledge base. Cached briefly so new .jsonl files appear on their own. */
  async domains(): Promise<Domain[]> {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.domains;
    const data = await this.call<{ domains: Domain[] }>('/domains');
    this.cache = { at: Date.now(), domains: data.domains };
    return data.domains;
  }

  async search(query: string, domainIds: string[], k = Number(process.env.TOP_K ?? 5)): Promise<Hit[]> {
    const labels = new Map((await this.domains()).map((d) => [d.id, d.label]));
    const min = Number(process.env.MIN_SCORE ?? 0);

    const data = await this.call<{ results: any[] }>('/search', {
      method: 'POST',
      body: JSON.stringify({ query, k, domains: domainIds }),
    });
    return data.results
      .filter((r) => r.score >= min)
      .map(({ text, ...r }) => ({
        ...r,
        domain: labels.get(r.domain) ?? r.domain,
        _text: text,
      })) as Hit[];
  }

  /** Text of an uploaded file: PDF, photo (local Bangla/English OCR), Office/HTML or text. */
  extract(file: Buffer, name: string, mime: string): Promise<Extracted> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file)], { type: mime || 'application/octet-stream' }), name);
    // Scanned PDFs are OCR'd page by page, which can take a few minutes.
    return this.call<Extracted>('/extract', { method: 'POST', body: form }, 600_000);
  }

  /** The passages of an uploaded document that best match the question. */
  async rank(text: string, query: string, k: number): Promise<string[]> {
    const data = await this.call<{ passages: string[] }>('/rank', {
      method: 'POST',
      body: JSON.stringify({ text, query, k }),
    });
    return data.passages;
  }
}
