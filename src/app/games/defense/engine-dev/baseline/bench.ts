/**
 * 디펜스 엔진 기준선 측정 (리팩토링 0단계) — plain Node에서 돈다(vitest는 같은 코드가 1.5~2.8배 느리게 나온다, perf.test 머리 주석)
 * 실행(레포 루트):
 *   node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/bin/esbuild src/app/games/defense/engine-dev/baseline/bench.ts \
 *     --bundle --platform=node --format=cjs --outfile=$TMPDIR/defense-bench.cjs \
 *   && node --expose-gc --min-semi-space-size=16 --max-semi-space-size=16 $TMPDIR/defense-bench.cjs > src/app/games/defense/engine-dev/baseline/BASELINE.json
 * 비교는 같은 Node·같은 플래그·낮은 부하(env.loadAvg)끼리만 한다 — 리팩토링 전후를 같은 명령으로 잰다
 * 판은 코퍼스(corpus.expected.json)에서 고른다 — 무한·주간 최장 판, 캠페인 최종 스테이지(s8-hard) 최장 판, 골든 최장 판(백엔드 기준선과 같은 판)
 * 각 측정: 워밍업 3회(JIT tier-up) + 5회 — 중앙값·최소·최대(ms)
 * GC: 5회 측정 동안 PerformanceObserver 'gc' 항목을 종류별로 센다(perf_hooks.constants — MINOR 1 스캐빈지 · MAJOR 4 마크·컴팩트, 증분·약한 콜백은 따로)
 * 할당(추정): 판 1회당 스캐빈지 수 × 새 공간 반쪽(semi-space) 용량 — semi-space를 플래그로 고정해 시나리오·전후 비교가 같은 배율이 되게 한다.
 *   major GC가 거둔 젊은 세대 할당은 세지 않는다(하한 추정). 엔진 핫패스 할당 압력 지표
 * 남은 힙: 결과를 붙잡은 채 gc() 전후의 heapUsed 차 — 실행이 남기는 것(결과 객체·캐시). ±0.02MB는 잡음 — MB 단위 누수만 본다
 * 할당 추정 배율은 위 명령의 `--max-semi-space-size=N` 형태만 읽는다(밑줄·공백·NODE_OPTIONS 형태면 측정값으로 돌아가 비교할 수 없다 — env.allocEstimateSemiSpaceMB 확인)
 * 청크 최장 구간: 쉬는 틈(setTimeout 0, 약 1ms)이 다음 묶음에 섞여 약 3% 크게 나온다 — 전후 비교에는 같은 편향
 */

import { PerformanceObserver, constants, performance } from 'node:perf_hooks';
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
    const kind = (entry as unknown as { detail?: { kind?: number } }).detail?.kind ?? 0;
    if (kind === constants.NODE_PERFORMANCE_GC_MINOR) gcMinor++;
    else if (kind === constants.NODE_PERFORMANCE_GC_MAJOR) gcMajor++;
  }
}).observe({ entryTypes: ['gc'] });

/** 새 공간 반쪽 용량(MB) — 스캐빈지 한 번이 대략 이만큼의 새 할당을 뜻한다 */
function semiSpaceMB(): number {
  const space = getHeapSpaceStatistics().find((s) => s.space_name === 'new_space');
  return space ? space.space_size / 2 / 2 ** 20 : 0;
}

const gc = (globalThis as { gc?: () => void }).gc;
/**
 * 할당 추정 배율 — --max-semi-space-size(MB)로 고정한 값. V8이 실제로 잡는 크기는 늦게 커져 측정값(semiSpaceMB)은 배율로 못 쓴다
 * 플래그가 없으면 측정값(비교 불가 — env에 시작·끝 값을 남긴다)
 */
const SEMI_SPACE_FLAG = /^--max-semi-space-size=(\d+)$/;
const SEMI_SPACE_MB_AT_START = Number(process.execArgv.map((arg) => SEMI_SPACE_FLAG.exec(arg)?.[1]).find(Boolean) ?? semiSpaceMB());

/** 동기 측정 — 워밍업 3 + 5회, GC 종류별 횟수, 남은 힙(결과를 붙잡은 채 gc 전후 — 0.01MB 아래는 잡음) */
/** PerformanceObserver는 비동기로 전달한다 — 센 값을 읽기 전에 한 바퀴 돌린다 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

async function measureSync(fn: () => unknown): Promise<Stats & { scavengesPerRun: number; majorGcPerRun: number; estAllocMBPerRun: number; retainedMB: number | null }> {
  for (let i = 0; i < 3; i++) fn();
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
    let held: unknown = fn();
    gc();
    retainedMB = round((process.memoryUsage().heapUsed - before) / 2 ** 20);
    held = null;
    void held;
  }
  return { ...stats(runs), scavengesPerRun, majorGcPerRun, estAllocMBPerRun: round(scavengesPerRun * SEMI_SPACE_MB_AT_START), retainedMB };
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
  const input = playCorpusCase(corpusCase(best.id));
  // 봇·픽스처가 바뀌면 다른 판을 재게 된다 — 픽스처와 같은 판인지 확인
  if (input.ticks !== best.ticks) throw new Error(`코퍼스 #${best.id}: 다시 만든 판 ${input.ticks}틱 ≠ 픽스처 ${best.ticks}틱`);
  return { id: best.id, input };
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
      allocEstimateSemiSpaceMB: SEMI_SPACE_MB_AT_START,
      semiSpaceMBAtStart: round(semiSpaceMB()),
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

  (out.env as Record<string, unknown>).semiSpaceMBAtEnd = round(semiSpaceMB());
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

void main();
