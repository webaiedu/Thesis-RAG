/**
 * Benchmark runner: answers every test question at every chosen setting through the real
 * ChatService (no HTTP, no login, no Firestore, no usage limit) and writes one JSON line each.
 *
 *   npm run eval -- --variant B0 --models low --efforts low,mid,high --tech low,auto,high \
 *     --test ../eval/data/test.jsonl --out ../eval/runs/B0/gemma --workers 4
 *
 * Options:
 *   --variant      label stored with every answer (B0, E1, E2, E3, N0, N1, ...)
 *   --models       low,mid,high      answer model tiers (LMSTUDIO_MODEL_LOW/MID/HIGH)
 *   --efforts      low,mid,high
 *   --tech         low,auto,high     technicality
 *   --mode         auto | general    (general = no RAG)
 *   --test         test set (.jsonl: id, question, optional messages[])
 *   --out          output folder: answers.jsonl, errors.jsonl, run-config.json
 *   --workers      parallel requests (LM Studio "Parallel" of the loaded model)
 *   --route-cache  router decisions, shared by every setting and variant
 *                  (default ../eval/runs/route-cache.jsonl)
 *   --limit N      only the first N questions (pilot)
 *   --files-dir    folder of the test items' "file" (default ../eval/data/files)
 *   --file-cache   extracted file text (OCR + vision), made once and reused by every setting and
 *                  variant like the router cache (default ../eval/runs/file-cache.jsonl)
 *
 * Resumable: run the same command again and finished question+setting pairs are skipped.
 * Set EVAL_TEMPERATURE=0 for repeatable answers.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../app.module';
import { AnswerSettings, EFFORT, modelId } from '../chat/answer.config';
import { ChatService } from '../chat/chat.service';
import { MessageDto } from '../chat/chat.dto';
import { LlmService, Meter } from '../chat/llm.service';
import { FileContext } from '../chat/chat.service';
import { RetrievalService } from '../chat/retrieval.service';
import { Decision, RouterService } from '../chat/router.service';

type Tier = AnswerSettings['model'];
type Effort = AnswerSettings['effort'];
type Tech = AnswerSettings['technicality'];

interface TestItem {
  id: string;
  question: string;
  messages?: MessageDto[];
  /** File attached to the question (name inside --files-dir). */
  file?: string;
  [k: string]: unknown;
}
interface CachedRoute {
  id: string;
  qhash: string;
  type: Decision['type'];
  domains: string[];
  question?: string;
  ms: number;
  tokens: number;
}

function args() {
  const a: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    a[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
  }
  const list = <T extends string>(k: string, def: string, allowed: readonly string[]) => {
    const xs = (a[k] ?? def).split(',').map((s) => s.trim()).filter(Boolean);
    for (const x of xs) if (!allowed.includes(x)) throw new Error(`--${k}: "${x}" is not one of ${allowed.join('/')}`);
    return xs as T[];
  };
  if (!a.test || !a.out) throw new Error('--test and --out are required (see the comment at the top of run-eval.ts)');
  const mode = a.mode ?? 'auto';
  if (mode !== 'auto' && mode !== 'general') throw new Error('--mode must be auto or general');
  return {
    variant: a.variant ?? 'B0',
    models: list<Tier>('models', 'low', ['low', 'mid', 'high']),
    efforts: list<Effort>('efforts', 'mid', ['low', 'mid', 'high']),
    tech: list<Tech>('tech', 'auto', ['low', 'auto', 'high']),
    mode: mode as 'auto' | 'general',
    test: path.resolve(a.test),
    out: path.resolve(a.out),
    workers: Math.max(1, Number(a.workers ?? 4)),
    routeCache: path.resolve(a['route-cache'] ?? '../eval/runs/route-cache.jsonl'),
    limit: Number(a.limit ?? 0),
    filesDir: path.resolve(a['files-dir'] ?? '../eval/data/files'),
    fileCache: path.resolve(a['file-cache'] ?? '../eval/runs/file-cache.jsonl'),
  };
}

const readJsonl = <T>(p: string): T[] =>
  fs.existsSync(p)
    ? fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T)
    : [];
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const msgsOf = (q: TestItem): MessageDto[] => q.messages ?? [{ role: 'user', content: q.question }];

/** Runs `fn` over `items` with `n` workers at a time. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

function progress(label: string, done: number, total: number, t0: number) {
  if (done % 10 && done !== total) return;
  const min = (Date.now() - t0) / 60000;
  const left = done ? (min / done) * (total - done) : 0;
  console.log(`  ${label} ${done}/${total}  ${min.toFixed(1)} min, ~${left.toFixed(0)} min left`);
}

async function main() {
  const o = args();
  Logger.overrideLogger(['error', 'warn']);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const chat = app.get(ChatService);
  const router = app.get(RouterService);
  const retrieval = app.get(RetrievalService);
  const llm = app.get(LlmService);

  let tests = readJsonl<TestItem>(o.test);
  if (o.limit) tests = tests.slice(0, o.limit);
  fs.mkdirSync(o.out, { recursive: true });
  fs.mkdirSync(path.dirname(o.routeCache), { recursive: true });
  const answersFile = path.join(o.out, 'answers.jsonl');
  const errorsFile = path.join(o.out, 'errors.jsonl');

  // Record exactly what produced these numbers.
  const git = (...a: string[]) => {
    try { return execFileSync('git', a, { cwd: __dirname, encoding: 'utf8' }).trim(); } catch { return ''; }
  };
  const env = (k: string) => process.env[k] ?? null;
  fs.writeFileSync(path.join(o.out, 'run-config.json'), JSON.stringify({
    variant: o.variant, mode: o.mode, models: o.models, efforts: o.efforts, tech: o.tech,
    startedAt: new Date().toISOString(),
    git: { sha: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--', '../../src', '../../../retrieval') !== '' },
    test: { file: o.test, sha256: sha(fs.readFileSync(o.test)), questions: tests.length },
    modelIds: Object.fromEntries(o.models.map((m) => [m, modelId(m)])),
    env: Object.fromEntries(['RETRIEVAL_URL', 'LMSTUDIO_URL', 'LMSTUDIO_CHAT_MODEL', 'ROUTER_PROVIDER',
      'ROUTER_LMSTUDIO_MODEL', 'LLM_PROVIDER', 'GENERAL_PROVIDER', 'LMSTUDIO_REASONING', 'EVAL_TEMPERATURE',
      'FALLBACK_DOMAIN', 'FALLBACK_MIN_SCORE', 'CASES_DOMAIN', 'CASES_MIN_SCORE'].map((k) => [k, env(k)])),
    effortTable: EFFORT,
  }, null, 2));
  if (!process.env.EVAL_TEMPERATURE) console.warn('WARNING: EVAL_TEMPERATURE is not set; answers will not be repeatable.');

  const domains = o.mode === 'auto' ? await retrieval.domains() : [];
  const byId = new Map(domains.map((d) => [d.id, d]));

  // ---- 0) attached files: extracted once (same steps as FilesService.upload), reused everywhere ----
  interface CachedFile extends FileContext { file: string; sha: string; vision: string | null; kind: string;
    method: string; extractMs: number; visionMs: number; tokens: number }
  const fileCache = new Map(readJsonl<CachedFile>(o.fileCache).map((f) => [`${f.file}|${f.sha}|${f.vision}`, f]));
  const files = new Map<string, CachedFile>();
  for (const name of [...new Set(tests.map((q) => q.file).filter((f): f is string => !!f))]) {
    const buf = fs.readFileSync(path.join(o.filesDir, name));
    const vision = process.env.VISION_MODEL?.trim() || null;
    const ck = `${name}|${sha(buf)}|${vision}`;
    let f = fileCache.get(ck);
    if (!f) {
      const mime = name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.jpg') ? 'image/jpeg'
        : name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : '';
      const meter = new Meter();
      let t = Date.now();
      const ex = await retrieval.extract(buf, name, mime);
      const extractMs = Date.now() - t;
      let text = ex.text, visionMs = 0;
      if (ex.kind === 'image' && vision) {
        t = Date.now();
        const described = await llm.describeImage(ex.image ?? (await retrieval.jpeg(buf, name, mime)), meter).catch(() => '');
        visionMs = Date.now() - t;
        text = [text && `[Text read by OCR]\n${text}`, described && `[Read by the vision model]\n${described}`]
          .filter(Boolean).join('\n\n');
      }
      f = { file: name, sha: sha(buf), vision, name, text: text.trim().slice(0, 150_000), kind: ex.kind,
        method: ex.method, extractMs, visionMs, tokens: meter.tokens };
      fileCache.set(ck, f);
      fs.appendFileSync(o.fileCache, JSON.stringify(f) + '\n');
      console.log(`  file ${name}: ${ex.method}, ${f.text.length} chars, ${extractMs} ms + vision ${visionMs} ms`);
    }
    files.set(name, f);
  }
  const fileOf = (q: TestItem): FileContext | null => (q.file ? files.get(q.file) ?? null : null);

  // ---- 1) router decisions: once per question, reused by every setting and variant ----
  const cache = new Map(readJsonl<CachedRoute>(o.routeCache).map((r) => [`${r.id}|${r.qhash}`, r]));
  const key = (q: TestItem) =>
    `${q.id}|${sha(JSON.stringify(q.file ? { m: msgsOf(q), f: q.file } : msgsOf(q))).slice(0, 16)}`;
  if (o.mode === 'auto') {
    const todo = tests.filter((q) => !cache.has(key(q)));
    console.log(`Router: ${tests.length - todo.length} cached, ${todo.length} to route`);
    const t0 = Date.now();
    let n = 0;
    await pool(todo, o.workers, async (q) => {
      const meter = new Meter();
      const start = Date.now();
      const f = fileOf(q);
      const d = await router.route(msgsOf(q), domains, f && (await chat.routingFileHint(msgsOf(q), f)), { meter });
      const rec: CachedRoute = {
        id: q.id, qhash: key(q).split('|')[1], type: d.type,
        domains: d.type === 'law' ? d.domains.map((x) => x.id) : [], question: d.question,
        ms: Date.now() - start, tokens: meter.tokens,
      };
      cache.set(key(q), rec);
      fs.appendFileSync(o.routeCache, JSON.stringify(rec) + '\n');
      progress('routed', ++n, todo.length, t0);
    });
  }
  const decisionFor = (q: TestItem): Decision | undefined => {
    const r = cache.get(key(q));
    if (!r) return undefined;
    const base = r.type === 'law'
      ? { type: 'law' as const, domains: r.domains.map((id) => byId.get(id)).filter((d) => !!d) as typeof domains }
      : { type: r.type };
    return { ...base, question: r.question } as Decision;
  };

  // ---- 2) answers: every question x every setting ----
  const done = new Set(readJsonl<{ key: string }>(answersFile).map((r) => r.key));
  const tasks: { q: TestItem; s: AnswerSettings; key: string }[] = [];
  for (const m of o.models) for (const e of o.efforts) for (const t of o.tech) for (const q of tests) {
    const k = `${o.variant}|${q.id}|${m}|${e}|${t}|${o.mode}`;
    if (!done.has(k)) tasks.push({ q, s: { model: m, effort: e, technicality: t }, key: k });
  }
  const total = o.models.length * o.efforts.length * o.tech.length * tests.length;
  console.log(`Answers: ${total - tasks.length} done, ${tasks.length} to do (${o.workers} workers)`);

  const t0 = Date.now();
  let n = 0, errors = 0;
  await pool(tasks, o.workers, async ({ q, s, key: k }) => {
    const meter = new Meter();
    const start = Date.now();
    let firstToken = 0;
    try {
      const ans = await chat.reply(msgsOf(q), {
        mode: o.mode, settings: s, meter, file: fileOf(q),
        routeDecision: o.mode === 'auto' ? decisionFor(q) : undefined,
        onDelta: () => { if (!firstToken) firstToken = Date.now() - start; },
      });
      const r = cache.get(key(q));
      fs.appendFileSync(answersFile, JSON.stringify({
        key: k, variant: o.variant, id: q.id, mode: o.mode, settings: s,
        question: q.question, file: q.file ?? null, reply: ans.reply, route: ans.route, meta: ans.meta,
        corrected: r?.question ?? null,
        sources: ans.sources.map(({ excerpt, ...src }) => src),
        tokens: meter.tokens, routerTokens: r?.tokens ?? 0,
        ms: Date.now() - start, firstTokenMs: firstToken || null, routerMs: r?.ms ?? 0,
        at: new Date().toISOString(),
      }) + '\n');
    } catch (e) {
      errors++;
      fs.appendFileSync(errorsFile, JSON.stringify({ key: k, id: q.id, settings: s, error: String((e as Error)?.message ?? e), at: new Date().toISOString() }) + '\n');
    }
    progress('answered', ++n, tasks.length, t0);
  });
  console.log(`Finished: ${n - errors} answers written, ${errors} errors${errors ? ` (see ${errorsFile}; run again to retry)` : ''}`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
