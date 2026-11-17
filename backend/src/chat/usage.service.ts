import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

const WINDOW_MS = 60 * 60 * 1000; // limits reset one hour after the window's first request

/** Tokens a user may spend per hour (prompt + answer, every model call). */
export const tokenLimit = () => {
  const n = Number(process.env.TOKEN_LIMIT_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? n : 200_000;
};

export interface UsageStatus {
  used: number;
  limit: number;
  /** When the current window ends (ms). null = no usage yet in this window. */
  resetAt: number | null;
}

/**
 * Per-user hourly token budget. Firestore: users/{uid}/limits/usage { windowStart, tokens }.
 * The window starts with the first request after the previous one ended.
 */
@Injectable()
export class UsageService {
  constructor(private readonly firebase: FirebaseService) {}

  private ref(uid: string) {
    return this.firebase.db.doc(`users/${uid}/limits/usage`);
  }

  private view(data: { windowStart?: number; tokens?: number } | undefined, now: number): UsageStatus {
    const start = data?.windowStart ?? 0;
    const active = now - start < WINDOW_MS;
    return {
      used: active ? (data?.tokens ?? 0) : 0,
      limit: tokenLimit(),
      resetAt: active ? start + WINDOW_MS : null,
    };
  }

  async status(uid: string): Promise<UsageStatus> {
    const snap = await this.ref(uid).get();
    return this.view(snap.data(), Date.now());
  }

  /** Throws 429 when this hour's budget is used up. */
  async assertAvailable(uid: string): Promise<UsageStatus> {
    const s = await this.status(uid);
    if (s.used >= s.limit) {
      const mins = Math.max(1, Math.ceil(((s.resetAt ?? Date.now()) - Date.now()) / 60_000));
      throw new HttpException(
        `You've reached your hourly limit of ${s.limit.toLocaleString('en-US')} tokens. It resets in ${mins} minute${mins === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return s;
  }

  /** Adds tokens to the current window (starting a new one if the last has ended). */
  async add(uid: string, tokens: number): Promise<UsageStatus> {
    const ref = this.ref(uid);
    return this.firebase.db.runTransaction(async (tx) => {
      const now = Date.now();
      const data = (await tx.get(ref)).data() as { windowStart?: number; tokens?: number } | undefined;
      const active = data?.windowStart !== undefined && now - data.windowStart < WINDOW_MS;
      const next = active
        ? { windowStart: data!.windowStart!, tokens: (data!.tokens ?? 0) + tokens }
        : { windowStart: now, tokens };
      if (tokens > 0) tx.set(ref, next);
      return this.view(tokens > 0 ? next : data, now);
    });
  }
}
