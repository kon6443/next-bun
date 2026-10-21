// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ACTION, type GameState, simulateReplay } from '../engine';
import type { ReplayPayload } from '@/types/game';
import { useTetrisPlay } from './useTetrisPlay';

describe('useTetrisPlay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => {
    const onGameOver = vi.fn<(state: GameState, replay: ReplayPayload) => void>();
    const hook = renderHook(() => useTetrisPlay({ vibration: false, onGameOver }));
    return { ...hook, onGameOver };
  };

  it('실시간 플레이 기록을 리플레이로 돌리면 같은 결과 (재현성)', () => {
    const { result, onGameOver } = setup();
    act(() => result.current.start(424242, 8, 1));
    for (let i = 0; i < 4000 && onGameOver.mock.calls.length === 0; i++) {
      act(() => {
        if (i % 7 === 0) result.current.press(ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE);
        if (i % 7 === 3) result.current.release(ACTION.LEFT_PRESS);
        if (i % 11 === 0) result.current.instant(ACTION.ROTATE_CW);
        if (i % 13 === 0) result.current.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(17);
      });
    }
    expect(onGameOver).toHaveBeenCalledTimes(1);
    const [state, replay] = onGameOver.mock.calls[0];
    const verified = simulateReplay({ seed: 424242, ...replay });
    expect(verified).toMatchObject({ ok: true, score: state.score, lines: state.lines, endFrame: state.endFrame });
    expect(result.current.status).toBe('over');
  });

  it('키를 누른 채 일시정지 → 재개해도 기록이 리플레이와 같다', () => {
    const { result, onGameOver } = setup();
    act(() => result.current.start(777, 6, 0));
    act(() => {
      result.current.press(ACTION.SOFT_DROP_PRESS, ACTION.SOFT_DROP_RELEASE);
      result.current.press(ACTION.RIGHT_PRESS, ACTION.RIGHT_RELEASE);
      vi.advanceTimersByTime(200);
    });
    act(() => result.current.pause()); // 누르던 키는 뗌으로 큐에 들어간다
    act(() => {
      vi.advanceTimersByTime(5000); // 일시정지 동안 프레임이 진행되지 않는다
    });
    const pausedFrame = result.current.stateRef.current?.frame;
    act(() => result.current.resume());
    act(() => {
      // 재개 첫 애니메이션 프레임은 기준 시각만 잡는다(일시정지 시간이 누산기에 들어가지 않게) — 그 뒤 누산기가 1/60초를 넘을 때 틱
      vi.advanceTimersByTime(100);
    });
    expect(result.current.stateRef.current?.softDropHeld).toBe(false);
    expect(result.current.stateRef.current?.frame).toBeLessThanOrEqual((pausedFrame ?? 0) + 7);
    for (let i = 0; i < 4000 && onGameOver.mock.calls.length === 0; i++) {
      act(() => {
        if (i % 9 === 0) result.current.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(17);
      });
    }
    const [state, replay] = onGameOver.mock.calls[0];
    expect(simulateReplay({ seed: 777, ...replay })).toMatchObject({ ok: true, score: state.score, endFrame: state.endFrame });
  });

  it('일시정지 화면에서는 게임 키가 기본 동작(버튼 누르기)을 막지 않는다', () => {
    const { result } = setup();
    act(() => result.current.start(1, 10, 2));
    act(() => result.current.pause());
    const space = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
    window.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    const esc = new KeyboardEvent('keydown', { code: 'Escape', cancelable: true });
    act(() => {
      window.dispatchEvent(esc);
    });
    expect(esc.defaultPrevented).toBe(true);
    expect(result.current.status).toBe('playing');
  });

  it('일시정지 → 처음부터(reset)면 준비 상태가 되고 이전 판은 진행되지 않는다', () => {
    const { result } = setup();
    act(() => result.current.start(1, 10, 2));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => result.current.pause());
    act(() => result.current.reset());
    expect(result.current.status).toBe('ready');
    const frame = result.current.stateRef.current?.frame;
    act(() => result.current.resume()); // 준비 상태에서는 재개되지 않는다
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.stateRef.current?.frame).toBe(frame);
  });

  it('두 번째 판도 HUD 시간이 갱신된다', () => {
    const { result } = setup();
    act(() => result.current.start(1, 10, 2));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => result.current.reset());
    act(() => result.current.start(2, 10, 2));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.hud.frame).toBeGreaterThan(30);
    expect(result.current.hud.frame).toBeLessThan(70);
  });
});
