// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ACTION } from '../../engine';
import { type BattleLock, type BattleReplayInput, type BattleState, simulateBattleReplay } from '../../battle-engine';
import { useBattlePlay } from './useBattlePlay';

describe('useBattlePlay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => {
    const onLock = vi.fn<(lock: BattleLock, bs: BattleState) => void>();
    const onOver = vi.fn<(bs: BattleState, replay: BattleReplayInput) => void>();
    const hook = renderHook(() => useBattlePlay({ onLock, onOver }));
    return { ...hook, onLock, onOver };
  };

  it('받은 가비지를 섞은 실시간 판을 리플레이로 돌리면 같은 결과 (서버 경기 후 검증과 같은 순서)', () => {
    const { result, onOver } = setup();
    act(() => result.current.start(424242, 8, 1));
    let garbageId = 1;
    for (let i = 0; i < 6000 && onOver.mock.calls.length === 0; i++) {
      act(() => {
        if (i % 9 === 0) result.current.instant(ACTION.HARD_DROP);
        if (i % 5 === 0) result.current.press(ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE);
        if (i % 5 === 2) result.current.release(ACTION.LEFT_PRESS);
        if (i % 40 === 0) result.current.receive({ id: garbageId++, lines: 2, hole: i % 10 });
        vi.advanceTimersByTime(17);
      });
    }
    expect(onOver).toHaveBeenCalledTimes(1);
    const [bs, replay] = onOver.mock.calls[0];
    expect(replay.garbage.length).toBeGreaterThan(0);
    const verified = simulateBattleReplay(replay);
    expect(verified).toMatchObject({ ok: true, pieces: bs.game.pieces, garbageReceived: bs.garbageReceived, topOutFrame: bs.game.endFrame });
    expect(result.current.status).toBe('over');
  });

  it('창을 벗어나도 멈추지 않는다(대전) — 누르던 키만 뗀다', () => {
    const { result } = setup();
    act(() => result.current.start(1, 10, 2));
    act(() => {
      result.current.press(ACTION.SOFT_DROP_PRESS, ACTION.SOFT_DROP_RELEASE);
      vi.advanceTimersByTime(100);
    });
    const before = result.current.gameRef.current?.frame ?? 0;
    act(() => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe('playing');
    expect((result.current.gameRef.current?.frame ?? 0) - before).toBeGreaterThan(20);
    expect(result.current.gameRef.current?.softDropHeld).toBe(false);
  });

  it('가비지 게이지 — 받은 직후는 대기(회색), 30프레임 뒤 활성(빨강)', () => {
    const { result } = setup();
    act(() => result.current.start(1, 10, 2));
    act(() => {
      result.current.receive({ id: 1, lines: 3, hole: 0 });
      vi.advanceTimersByTime(50);
    });
    expect(result.current.garbageRef.current).toEqual({ pending: 3, active: 0 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.garbageRef.current).toEqual({ pending: 3, active: 3 });
  });

  it('stop 뒤에는 진행·입력·수신을 하지 않는다 (경기 종료 — 생존자)', () => {
    const { result } = setup();
    act(() => result.current.start(1, 10, 2));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => result.current.stop());
    const frame = result.current.gameRef.current?.frame;
    act(() => {
      result.current.instant(ACTION.HARD_DROP);
      result.current.receive({ id: 1, lines: 1, hole: 0 });
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe('over');
    expect(result.current.gameRef.current?.frame).toBe(frame);
    const replay = result.current.buildReplay();
    expect(replay?.frames).toBe(frame);
    expect(replay && simulateBattleReplay(replay).ok).toBe(true);
  });
});
