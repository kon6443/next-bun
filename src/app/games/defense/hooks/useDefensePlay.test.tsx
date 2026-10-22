// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { OP, TOWER_ID, findStage, getStateHash, simulateReplay } from '../engine';
import { type PlayResult, useDefensePlay } from './useDefensePlay';

const stage = findStage('s1')!;
const FRAME_MS = 1000 / 60;

/** 가짜 rAF 프레임 n개 */
function frames(n: number) {
  for (let i = 0; i < n; i++) {
    act(() => {
      vi.advanceTimersByTime(FRAME_MS);
    });
  }
}

describe('useDefensePlay (게임 루프)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('1웨이브 전(ready)에는 틱이 돌지 않고 건설은 된다 · 웨이브 시작 뒤 배속만큼 틱이 진행', () => {
    const { result } = renderHook(() => useDefensePlay({ stage, seed: 1 }));
    frames(30);
    expect(result.current.hud.status).toBe('ready');
    expect(result.current.stateRef.current.tick).toBe(0);
    act(() => {
      expect(result.current.dispatch(OP.BUILD, 0, TOWER_ID.ARCHER)).toBe(true);
    });
    expect(result.current.hud.gold).toBe(result.current.stateRef.current.gold);
    act(() => {
      expect(result.current.dispatch(OP.CALL_WAVE)).toBe(true);
    });
    expect(result.current.hud.status).toBe('playing');
    frames(60); // 1초 = 30틱 (첫 프레임 간격 0 — 59프레임분)
    const at1x = result.current.stateRef.current.tick;
    expect(at1x).toBeGreaterThanOrEqual(28);
    expect(at1x).toBeLessThanOrEqual(30);
    act(() => result.current.cycleSpeed());
    act(() => result.current.cycleSpeed());
    expect(result.current.hud.speed).toBe(3);
    frames(60);
    expect(result.current.stateRef.current.tick - at1x).toBeGreaterThanOrEqual(88);
  });

  it('일시정지 중 틱이 멈추고 조작은 된다 · 다시 누르면 이어 간다 · 화면이 가려지면 자동 일시정지', () => {
    const { result } = renderHook(() => useDefensePlay({ stage, seed: 1 }));
    act(() => {
      result.current.dispatch(OP.CALL_WAVE);
    });
    frames(10);
    act(() => result.current.togglePause());
    const paused = result.current.stateRef.current.tick;
    frames(30);
    expect(result.current.stateRef.current.tick).toBe(paused);
    act(() => {
      expect(result.current.dispatch(OP.BUILD, 1, TOWER_ID.CANNON)).toBe(true);
    });
    act(() => result.current.togglePause());
    frames(10);
    expect(result.current.stateRef.current.tick).toBeGreaterThan(paused);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.hud.status).toBe('paused');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('무효 명령은 false이고 기록되지 않는다 (골드 부족·없는 슬롯·준비 전 판매)', () => {
    const { result } = renderHook(() => useDefensePlay({ stage, seed: 1 }));
    act(() => {
      expect(result.current.dispatch(OP.SELL, 0)).toBe(false);
      expect(result.current.dispatch(OP.BUILD, 99, TOWER_ID.ARCHER)).toBe(false);
      result.current.stateRef.current.gold = 0;
      expect(result.current.dispatch(OP.BUILD, 0, TOWER_ID.ARCHER)).toBe(false);
    });
    expect(result.current.recorderRef.current.inputs).toEqual([]);
  });

  it('판이 끝나면 onOver 한 번 — 패배 원인(샌 적·웨이브)과 명령 로그, 로그를 리플레이하면 같은 해시', () => {
    const results: PlayResult[] = [];
    let drawn = 0;
    const { result } = renderHook(() => useDefensePlay({ stage, seed: 7, onOver: (r) => results.push(r), onFrame: () => drawn++ }));
    act(() => {
      result.current.dispatch(OP.CALL_WAVE);
      result.current.cycleSpeed();
      result.current.cycleSpeed();
    });
    for (let i = 0; i < 4000 && results.length === 0; i++) frames(1);
    expect(results).toHaveLength(1);
    const over = results[0];
    expect(over.victory).toBe(false);
    expect(over.livesLeft).toBe(0);
    expect(over.leakedLivesByEnemy.reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThanOrEqual(20);
    expect(over.worstWave).toBeGreaterThan(0);
    expect(result.current.hud.status).toBe('over');
    const replay = simulateReplay({ mode: 'campaign', boardKey: 's1', seed: 7, ticks: over.endTick, inputs: over.inputs });
    expect(replay).toMatchObject({ ok: true, stateHash: getStateHash(result.current.stateRef.current) });
    frames(10);
    expect(results).toHaveLength(1);
    // 끝난 뒤에는 연출이 사라질 만큼(90프레임)만 더 그리고 루프를 멈춘다
    frames(200);
    const settled = drawn;
    frames(60);
    expect(drawn).toBe(settled);
  });

  it('StrictMode(이중 마운트)에서도 같은 seed 판 — 루프가 둘로 돌지 않는다', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useDefensePlay({ stage, seed: 1 }), { wrapper });
    act(() => {
      result.current.dispatch(OP.CALL_WAVE);
    });
    frames(60);
    const tick = result.current.stateRef.current.tick;
    expect(tick).toBeGreaterThanOrEqual(28);
    expect(tick).toBeLessThanOrEqual(30);
  });
});
