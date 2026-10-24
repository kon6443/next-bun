/**
 * 디펜스 엔진 기준선 측정 (리팩토링 0단계) — plain Node에서 돈다(vitest는 같은 코드가 1.5~2.8배 느리게 나온다, perf.test 머리 주석)
 * 실행(레포 루트):
 *   node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/bin/esbuild src/app/games/defense/engine-dev/baseline/bench.ts \
 *     --bundle --platform=node --format=cjs --outfile=$TMPDIR/defense-bench.cjs \
 *   && node --expose-gc $TMPDIR/defense-bench.cjs > src/app/games/defense/engine-dev/baseline/BASELINE.json
 * 판은 코퍼스(corpus.expected.json)에서 고른다 — 무한·주간 최장 판, 캠페인 최종 스테이지(s8-hard) 최장 판, 골든 최장 판(백엔드 기준선과 같은 판)
 * 각 측정: 워밍업 1회 + 5회 — 중앙값·최소·최대(ms)
 * GC: 5회 측정 동안 PerformanceObserver 'gc' 항목을 종류별로(minor = 스캐빈지, major = 마크·컴팩트) 센다
 * 할당(추정): 판 1회당 스캐빈지 수 × 새 공간 반쪽(semi-space) 용량 — 스캐빈지는 반쪽이 찰 때마다 돈다. 엔진의 핫패스 할당 압력 지표
 * 남은 힙: gc() 뒤 1회 실행의 heapUsed 증가(살아남는 것 — 리플레이 결과·스냅샷 등)
 */

import { PerformanceObserver, performance } from 'node:perf_hooks';
import { getHeapSpaceStatistics } from 'node:v8';
import * as engine from '../../engine';
import { type ReplayInput, resolveBoard, simulateReplay } from '../../engine';
import { restoreGame, restoreGameInChunks } from '../../lib/restoreGame';
import { prepareReplay } from '../../lib/replayRunner';
import corpusFixture from '../corpus/corpus.expected.json';
import { type CorpusExpected, corpusCase, playCorpusCase } from '../corpus/corpus';
import { buildGoldenCases } from '../goldenCases';

type Stats = { medianMs: number; minMs: number; maxMs: number; runs: number[] };

const round = (n: number) => Math.round(n * 100) / 100;

function stats(runs: number[]): Stats {
  const sorted = [...runs].sort((a, b) => a - b);
  return { medianMs: round(sorted[Math.floor(sorted.length / 2)]), minMs: round(sorted[0]), maxMs: round(sorted[sorted.length - 1]), runs: runs.map(round) };
}

let gcMinor = 0;
let gcMajor = 0;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    // detail.kind: 1 minor(스캐빈지) · 2 major · 4 incremental · 8 weak callbacks
    const kind = (entry as unknown as { detail?: { kind?: number } }).detail?.kind ?? 0;
    if (kind === 1) gcMinor++;
    else gcMajor++;
  }
}).observe({ entryTypes: ['gc'] });

/** 새 공간 반쪽 용량(MB) — 스캐빈지 한 번이 대략 이만큼의 새 할당을 뜻한다 */
function semiSpaceMB(): number {
  const space = getHeapSpaceStatistics().find((s) => s.space_name === 'new_space');
  return space ? space.space_size / 2 / 2 ** 20 : 0;
}

const gc = (globalThis as { gc?: () => void }).gc;

/** 동기 측정 — 워밍업 1 + 5회, 그리고 gc 뒤 1회의 힙 증가·GC 횟수 */
/** PerformanceObserver는 비동기로 전달한다 — 센 값을 읽기 전에 한 바퀴 돌린다 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

async function measureSync(fn: () => unknown): Promise<Stats & { scavengesPerRun: number; majorGcPerRun: number; estAllocMBPerRun: number; retainedMB: number | null }> {
  fn();
  await flush();
  const minorBefore = gcMinor;
  const majorBefore = gcMajor;
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    fn();
    runs.push(performance.now() - t0);
  }
  await flush();
  const scavengesPerRun = round((gcMinor - minorBefore) / 5);
  const majorGcPerRun = round((gcMajor - majorBefore) / 5);
  let retainedMB: number | null = null;
  if (gc) {
    gc();
    const before = process.memoryUsage().heapUsed;
    fn();
    retainedMB = round((process.memoryUsage().heapUsed - before) / 2 ** 20);
  }
  return { ...stats(runs), scavengesPerRun, majorGcPerRun, estAllocMBPerRun: round(scavengesPerRun * semiSpaceMB()), retainedMB };
}

/** 비동기(청크) 측정 — 전체 시간과, 쉬는 틈(setTimeout 0) 사이 한 묶음의 최장 시간(메인 스레드가 멈추는 최장 구간) */
async function measureChunks(run: (onProgress: () => void) => Promise<unknown>): Promise<{ total: Stats; worstChunk: Stats; chunks: number }> {
  const totals: number[] = [];
  const worst: number[] = [];
  let chunks = 0;
  for (let i = 0; i < 6; i++) {
    let last = performance.now();
    let worstChunk = 0;
    let n = 0;
    const t0 = last;
    await run(() => {
      const now = performance.now();
      worstChunk = Math.max(worstChunk, now - last);
      n++;
      // 다음 묶음은 setTimeout(0) 뒤 — 쉬는 틈을 빼려고 다음 틱에 기준을 다시 잡는다
      setImmediate(() => {
        last = performance.now();
      });
    });
    if (i === 0) continue; // 워밍업
    totals.push(performance.now() - t0);
    worst.push(worstChunk);
    chunks = n;
  }
  return { total: stats(totals), worstChunk: stats(worst), chunks };
}

const corpus = (corpusFixture as { cases: CorpusExpected[] }).cases;

/** 코퍼스에서 조건에 맞는 최장 판(판 상한 idle 제외) */
function longest(pred: (mode: string, boardKey: string) => boolean): { id: number; input: ReplayInput } {
  let best: CorpusExpected | null = null;
  for (const e of corpus) {
    const c = corpusCase(e.id);
    if (c.bot === 'idle' || !pred(c.mode, c.boardKey)) continue;
    if (!best || e.ticks > best.ticks) best = e;
  }
  if (!best) throw new Error('판 없음');
  return { id: best.id, input: playCorpusCase(corpusCase(best.id)) };
}

async function main() {
  const scenarios: { name: string; id?: number; input: ReplayInput }[] = [];
  const endless = longest((m) => m === 'endless');
  scenarios.push({ name: `corpus-c${endless.id}-endless-longest`, ...endless });
  const weekly = longest((m) => m === 'weekly');
  scenarios.push({ name: `corpus-c${weekly.id}-weekly-longest`, ...weekly });
  const finale = longest((m, k) => m === 'campaign' && k === 's8-hard');
  scenarios.push({ name: `corpus-c${finale.id}-campaign-s8-hard-longest`, ...finale });
  const goldens = buildGoldenCases().filter((c) => c.expected.ok && c.input.inputs.length > 0);
  const golden = goldens.reduce((a, b) => (b.input.ticks > a.input.ticks ? b : a));
  scenarios.push({ name: `golden:${golden.name}`, input: golden.input });

  const out: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    env: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cpu: (await import('node:os')).cpus()[0]?.model,
      gcExposed: Boolean(gc),
      execArgv: process.execArgv,
      semiSpaceMB: round(semiSpaceMB()),
      loadAvg: (await import('node:os')).loadavg().map(round),
    },
    replay: {} as Record<string, unknown>,
  };
  const replay = out.replay as Record<string, unknown>;
  for (const s of scenarios) {
    const r = await measureSync(() => simulateReplay(s.input));
    replay[s.name] = { ticks: s.input.ticks, commands: s.input.inputs.length, ...r };
  }

  // 이어하기 복원 — 최장 판(무한)을 끝 직전까지 다시 돌린다(최악). 청크(RESTORE_CHUNK_TICKS)마다 쉰다
  const worstInput = endless.input;
  const stage = resolveBoard(worstInput.mode, worstInput.boardKey, worstInput.seed)!;
  const restoreTick = worstInput.ticks - 1;
  out.restore = {
    scenario: scenarios[0].name,
    tick: restoreTick,
    sync: await measureSync(() => restoreGame(stage, worstInput.seed, worstInput.inputs, restoreTick)),
    chunked: await measureChunks((onProgress) => restoreGameInChunks(stage, worstInput.seed, worstInput.inputs, restoreTick, { onProgress })),
  };

  // 재생 준비(사전 패스·스냅샷·하이라이트) — 같은 최장 판
  out.prepareReplay = {
    scenario: scenarios[0].name,
    ...(await measureChunks((onProgress) => prepareReplay(engine, worstInput, onProgress))),
  };

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

void main();
