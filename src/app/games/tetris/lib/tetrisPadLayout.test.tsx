// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GamePad, type GamePadLayout } from '@/app/games/_shared/components/GamePad';
import { ACTION } from '../engine';
import { TETRIS_PAD_LAYOUT } from './tetrisPadLayout';

// 십자는 ↑ 없는 T자 — 폭 150 × 높이 100(폭의 2/3). 위 줄(0~50)이 ←·→, 아래 줄(50~100)이 ↓. ↑ 자리(-50~0)는 요소 밖(누르던 손가락이 미끄러져 갈 때만)
const SIZE = 150;
const TEE_H = 100;
const POINT = { left: [10, 25], right: [140, 25], up: [75, -40], down: [75, 90] } as const;

const rectOf = (height: number) => ({ left: 0, top: 0, width: SIZE, height, right: SIZE, bottom: height, x: 0, y: 0, toJSON: () => ({}) });

function setup(layout: GamePadLayout = TETRIS_PAD_LAYOUT, height = TEE_H) {
  const onHoldStart = vi.fn();
  const onHoldEnd = vi.fn();
  const onInstant = vi.fn();
  render(<GamePad layout={layout} onHoldStart={onHoldStart} onHoldEnd={onHoldEnd} onInstant={onInstant} active />);
  const pad = screen.getByTestId('game-pad-dpad');
  vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue(rectOf(height));
  const at = (dir: keyof typeof POINT, pointerId = 1) => ({ pointerId, clientX: POINT[dir][0], clientY: POINT[dir][1] });
  return { onHoldStart, onHoldEnd, onInstant, pad, at };
}

afterEach(() => vi.restoreAllMocks());

describe('테트리스 패드 배치 (games-polish P9)', () => {
  it('↑ 팔이 없다(T자, D-004 C3) — 위로 미끄러져 나가도 입력 0, ↑ 버튼·흐린 팔 모두 없음', () => {
    const { onHoldStart, onHoldEnd, onInstant, pad, at } = setup();
    fireEvent.pointerDown(pad, at('left', 2));
    fireEvent.pointerMove(pad, at('up', 2));
    fireEvent.pointerMove(pad, at('left', 2));
    fireEvent.pointerUp(pad, { pointerId: 2 });
    expect(onInstant).not.toHaveBeenCalled();
    // ← 누름 → (↑로 미끄러짐: 뗌, 입력 없음) → ← 다시 누름 → 뗌
    expect(onHoldStart.mock.calls).toEqual([
      [ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE],
      [ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE],
    ]);
    expect(onHoldEnd).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('pad-arm-up-off')).toBeNull();
    expect(screen.queryByRole('button', { name: /위|하드 드롭.*십자/ })).toBeNull();
    expect(pad.className).toContain('aspect-[3/2]');
  });

  it('↓를 누른 채 위로 미끄러지면 소프트 드롭을 뗄 뿐 — 회전·홀드 등 다른 입력 0', () => {
    const { onHoldStart, onHoldEnd, onInstant, pad, at } = setup();
    fireEvent.pointerDown(pad, at('down'));
    for (const y of [70, 50, 30, 10, -20, -60]) fireEvent.pointerMove(pad, { pointerId: 1, clientX: 75, clientY: y });
    fireEvent.pointerUp(pad, { pointerId: 1 });
    expect(onHoldStart.mock.calls).toEqual([[ACTION.SOFT_DROP_PRESS, ACTION.SOFT_DROP_RELEASE]]);
    expect(onHoldEnd).toHaveBeenCalledTimes(1);
    expect(onInstant).not.toHaveBeenCalled();
  });

  it('←·→·↓ 판정 영역은 ↑ 팔이 있던 정사각형 패드와 같다 — 잘린 위 1/3만 빠진다', () => {
    // 같은 손가락 위치(팔 기준)에서 누른 방향을 격자로 모은다 — 정사각형은 팔이 1/3 아래에 있다
    const sample = (layout: GamePadLayout, height: number, offsetY: number) => {
      const { onHoldStart, pad } = setup(layout, height);
      const hits: string[] = [];
      for (let x = 2; x < SIZE; x += 7) {
        for (let y = 2; y < TEE_H; y += 7) {
          onHoldStart.mockClear();
          fireEvent.pointerDown(pad, { pointerId: 1, clientX: x, clientY: y + offsetY });
          fireEvent.pointerUp(pad, { pointerId: 1 });
          hits.push(String(onHoldStart.mock.calls[0]?.[0] ?? '-'));
        }
      }
      cleanup();
      return hits;
    };
    const tee = sample(TETRIS_PAD_LAYOUT, TEE_H, 0);
    const square: GamePadLayout = { ...TETRIS_PAD_LAYOUT, dpad: { ...TETRIS_PAD_LAYOUT.dpad, up: { action: { kind: 'instant', action: ACTION.ROTATE_CW }, aria: '위', label: '▲' } } };
    expect(tee).toEqual(sample(square, SIZE, SIZE - TEE_H));
    expect(new Set(tee)).toEqual(new Set([String(ACTION.LEFT_PRESS), String(ACTION.RIGHT_PRESS), String(ACTION.SOFT_DROP_PRESS), '-']));
  });

  it('하드 드롭은 전용 키(강조색 "드롭") 1번, HOLD는 왼쪽 어깨 1번', () => {
    const { onInstant } = setup();
    const drop = screen.getByRole('button', { name: '하드 드롭' });
    expect(drop).toHaveTextContent('드롭');
    fireEvent.pointerDown(drop, { pointerId: 3 });
    fireEvent.click(drop, { detail: 1 });
    expect(onInstant.mock.calls).toEqual([[ACTION.HARD_DROP]]);
    onInstant.mockClear();
    fireEvent.pointerDown(screen.getByRole('button', { name: '홀드' }), { pointerId: 4 });
    expect(onInstant.mock.calls).toEqual([[ACTION.HOLD]]);
    // 하드 드롭은 오른쪽 묶음, HOLD는 십자 패드 쪽(왼쪽) — 반대 손
    expect(screen.getByRole('group', { name: '버튼' }).contains(drop)).toBe(true);
    expect(screen.getByRole('group', { name: '버튼' }).contains(screen.getByRole('button', { name: '홀드' }))).toBe(false);
  });

  it('← 누른 채 드롭 연타 — 드롭은 누른 만큼, 이동은 끊기지 않는다', () => {
    const { onHoldStart, onHoldEnd, onInstant, pad, at } = setup();
    fireEvent.pointerDown(pad, at('left'));
    const drop = screen.getByRole('button', { name: '하드 드롭' });
    for (let i = 0; i < 5; i++) fireEvent.pointerDown(drop, { pointerId: 10 + i });
    expect(onInstant.mock.calls.filter(([x]) => x === ACTION.HARD_DROP)).toHaveLength(5);
    expect(onHoldStart).toHaveBeenCalledTimes(1);
    expect(onHoldEnd).not.toHaveBeenCalled();
  });
});
