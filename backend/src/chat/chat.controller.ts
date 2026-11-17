import { Body, Controller, HttpException, Logger, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AnswerSettings, DEFAULT_SETTINGS } from './answer.config';
import { MessageDto, SendMessageDto } from './chat.dto';
import { ChatService, FileContext, ReplyOptions } from './chat.service';
import { AttachmentRef } from './chat.types';
import { ChatsService } from './chats.service';
import { FilesService } from './files.service';
import { Meter } from './llm.service';
import { UsageService } from './usage.service';

/** Everything loaded before the model is called. */
interface Job {
  title?: string;
  history: MessageDto[];
  file: FileContext | null;
  newAttachment: AttachmentRef | null;
  chatFile: AttachmentRef | null;
  settings: AnswerSettings;
}

@Controller('chat')
@UseGuards(FirebaseAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chat: ChatService,
    private readonly chats: ChatsService,
    private readonly files: FilesService,
    private readonly usage: UsageService,
  ) {}

  /** The whole answer as one JSON response. */
  @Post()
  async send(@Body() dto: SendMessageDto, @CurrentUser() user: AuthUser) {
    await this.usage.assertAvailable(user.uid);
    const job = await this.prepare(dto, user.uid);
    const meter = new Meter();
    try {
      const answer = await this.chat.reply(this.messages(job, dto), this.options(dto, job, { meter }));
      return { ...(await this.finish(dto, user.uid, job, answer)), usage: await this.usage.add(user.uid, meter.tokens) };
    } catch (e) {
      await this.usage.add(user.uid, meter.tokens).catch(() => undefined);
      throw e;
    }
  }

  /**
   * The answer streamed as it is written (newline-delimited JSON):
   *   {"type":"start", route, sources, meta}   how the question is handled
   *   {"type":"delta", text}                   the next piece of the answer
   *   {"type":"done", chatId, title, ...}      saved; final reply and usage
   *   {"type":"error", message}                failed; nothing was saved
   * Errors found before streaming starts (limit reached, bad chat id) are normal JSON errors.
   */
  @Post('stream')
  async stream(@Body() dto: SendMessageDto, @CurrentUser() user: AuthUser, @Res() res: Response) {
    await this.usage.assertAvailable(user.uid);
    const job = await this.prepare(dto, user.uid);

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.socket?.setNoDelay(true);

    // The browser went away (closed tab, new chat): stop the model.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    const emit = (ev: object) => {
      if (!res.writableEnded && !abort.signal.aborted) res.write(JSON.stringify(ev) + '\n');
    };

    const meter = new Meter();
    try {
      const answer = await this.chat.reply(
        this.messages(job, dto),
        this.options(dto, job, {
          meter,
          signal: abort.signal,
          onStart: (s) => emit({ type: 'start', ...s }),
          onDelta: (text) => emit({ type: 'delta', text }),
        }),
      );
      if (abort.signal.aborted) throw new Error('aborted');
      const saved = await this.finish(dto, user.uid, job, answer);
      const usage = await this.usage.add(user.uid, meter.tokens);
      emit({ type: 'done', ...saved, usage });
    } catch (e) {
      const usage = await this.usage.add(user.uid, meter.tokens).catch(() => null);
      if (!abort.signal.aborted) {
        if (!(e instanceof HttpException)) this.logger.error('Streaming answer failed', e as Error);
        emit({
          type: 'error',
          message: e instanceof HttpException ? e.message : 'Something went wrong. Try again.',
          usage,
        });
      }
    } finally {
      res.end();
    }
  }

  private async prepare(dto: SendMessageDto, uid: string): Promise<Job> {
    let title: string | undefined;
    let history: MessageDto[] = [];
    let chatFile: AttachmentRef | null = null;
    if (dto.chatId) {
      ({ title, history, attachment: chatFile } = await this.chats.prepare(uid, dto.chatId));
    }

    // A file sent now must exist; the chat's earlier file is used for follow-ups if still there.
    let file: FileContext | null = null;
    let newAttachment: AttachmentRef | null = null;
    if (dto.attachmentId) {
      const f = await this.files.get(uid, dto.attachmentId);
      file = f;
      newAttachment = { id: f.id, name: f.name, kind: f.kind };
    } else if (chatFile) {
      file = await this.files.get(uid, chatFile.id).catch(() => {
        this.logger.warn(`Chat ${dto.chatId}: attached file ${chatFile!.id} is gone; answering without it.`);
        return null;
      });
    }

    const settings: AnswerSettings = {
      model: dto.model ?? DEFAULT_SETTINGS.model,
      effort: dto.effort ?? DEFAULT_SETTINGS.effort,
      technicality: dto.technicality ?? DEFAULT_SETTINGS.technicality,
    };
    return { title, history, file, newAttachment, chatFile, settings };
  }

  private messages(job: Job, dto: SendMessageDto): MessageDto[] {
    return [...job.history, { role: 'user', content: dto.message }];
  }

  private options(dto: SendMessageDto, job: Job, extra: ReplyOptions): ReplyOptions {
    return { mode: dto.mode ?? 'auto', domainId: dto.domain, settings: job.settings, file: job.file, ...extra };
  }

  /** Saved only after the model answered, so a failed request leaves no half-chat. */
  private async finish(
    dto: SendMessageDto,
    uid: string,
    job: Job,
    { reply, sources, route, meta }: Awaited<ReturnType<ChatService['reply']>>,
  ) {
    const saved = await this.chats.save(
      uid, dto.chatId, job.title, dto.message, reply, sources, route, meta, job.newAttachment,
    );
    return {
      chatId: saved.id,
      title: saved.title,
      updatedAt: saved.updatedAt,
      reply,
      sources,
      route,
      meta,
      attachment: job.newAttachment ?? job.chatFile,
    };
  }
}
