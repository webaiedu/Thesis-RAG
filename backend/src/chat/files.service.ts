import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { LlmService, Meter } from './llm.service';
import { RetrievalService } from './retrieval.service';
import { UsageService } from './usage.service';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Firestore documents are limited to 1 MB; Bangla is 3 bytes per character. */
const MAX_CHARS = 150_000;

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** What the UI shows about a file (no text). */
export interface AttachmentInfo {
  id: string;
  name: string;
  kind: 'pdf' | 'image' | 'file';
  pages: number;
  method: string;
  chars: number;
  notes: string[];
}

/**
 * Uploaded files of any readable type. The search service extracts the text locally (PDF
 * text layer, Bangla + English OCR for scans and photos, Office/HTML conversion, plain
 * text); photos are also read by the local vision model. Audio/video are refused there.
 * Firestore: users/{uid}/uploads/{id} { name, kind, pages, method, notes, text, createdAt }
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
    private readonly usage: UsageService,
  ) {}

  private uploads(uid: string) {
    return this.firebase.db.collection(`users/${uid}/uploads`);
  }

  async upload(uid: string, file: UploadedFile): Promise<AttachmentInfo> {
    await this.usage.assertAvailable(uid);
    const name = (file.originalname || 'file').replace(/[\r\n]/g, ' ').slice(0, 200);
    const ex = await this.retrieval.extract(file.buffer, name, file.mimetype);

    let text = ex.text;
    if (ex.kind === 'image' && ex.image) {
      // The vision model reads layout, handwriting and non-text content OCR can miss.
      const meter = new Meter();
      const vision = await this.llm.describeImage(ex.image, meter);
      await this.usage.add(uid, meter.tokens);
      text = [text && `[Text read by OCR]\n${text}`, vision && `[Read by the vision model]\n${vision}`]
        .filter(Boolean)
        .join('\n\n');
    }
    text = text.trim();
    if (!text) {
      throw new BadRequestException('No readable text was found in this file.');
    }
    const notes = [...ex.notes];
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      notes.push('The file is very long; only its first part is used.');
    }

    const ref = this.uploads(uid).doc();
    const doc = { name, kind: ex.kind, pages: ex.pages, method: ex.method, notes, text, createdAt: Date.now() };
    await ref.set(doc);
    return { id: ref.id, name, kind: ex.kind, pages: ex.pages, method: ex.method, chars: text.length, notes };
  }

  /** The file's name and full text, if this user owns it. */
  async get(uid: string, id: string): Promise<{ id: string; name: string; kind: 'pdf' | 'image' | 'file'; text: string }> {
    if (!ID.test(id)) throw new NotFoundException('File not found.');
    const snap = await this.uploads(uid).doc(id).get();
    if (!snap.exists) throw new NotFoundException('That file is no longer available. Attach it again.');
    const d = snap.data()!;
    return { id, name: d.name, kind: d.kind, text: d.text };
  }
}
