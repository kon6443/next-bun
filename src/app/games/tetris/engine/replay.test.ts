import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ACTION, ACTION_CODE_MAX, MAX_FRAMES, MAX_INPUT_LENGTH } from './constants';
import { createGame, stepFrame } from './game';
import { buildReplay, createInputRecorder, recordInput, simulateReplay, toReplaySuccess } from './replay';
import { nextRandom } from './random';
import golden from './__fixtures__/golden-replays.json';

type GoldenCase = { name: string; input: Parameters<typeof simulateReplay>[0]; expected: ReturnType<typeof simulateReplay> };

describe('골든 리플레이 픽스처 (백엔드와 같은 파일)', () => {
  const cases = golden as GoldenCase[];

  it('DESIGN §4-4 최소 케이스를 모두 담는다', () => {
    const names = cases.map((c) => c.name);
    for (const required of [
      'top-out-no-input',
      'line-clear-1',
      'line-clear-2',
      'line-clear-3',
      'line-clear-4',
      't-spin-mini',
      't-spin-full',
      'back-to-back',
      'combo',
      'hold',
      'das-arr-instant',
      'das-arr-repeat',
      'i-wall-kick',
      'soft-hard-drop',
      'level-up',
      'fail-invalid-header',
      'fail-invalid-input',
      'fail-input-after-end',
      'fail-not-ended',
    ]) {
      expect(names).toContain(required);
    }
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(simulateReplay(c.input)).toEqual(c.expected);
  });
});

describe('실패 사유', () => {
  const ok = golden[0].input as GoldenCase['input'];

  it('INVALID_HEADER: seed·das·arr·frames 범위·정수', () => {
    for (const bad of [
      { seed: -1 },
      { seed: 4294967296 },
      { seed: 1.5 },
      { das: 3 },
      { das: 21 },
      { arr: -1 },
      { arr: 6 },
      { frames: 0 },
      { frames: MAX_FRAMES + 1 },
    ]) {
      expect(simulateReplay({ ...ok, ...bad })).toEqual({ ok: false, reason: 'INVALID_HEADER' });
    }
  });

  it('INVALID_INPUT: 홀수 길이·음수 delta·없는 코드·정수 아님·길이 초과', () => {
    for (const inputs of [
      [0],
      [-1, ACTION.HARD_DROP],
      [0, ACTION_CODE_MAX + 1],
      [0.5, ACTION.HARD_DROP],
      new Array(MAX_INPUT_LENGTH + 2).fill(0),
    ]) {
      expect(simulateReplay({ ...ok, inputs })).toEqual({ ok: false, reason: 'INVALID_INPUT' });
    }
  });

  it('NOT_ENDED: frames에 게임이 끝나지 않았거나, 그 전에 끝났다', () => {
    expect(simulateReplay({ ...ok, frames: ok.frames - 1 })).toEqual({ ok: false, reason: 'NOT_ENDED' });
    expect(simulateReplay({ ...ok, frames: ok.frames + 1 })).toEqual({ ok: false, reason: 'NOT_ENDED' });
  });

  it('INPUT_AFTER_END: 게임 오버 프레임 이후 입력', () => {
    expect(simulateReplay({ ...ok, inputs: [ok.frames, ACTION.HARD_DROP] })).toEqual({
      ok: false,
      reason: 'INPUT_AFTER_END',
    });
  });
});

describe('실시간 플레이 = 리플레이', () => {
  /** 의사 난수로 입력을 고르는 플레이 — stepFrame에 넘긴 입력을 그대로 기록 */
  function playRandom(seed: number, das: number, arr: number) {
    const state = createGame({ seed, das, arr });
    const recorder = createInputRecorder();
    let rng = seed ^ 0x5bd1e995;
    const actions: number[] = [];
    while (!state.over && state.frame < MAX_FRAMES) {
      actions.length = 0;
      const [next, value] = nextRandom(rng);
      rng = next;
      if (value % 4 === 0) actions.push(value % (ACTION_CODE_MAX + 1));
      if (value % 97 === 0) actions.push(ACTION.HARD_DROP);
      const frame = state.frame;
      const applied = stepFrame(state, actions, actions.length);
      for (let i = 0; i < applied; i++) recordInput(recorder, frame, actions[i]);
    }
    return { state, recorder };
  }

  it.each([1, 2, 3, 42, 777, 65535, 4294967295])('seed %i', (seed) => {
    const { state, recorder } = playRandom(seed, 4 + (seed % 17), seed % 6);
    expect(state.over).toBe(true);
    const replay = buildReplay(state, recorder);
    expect(simulateReplay({ seed, ...replay })).toEqual(toReplaySuccess(state));
  });
});

describe('엔진 계약 — 백엔드 복사 대상 폴더의 금지 사항', () => {
  const dir = __dirname;
  const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it.each(sources)('%s: 외부 import·DOM·Date·Math.random·부동소수 리터럴 없음', (file) => {
    const code = readFileSync(join(dir, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const m of code.matchAll(/from\s+'([^']+)'/g)) expect(m[1].startsWith('./')).toBe(true);
    expect(code).not.toMatch(/Math\.random|\bDate\b|\bwindow\b|\bdocument\b|performance\./);
    expect(code).not.toMatch(/\b\d+\.\d+\b/);
  });
});
