import { describe, it, expect, vi } from 'vitest';
import { OP } from './constants';

// 증강 대기 상태로 시작하는 판(후보 없음) — createGame만 감싼다
vi.mock('./game', async (importOriginal) => {
  const original = await importOriginal<typeof import('./game')>();
  return {
    ...original,
    createGame: (...args: Parameters<typeof original.createGame>) => {
      const state = original.createGame(...args);
      state.augmentPending = true;
      return state;
    },
  };
});

const { simulateReplay } = await import('./replay');

describe('증강 대기 중 리플레이 — 틱이 멈춰도 끝난다 (무한 루프 방지)', () => {
  const base = { mode: 'campaign', boardKey: 'e1', seed: 1, ticks: 100 };

  it('대기 중 뒤 틱 명령은 INVALID_COMMAND', () => {
    expect(simulateReplay({ ...base, inputs: [5, OP.CALL_WAVE] })).toEqual({ ok: false, reason: 'INVALID_COMMAND' });
  });

  it('대기 중 같은 틱 명령도 PICK이 아니면 거부(후보가 없으면 PICK도 거부)', () => {
    expect(simulateReplay({ ...base, inputs: [0, OP.BUILD, 0, 0] })).toEqual({ ok: false, reason: 'INVALID_COMMAND' });
  });

  it('명령 없이 멈춘 판은 NOT_ENDED (선언 틱까지 돌지 않고 바로)', () => {
    expect(simulateReplay({ ...base, inputs: [] })).toEqual({ ok: false, reason: 'NOT_ENDED' });
  });
});
