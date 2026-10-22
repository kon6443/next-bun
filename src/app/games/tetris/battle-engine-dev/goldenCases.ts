/**
 * 개발 도구 — 대전 래퍼 골든 픽스처 케이스를 실제 플레이로 만든다 (DESIGN §15)
 * 결과 파일: ../battle-engine/__fixtures__/golden-battle-replays.json (백엔드 사본과 바이트 단위로 같은 파일)
 *
 * 입력은 엔진 골든 리플레이(실제 플레이)를 재사용하고, 서버가 보냈을 가비지를 일정대로 받게 해 대전 한 판을 다시 돌린다.
 * 퍼펙트 클리어는 넣지 않는다 — 가비지는 줄 없는 고정 뒤에만 들어와 그 블록이 판에 남으므로 가비지 판의 PC는
 * 짧은 구간에 가로 I가 두 번 필요하고(가방 경계에서만 가능), 빈 판 PC는 블록 10개 탐색이 필요해 비용 대비 이득이 작다.
 * PC 판정은 판만 보는 순수 함수라 battle.test.ts가 판을 직접 꾸며 검증한다(백엔드 사본도 같은 테스트 파일을 돌린다)
 */

import engineGolden from '../engine/__fixtures__/golden-replays.json';
import { ACTION, DEFAULT_ARR, DEFAULT_DAS, type ReplayInput, getBoardHash } from '../engine';
import { type Candidate, hardDropCandidates } from '../engine-dev/ai';
import {
  BATTLE_ENGINE_VERSION,
  type BattleLock,
  GARBAGE_DELAY_FRAMES,
  type BattleReplayInput,
  type BattleReplayResult,
  type BattleState,
  buildBattleReplay,
  createBattle,
  receiveGarbage,
  simulateBattleReplay,
  stepBattle,
} from '../battle-engine';

export type BattleGoldenCase = { name: string; input: BattleReplayInput; expected: BattleReplayResult };

type ScheduledGarbage = { frame: number; lines: number; hole: number };

/** 입력 기록이 있는 대전 한 판 — 실제로 적용된 입력만 기록한다 */
class BattleDriver {
  readonly bs: BattleState;
  readonly inputs: number[] = [];
  /** 모든 고정 결과 (공격이 없던 고정 포함) — 케이스 확인용 */
  readonly locks: BattleLock[] = [];
  private lastInputFrame = 0;
  private nextId = 1;

  constructor(seed: number, readonly das: number, readonly arr: number) {
    this.bs = createBattle({ seed, das, arr });
  }

  receive(lines: number, hole: number): void {
    receiveGarbage(this.bs, { id: this.nextId++, lines, hole });
  }

  step(actions: number[] = []): void {
    const frame = this.bs.game.frame;
    const { applied, lock } = stepBattle(this.bs, actions, actions.length);
    if (lock) this.locks.push(lock);
    for (let i = 0; i < applied; i++) {
      this.inputs.push(frame - this.lastInputFrame, actions[i]);
      this.lastInputFrame = frame;
    }
  }

  toReplay(): BattleReplayInput {
    return buildBattleReplay(this.bs, this.inputs, this.das, this.arr);
  }
}

function engineCase(name: string): ReplayInput {
  const found = (engineGolden as { name: string; input: ReplayInput }[]).find((c) => c.name === name);
  if (!found) throw new Error(`엔진 골든 케이스가 없다: ${name}`);
  return found.input;
}

/** 엔진 입력 기록 → 프레임별 동작 */
function framesOf(inputs: readonly number[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  let frame = 0;
  for (let i = 0; i < inputs.length; i += 2) {
    frame += inputs[i];
    const list = out.get(frame);
    if (list) list.push(inputs[i + 1]);
    else out.set(frame, [inputs[i + 1]]);
  }
  return out;
}

/**
 * 엔진 골든 입력을 대전으로 다시 돌린다 — 매 프레임 그 프레임에 도착할 가비지를 먼저 받고 입력을 넣는다
 * 탈락하면 거기서, 아니면 maxFrames까지(살아남은 플레이어의 기록)
 */
function replayWithGarbage(source: ReplayInput, garbage: ScheduledGarbage[], maxFrames = source.frames): BattleDriver {
  const driver = new BattleDriver(source.seed, source.das, source.arr);
  const actionsAt = framesOf(source.inputs);
  const schedule = [...garbage].sort((a, b) => a.frame - b.frame);
  let next = 0;
  while (!driver.bs.game.over && driver.bs.game.frame < maxFrames) {
    const frame = driver.bs.game.frame;
    while (next < schedule.length && schedule[next].frame === frame) {
      driver.receive(schedule[next].lines, schedule[next].hole);
      next++;
    }
    driver.step(actionsAt.get(frame) ?? []);
  }
  // 살아남아 maxFrames에 멈췄다면 그 프레임에 도착한 가비지는 받기만 한다(진행하지 않음 → 기록에서 빠져야 한다)
  while (!driver.bs.game.over && next < schedule.length && schedule[next].frame === driver.bs.game.frame) {
    driver.receive(schedule[next].lines, schedule[next].hole);
    next++;
  }
  return driver;
}

function finish(name: string, driver: BattleDriver, check?: (result: BattleReplayResult, driver: BattleDriver) => string | null): BattleGoldenCase {
  const input = driver.toReplay();
  const expected = simulateBattleReplay(input);
  if (!expected.ok) throw new Error(`${name}: 리플레이 실패 ${expected.reason}`);
  if (JSON.stringify(simulateBattleReplay(input)) !== JSON.stringify(expected)) throw new Error(`${name}: 재실행 결과가 다르다`);
  const { bs } = driver;
  if (
    expected.pieces !== bs.game.pieces ||
    expected.garbageReceived !== bs.garbageReceived ||
    expected.toppedOut !== bs.toppedOut ||
    expected.frames !== (bs.game.over ? bs.game.endFrame : bs.game.frame) ||
    expected.boardHash !== getBoardHash(bs.game) ||
    JSON.stringify(expected.sent) !== JSON.stringify(bs.sentLog)
  ) {
    throw new Error(`${name}: 실시간 결과와 리플레이 결과가 다르다`);
  }
  const problem = check?.(expected, driver) ?? null;
  if (problem) throw new Error(`${name}: ${problem}`);
  return { name, input, expected };
}

/** 고정 프레임 목록 (가비지 없이) — 지연 케이스의 도착 시점을 잡는다 */
function lockFrames(source: ReplayInput): number[] {
  const driver = new BattleDriver(source.seed, source.das, source.arr);
  const actionsAt = framesOf(source.inputs);
  const frames: number[] = [];
  while (!driver.bs.game.over && driver.bs.game.frame < source.frames) {
    const before = driver.bs.game.pieces;
    driver.step(actionsAt.get(driver.bs.game.frame) ?? []);
    if (driver.bs.game.pieces !== before) frames.push(driver.bs.game.lastLock?.frame ?? -1);
  }
  return frames;
}

// ==================== 래퍼 탑아웃 ====================

/** 이 고정으로 새로 생긴 칸이 모두 cols 안에 있는가 */
function placedWithin(before: Uint8Array, after: Uint8Array, minCol: number, maxCol: number): boolean {
  for (let i = 0; i < after.length; i++) {
    if (before[i] === 0 && after[i] !== 0) {
      const col = i % 10;
      if (col < minCol || col > maxCol) return false;
    }
  }
  return true;
}

function topRow(board: Uint8Array, minCol: number, maxCol: number): number {
  for (let row = 0; row < 40; row++) {
    for (let col = minCol; col <= maxCol; col++) if (board[row * 10 + col] !== 0) return row;
  }
  return 40;
}

/**
 * 가비지가 블록을 판 맨 위 밖으로 밀어내는 탑아웃 — 왼쪽 벽(0~2열)에 탑을 쌓아 숨은 줄 근처까지 올린 뒤
 * 8줄씩 연속으로 받고, 이후 블록은 오른쪽 벽(7~9열)에만 놓는다. 가운데(생성 위치)는 비어 있어 블록 아웃이 먼저 나지 않는다
 */
function wallTopOutCase(): BattleGoldenCase {
  for (let seed = 1; seed <= 200; seed++) {
    const driver = new BattleDriver(seed, DEFAULT_DAS, DEFAULT_ARR);
    const pick = (minCol: number, maxCol: number, score: (c: Candidate) => number): Candidate | null => {
      const board = driver.bs.game.board;
      let best: Candidate | null = null;
      for (const c of hardDropCandidates(driver.bs.game)) {
        if (c.after.over || (c.after.lastLock?.lines ?? 0) > 0 || !placedWithin(board, c.after.board, minCol, maxCol)) continue;
        if (!best || score(c) < score(best)) best = c;
      }
      return best;
    };
    const idle = () => {
      for (let i = 0; i < 100 && !driver.bs.game.active && !driver.bs.game.over; i++) driver.step();
    };
    // 1. 왼쪽 탑 — 탑 꼭대기가 20행(보이는 첫 줄) 근처가 될 때까지
    let ok = true;
    while (topRow(driver.bs.game.board, 0, 2) > 21) {
      idle();
      const c = pick(0, 2, (cand) => topRow(cand.after.board, 0, 2));
      if (!c) {
        ok = false;
        break;
      }
      for (const actions of c.frames) driver.step(actions);
    }
    if (!ok || driver.bs.game.over) continue;
    // 2. 8줄씩 세 번 받는다 — 30프레임 뒤부터 고정마다 8줄
    for (let i = 0; i < 3; i++) driver.receive(8, 4 + (i % 2));
    for (let i = 0; i < 30 && !driver.bs.game.over; i++) driver.step();
    // 3. 오른쪽 벽 낮은 곳에만 놓는다
    for (let n = 0; n < 6 && !driver.bs.game.over; n++) {
      idle();
      if (driver.bs.game.over) break;
      const c = pick(7, 9, (cand) => -topRow(cand.after.board, 7, 9));
      if (!c) break;
      for (const actions of c.frames) driver.step(actions);
    }
    if (!driver.bs.toppedOut) continue;
    return finish('garbage-top-out', driver, (r) => (r.ok && r.toppedOut ? null : '래퍼 탑아웃이 아니다'));
  }
  throw new Error('garbage-top-out: 찾지 못했다');
}

// ==================== 케이스 ====================

/** 콤보 판의 연속 삭제(1015·1036·1057프레임) 직전에 활성되도록 */
const COMBO_GARBAGE_ARRIVAL = 980;

export function buildBattleGoldenCases(): BattleGoldenCase[] {
  const cases: BattleGoldenCase[] = [];

  // 공격표 — 가비지 없이 엔진 골든 판을 대전으로 (더블·트리플·테트리스·T-스핀·B2B·콤보)
  for (const name of ['line-clear-2', 'line-clear-3', 't-spin-mini', 't-spin-full', 'back-to-back', 'combo']) {
    cases.push(
      finish(`attack-${name}`, replayWithGarbage(engineCase(name), []), (r) =>
        r.ok && r.sent.length > 0 ? null : '공격이 한 번도 없다',
      ),
    );
  }

  // 상쇄 — 첫 테트리스(91프레임) 직전에 3줄·3줄을 받는다 → 4줄 공격이 상쇄로 줄어든다
  cases.push(
    finish(
      'offset',
      replayWithGarbage(engineCase('back-to-back'), [
        { frame: 80, lines: 3, hole: 2 },
        { frame: 85, lines: 3, hole: 6 },
      ]),
      (r) => (r.ok && r.sent.some((s) => s.cancelled > 0 && s.sent < s.attack) ? null : '상쇄가 없다'),
    ),
  );

  // 콤보 차단 — 연속 삭제(1015·1036·1057프레임) 직전에 8줄이 활성된다. 줄을 지우는 동안은 상쇄만 되고 판에 들어오지 않다가
  // 콤보가 끊긴 첫 고정에 남은 줄이 들어온다
  cases.push(
    finish('combo-blocking', replayWithGarbage(engineCase('combo'), [{ frame: COMBO_GARBAGE_ARRIVAL, lines: 8, hole: 4 }]), (_r, d) => {
      // 활성 뒤 줄을 지운 고정이 있었고 그 고정들에는 삽입이 0, 이후 줄 없는 고정에서 남은 줄이 들어온다
      const activeAt = COMBO_GARBAGE_ARRIVAL + GARBAGE_DELAY_FRAMES;
      const clearsWhileActive = d.locks.filter((l) => l.frame >= activeAt && l.attack > 0 && l.garbageApplied === 0 && l.cancelled > 0);
      const applied = d.locks.find((l) => l.frame >= activeAt && l.garbageApplied > 0);
      const leaked = d.locks.some((l) => l.frame >= activeAt && l.attack > 0 && l.garbageApplied > 0);
      return !leaked && clearsWhileActive.length > 0 && applied !== undefined && applied.frame > clearsWhileActive[0].frame
        ? null
        : '콤보 차단 상황이 아니다';
    }),
  );

  // 캡 8 분할 — 12줄을 한 번에 받으면 8줄 + 4줄로 나뉘어 들어온다
  cases.push(
    finish('cap-split', replayWithGarbage(engineCase('line-clear-1'), [{ frame: 0, lines: 12, hole: 4 }]), (r, d) =>
      r.ok && d.bs.garbageReceived >= 12 ? null : '12줄이 다 들어오지 않았다',
    ),
  );

  // 지연 30 — 고정 5프레임 전에 도착한 가비지는 그 고정에 들어오지 않고 다음(활성 뒤) 고정에 들어온다
  {
    const source = engineCase('soft-hard-drop');
    const locks = lockFrames(source);
    const arrival = locks[2] - 5;
    cases.push(
      finish('delay', replayWithGarbage(source, [{ frame: arrival, lines: 3, hole: 5 }]), (_r, d) => {
        // 도착 5프레임 뒤 고정에서는 아직 비활성이라 0줄, 활성(도착 + 30) 뒤 첫 줄 없는 고정에서 3줄
        const atArrival = d.locks.find((l) => l.frame === locks[2]);
        const firstApplied = d.locks.find((l) => l.garbageApplied > 0);
        return atArrival?.garbageApplied === 0 && firstApplied?.garbageApplied === 3 && firstApplied.frame >= arrival + 30
          ? null
          : '지연 상황이 아니다';
      }),
    );
  }

  // 가비지로 탈락 — 60프레임마다 8줄씩 받는다. 숨은 줄이 20줄이라 판 맨 위를 넘기 전에
  // 밀려 올라온 블록이 생성 위치를 막아 엔진 블록 아웃으로 끝나는 것이 실제 경로다(맨 위 탑아웃은 단위 테스트)
  {
    const garbage: ScheduledGarbage[] = [];
    for (let i = 0; i < 20; i++) garbage.push({ frame: 10 + i * 60, lines: 8, hole: i % 10 });
    const source = engineCase('das-arr-instant');
    cases.push(
      finish('garbage-block-out', replayWithGarbage(source, garbage), (r) =>
        r.ok && r.topOutFrame !== null && r.topOutFrame < source.frames && r.garbageReceived >= 16
          ? null
          : '가비지를 받고 원래보다 일찍 끝나지 않았다',
      ),
    );
  }

  // 가비지가 블록을 판 맨 위 밖으로 밀어내는 래퍼 탑아웃
  cases.push(wallTopOutCase());

  // 살아남은 플레이어 — 탈락 없이 경기 종료 프레임까지 (마지막 프레임 도착 가비지는 기록에서 빠진다)
  cases.push(
    finish('survivor', replayWithGarbage(engineCase('back-to-back'), [{ frame: 300, lines: 2, hole: 3 }, { frame: 1200, lines: 1, hole: 1 }], 1200), (r, d) =>
      r.ok && r.topOutFrame === null && r.frames === 1200 && d.bs.received.length === 2 && d.toReplay().garbage.length === 4
        ? null
        : '살아남은 기록이 아니거나 마지막 프레임 가비지가 기록에 남았다',
    ),
  );

  // 거절 케이스 — 백엔드 검증이 같은 이유로 거절해야 한다
  const ok = cases[cases.length - 1].input;
  const reject = (name: string, input: BattleReplayInput): BattleGoldenCase => {
    const expected = simulateBattleReplay(input);
    if (expected.ok) throw new Error(`${name}: 거절되어야 한다`);
    return { name, input, expected };
  };
  cases.push(reject('fail-invalid-header', { ...ok, battleEngineVersion: BATTLE_ENGINE_VERSION + 1 }));
  cases.push(reject('fail-invalid-input', { ...ok, inputs: [0, ACTION.HARD_DROP, 0] }));
  cases.push(reject('fail-invalid-garbage', { ...ok, garbage: [0, 2, 1, 0, 5, 2, 1, 0] }));
  cases.push(reject('fail-garbage-after-end', { ...ok, garbage: [...ok.garbage, 1200, 99, 1, 0] }));
  const topOut = cases.find((c) => c.name === 'garbage-block-out');
  if (!topOut) throw new Error('garbage-block-out 케이스가 없다');
  cases.push(reject('fail-frames-mismatch', { ...topOut.input, frames: topOut.input.frames + 10 }));
  cases.push(reject('fail-input-after-end', { ...topOut.input, inputs: [...topOut.input.inputs, topOut.input.frames, ACTION.HARD_DROP] }));

  return cases;
}

export function formatBattleGoldenJson(cases: BattleGoldenCase[]): string {
  const body = cases
    .map(
      (c) =>
        `  {\n    "name": ${JSON.stringify(c.name)},\n    "input": ${JSON.stringify(c.input)},\n    "expected": ${JSON.stringify(c.expected)}\n  }`,
    )
    .join(',\n');
  return `[\n${body}\n]\n`;
}
