// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GamePad } from '@/app/games/_shared/components/GamePad';
import { ACTION } from '../engine';
import { TETRIS_PAD_LAYOUT } from './tetrisPadLayout';

const SIZE = 150;
const POINT = { left: [10, 75], right: [140, 75], up: [75, 10], down: [75, 140] } as const;

function setup() {
  const onHoldStart = vi.fn();
  const onHoldEnd = vi.fn();
  const onInstant = vi.fn();
  render(<GamePad layout={TETRIS_PAD_LAYOUT} onHoldStart={onHoldStart} onHoldEnd={onHoldEnd} onInstant={onInstant} active />);
  const pad = screen.getByTestId('game-pad-dpad');
  vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: SIZE, height: SIZE, right: SIZE, bottom: SIZE, x: 0, y: 0, toJSON: () => ({}) });
  const at = (dir: keyof typeof POINT, pointerId = 1) => ({ pointerId, clientX: POINT[dir][0], clientY: POINT[dir][1] });
  return { onHoldStart, onHoldEnd, onInstant, pad, at };
}

afterEach(() => vi.restoreAllMocks());

describe('테트리스 패드 배치 (games-polish P9)', () => {
  it('↑는 무동작 — 새로 눌러도, 미끄러져 들어가도 입력 0, 팔은 흐린 그림만(버튼 아님)', () => {
    const { onHoldStart, onHoldEnd, onInstant, pad, at } = setup();
    fireEvent.pointerDown(pad, at('up'));
    fireEvent.pointerUp(pad, { pointerId: 1 });
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
    expect(screen.getByTestId('pad-arm-up-off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /위|하드 드롭.*십자/ })).toBeNull();
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
