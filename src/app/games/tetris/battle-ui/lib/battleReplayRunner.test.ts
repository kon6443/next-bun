import { describe, expect, it } from 'vitest';
import golden from '../../battle-engine/__fixtures__/golden-battle-replays.json';
import { type BattleReplayInput, type BattleReplaySuccess, encodeGarbageLog } from '../../battle-engine';
import { getBoardHash } from '../../battle-engine/engine';
import {
  type BattleReplayRunner,
  type BattleReplaySnapshot,
  ATTACK_HIGHLIGHT_MIN,
  advanceRunner,
  createReplayRunner,
  decodeGarbageLog,
  garbageGaugeOf,
  isRunnerDone,
  prepareBattleTrack,
  restoreRunner,
  seekRunner,
  takeSnapshot,
} from './battleReplayRunner';

type GoldenCase = { name: string; input: BattleReplayInput; expected: BattleReplaySuccess | { ok: false } };

/** 서버가 검증에 성공한 기록만 재생한다 */
const verified = (golden as unknown as GoldenCase[]).filter(
  (c): c is { name: string; input: BattleReplayInput; expected: BattleReplaySuccess } => c.expected.ok,
);

function runToEnd(runner: BattleReplayRunner): void {
  const buffer: number[] = [];
  while (advanceRunner(runner, buffer)) {
    // 끝까지
  }
}

/** 재생 결과를 검증 결과(simulateBattleReplay)와 같은 모양으로 */
function summarize(runner: BattleReplayRunner) {
  const { bs } = runner;
  return {
    frames: bs.game.over ? bs.game.endFrame : bs.game.frame,
    topOutFrame: bs.game.over ? bs.game.endFrame : null,
    toppedOut: bs.toppedOut,
    sent: bs.sentLog,
    garbageReceived: bs.garbageReceived,
    pieces: bs.game.pieces,
    lines: bs.game.lines,
    maxCombo: bs.game.maxCombo,
    boardHash: getBoardHash(bs.game),
  };
}

describe('대전 리플레이 재생기 — 재생 결과 = 검증한 기록', () => {
  it('가비지가 있는 케이스가 포함됐다', () => {
    expect(verified.some((c) => c.input.garbage.length > 0)).toBe(true);
    expect(verified.some((c) => c.expected.toppedOut)).toBe(true);
  });

  it.each(verified.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const runner = createReplayRunner(c.input);
    runToEnd(runner);
    expect(isRunnerDone(runner)).toBe(true);
    const { expected } = c;
    expect(summarize(runner)).toEqual({
      frames: expected.frames,
      topOutFrame: expected.topOutFrame,
      toppedOut: expected.toppedOut,
      sent: expected.sent,
      garbageReceived: expected.garbageReceived,
      pieces: expected.pieces,
      lines: expected.lines,
      maxCombo: expected.maxCombo,
      boardHash: expected.boardHash,
    });
  });

  it('스냅샷으로 되돌아가 다시 진행해도 같은 결과 (뒤로 탐색)', () => {
    for (const c of verified.filter((v) => v.input.garbage.length > 0)) {
      const straight = createReplayRunner(c.input);
      runToEnd(straight);

      const runner = createReplayRunner(c.input);
      const buffer: number[] = [];
      const half = Math.floor(c.input.frames / 2);
      while (runner.bs.game.frame < half && advanceRunner(runner, buffer)) {
        // 절반까지
      }
      const snapshot: BattleReplaySnapshot = takeSnapshot(runner);
      runToEnd(runner);
      // 끝까지 간 뒤 스냅샷으로 되돌려 다시 — 스냅샷이 진행에 오염되지 않아야 한다
      restoreRunner(runner, snapshot);
      expect(runner.bs.game.frame).toBe(snapshot.bs.game.frame);
      runToEnd(runner);
      expect(summarize(runner)).toEqual(summarize(straight));

      // 처음부터
      restoreRunner(runner, null);
      expect(runner.bs.game.frame).toBe(0);
      runToEnd(runner);
      expect(summarize(runner)).toEqual(summarize(straight));
    }
  });
});

describe('스냅샷 탐색 (seekRunner)', () => {
  it('앞으로 끝까지 → 뒤로 M = 처음부터 M, 탈락한 판보다 뒤로 가도 끝 상태 유지', () => {
    const c = verified.find((v) => v.expected.toppedOut && v.input.garbage.length > 0);
    expect(c).toBeDefined();
    if (!c) return;
    const interval = 60;
    const runner = createReplayRunner(c.input);
    const snapshots = new Map<number, BattleReplaySnapshot>();
    const buffer: number[] = [];
    seekRunner(runner, snapshots, c.input.frames + 500, interval, buffer);
    expect(runner.bs.game.over).toBe(true);
    expect(snapshots.size).toBeGreaterThan(0);

    for (const target of [Math.floor(c.input.frames / 3), interval * 2, 0, c.input.frames - 1]) {
      seekRunner(runner, snapshots, target, interval, buffer);
      const fresh = createReplayRunner(c.input);
      seekRunner(fresh, new Map(), target, interval, []);
      expect(runner.bs.game.frame).toBe(fresh.bs.game.frame);
      expect(getBoardHash(runner.bs.game)).toBe(getBoardHash(fresh.bs.game));
      expect(garbageGaugeOf(runner.bs)).toEqual(garbageGaugeOf(fresh.bs));
      expect(runner.bs.received).toEqual(fresh.bs.received);
    }
    // 다시 끝 너머로 — 탈락 프레임에서 멈춘다
    seekRunner(runner, snapshots, c.input.frames + 500, interval, buffer);
    expect(runner.bs.game.endFrame).toBe(c.expected.topOutFrame);
  });
});

describe('가비지 기록 풀기', () => {
  it('encodeGarbageLog의 역 — 도착 프레임을 절대값으로', () => {
    const events = [
      { id: 1, lines: 2, hole: 3, frame: 10 },
      { id: 2, lines: 4, hole: 0, frame: 10 },
      { id: 5, lines: 1, hole: 9, frame: 75 },
    ];
    expect(decodeGarbageLog(encodeGarbageLog(events, 100))).toEqual(events);
  });

  it('게이지 — 받은 직후는 대기, 지연이 지나면 활성', () => {
    const c = verified.find((v) => v.name === 'delay');
    expect(c).toBeDefined();
    if (!c) return;
    const runner = createReplayRunner(c.input);
    const arrival = decodeGarbageLog(c.input.garbage)[0];
    const buffer: number[] = [];
    while (runner.bs.game.frame <= arrival.frame && advanceRunner(runner, buffer)) {
      // 도착 직후까지
    }
    const gauge = garbageGaugeOf(runner.bs);
    expect(gauge.pending).toBeGreaterThan(0);
    expect(gauge.active).toBe(0);
  });
});

describe('대전 판 사전 패스 (games-polish P4·FE-13)', () => {
  const INTERVAL = 600;

  it('하이라이트 — 공격 4줄 이상 고정마다(상쇄 전 공격), 쌓여 끝난 판은 끝 프레임에 KO', async () => {
    for (const c of verified) {
      const marks = (await prepareBattleTrack(c.input, new Map(), INTERVAL))!;
      const runner = createReplayRunner(c.input);
      runToEnd(runner);
      const big = runner.bs.sentLog.filter((l) => l.attack >= ATTACK_HIGHLIGHT_MIN);
      const attacks = marks.filter((m) => m.kind === 'attack');
      // 1초 안 몰림은 첫 것만 — 골든 판들은 몰리지 않아 그대로
      expect(attacks.map((m) => [m.at, m.detail])).toEqual(big.map((l) => [l.frame, `${l.attack}줄 공격`]));
      expect(marks.filter((m) => m.kind === 'ko').map((m) => m.at)).toEqual(runner.bs.game.over ? [runner.bs.game.endFrame] : []);
    }
    // 적어도 한 골든은 큰 공격과 KO를 갖는다(테스트가 빈 데이터로 통과하지 않게)
    const all = await Promise.all(verified.map((c) => prepareBattleTrack(c.input, new Map(), INTERVAL)));
    expect(all.some((m) => m!.some((x) => x.kind === 'attack'))).toBe(true);
    expect(all.some((m) => m!.some((x) => x.kind === 'ko'))).toBe(true);
  });

  it('전 구간 스냅샷을 채워 두면 앞으로 멀리 탐색해도 가까운 스냅샷에서 — 결과는 처음부터 이어 돌린 것과 같다', async () => {
    const c = verified.reduce((a, b) => (b.input.frames > a.input.frames ? b : a));
    const snapshots = new Map<number, BattleReplaySnapshot>();
    await prepareBattleTrack(c.input, snapshots, INTERVAL);
    const last = Math.floor(c.input.frames / INTERVAL) * INTERVAL;
    expect(snapshots.has(last) || last >= c.input.frames).toBe(true);
    const target = c.input.frames - 7;
    const seeking = createReplayRunner(c.input);
    seekRunner(seeking, snapshots, target, INTERVAL, []);
    const straight = createReplayRunner(c.input);
    const buffer: number[] = [];
    while (straight.bs.game.frame < target && advanceRunner(straight, buffer)) {
      // 처음부터
    }
    expect(seeking.bs.game.frame).toBe(straight.bs.game.frame);
    expect(JSON.stringify(seeking.bs)).toBe(JSON.stringify(straight.bs));
  });

  it('앞으로 스냅샷 한 칸보다 멀리 가면 처음부터 돌리지 않고 목표 이하 가장 가까운 스냅샷에서 시작한다 (FE-13)', async () => {
    const c = verified.reduce((a, b) => (b.input.frames > a.input.frames ? b : a));
    const snapshots = new Map<number, BattleReplaySnapshot>();
    await prepareBattleTrack(c.input, snapshots, INTERVAL);
    const target = c.input.frames - 7;
    const base = Math.floor(target / INTERVAL) * INTERVAL;
    expect(base).toBeGreaterThan(INTERVAL);
    // 표식 — 그 스냅샷에서 시작했다면 점수가 이어진다(점수는 진행에 영향이 없다)
    snapshots.get(base)!.bs.game.score += 1_000_000;
    const runner = createReplayRunner(c.input);
    seekRunner(runner, snapshots, target, INTERVAL, []);
    expect(runner.bs.game.score).toBeGreaterThanOrEqual(1_000_000);
  });
});
