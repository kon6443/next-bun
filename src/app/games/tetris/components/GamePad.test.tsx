// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ACTION } from '../engine';
import { GamePad, HARD_DROP_GUARD_MS } from './GamePad';

/** 십자 패드는 (0,0)~(150,150) — 중심 (75,75), 반지름 75 */
const SIZE = 150;
const point = (dir: 'left' | 'right' | 'up' | 'down' | 'center') =>
  ({ left: [10, 75], right: [140, 75], up: [75, 10], down: [75, 140], center: [75, 75] })[dir];

function setup(active = true) {
  const onHoldStart = vi.fn();
  const onHoldEnd = vi.fn();
  const onInstant = vi.fn();
  const view = render(<GamePad onHoldStart={onHoldStart} onHoldEnd={onHoldEnd} onInstant={onInstant} active={active} />);
  const pad = screen.getByTestId('game-pad-dpad');
  vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: SIZE, height: SIZE, right: SIZE, bottom: SIZE, x: 0, y: 0, toJSON: () => ({}) });
  const at = (dir: Parameters<typeof point>[0]) => {
    const [clientX, clientY] = point(dir);
    return { clientX, clientY };
  };
  const down = (dir: Parameters<typeof point>[0], pointerId = 1) => fireEvent.pointerDown(pad, { pointerId, ...at(dir) });
  const move = (dir: Parameters<typeof point>[0], pointerId = 1) => fireEvent.pointerMove(pad, { pointerId, ...at(dir) });
  const up = (pointerId = 1) => fireEvent.pointerUp(pad, { pointerId });
  return { onHoldStart, onHoldEnd, onInstant, pad, down, move, up, view };
}

let clock = 1000;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

describe('GamePad — 게임보이형 모바일 패드 (games-polish P9)', () => {
  it('← 누른 채 A 10연타 → 회전 10번, 이동은 끊기지 않는다', () => {
    const { onHoldStart, onHoldEnd, onInstant, down } = setup();
    down('left');
    const a = screen.getByRole('button', { name: '시계 방향 회전 (A)' });
    for (let i = 0; i < 10; i++) fireEvent.pointerDown(a, { pointerId: 2 + i });
    expect(onInstant.mock.calls.filter(([action]) => action === ACTION.ROTATE_CW)).toHaveLength(10);
    expect(onHoldStart).toHaveBeenCalledWith(ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE);
    expect(onHoldEnd).not.toHaveBeenCalled();
  });

  it('←→ 미끄러지면 떼기→누르기로 바뀌고 하드 드롭은 0번 — ↑로 미끄러져 들어가도 0번', () => {
    const { onHoldStart, onHoldEnd, onInstant, down, move, up } = setup();
    down('left');
    move('right');
    expect(onHoldEnd).toHaveBeenLastCalledWith(ACTION.LEFT_PRESS);
    expect(onHoldStart).toHaveBeenLastCalledWith(ACTION.RIGHT_PRESS, ACTION.RIGHT_RELEASE);
    move('left');
    move('up');
    move('down');
    expect(onHoldStart).toHaveBeenLastCalledWith(ACTION.SOFT_DROP_PRESS, ACTION.SOFT_DROP_RELEASE);
    up();
    expect(onHoldEnd).toHaveBeenLastCalledWith(ACTION.SOFT_DROP_PRESS);
    expect(onInstant).not.toHaveBeenCalledWith(ACTION.HARD_DROP);
  });

  it('↑를 새로 누르면 하드 드롭 1번 — 가로 이동을 뗀 직후(100ms 안)는 무시', () => {
    const { onInstant, down, up } = setup();
    down('left');
    up();
    clock += HARD_DROP_GUARD_MS - 10;
    down('up');
    up();
    expect(onInstant).not.toHaveBeenCalledWith(ACTION.HARD_DROP);
    clock += HARD_DROP_GUARD_MS;
    down('up');
    up();
    expect(onInstant.mock.calls.filter(([action]) => action === ACTION.HARD_DROP)).toHaveLength(1);
  });

  it('두 번째 손가락은 패드를 맡지 않고, 취소·화면 숨김·blur에서 모두 뗀다 — 고착 없음', () => {
    const { onHoldStart, onHoldEnd, pad, down } = setup();
    down('left', 1);
    down('right', 2);
    expect(onHoldStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerCancel(pad, { pointerId: 1 });
    expect(onHoldEnd).toHaveBeenCalledTimes(1);

    down('down', 3);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onHoldEnd).toHaveBeenLastCalledWith(ACTION.SOFT_DROP_PRESS);

    down('right', 4);
    window.dispatchEvent(new Event('blur'));
    expect(onHoldEnd).toHaveBeenLastCalledWith(ACTION.RIGHT_PRESS);
  });

  it('멈춤·카운트다운 동안 누르고 있던 방향은 진행이 시작되는 순간 다시 보낸다 (터치에는 키 반복이 없다)', () => {
    const onHoldStart = vi.fn();
    const props = { onHoldStart, onHoldEnd: vi.fn(), onInstant: vi.fn() };
    const { rerender } = render(<GamePad {...props} active={false} />);
    const pad = screen.getByTestId('game-pad-dpad');
    vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: SIZE, height: SIZE, right: SIZE, bottom: SIZE, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 75 });
    expect(onHoldStart).toHaveBeenCalledTimes(1); // 큐가 무시하는 누름
    rerender(<GamePad {...props} active />);
    expect(onHoldStart).toHaveBeenCalledTimes(2);
    expect(onHoldStart).toHaveBeenLastCalledWith(ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE);
  });

  it('A·B·HOLD는 누르는 순간 1번 — 키보드·보조기기(click detail 0)로도, 터치의 뒤따르는 click은 무시', () => {
    const { onInstant } = setup();
    for (const [name, action] of [
      ['시계 방향 회전 (A)', ACTION.ROTATE_CW],
      ['반시계 방향 회전 (B)', ACTION.ROTATE_CCW],
      ['홀드', ACTION.HOLD],
    ] as const) {
      onInstant.mockClear();
      const button = screen.getByRole('button', { name });
      fireEvent.pointerDown(button, { pointerId: 9 });
      fireEvent.click(button, { detail: 1 });
      fireEvent.click(button, { detail: 0 });
      expect(onInstant.mock.calls).toEqual([[action], [action]]);
    }
  });

  it('십자 팔도 키보드로 — 이동·소프트 드롭은 한 칸, ↑는 하드 드롭', () => {
    const { onHoldStart, onHoldEnd, onInstant } = setup();
    fireEvent.click(screen.getByRole('button', { name: '왼쪽 이동' }), { detail: 0 });
    expect(onHoldStart).toHaveBeenCalledWith(ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE);
    expect(onHoldEnd).toHaveBeenCalledWith(ACTION.LEFT_PRESS);
    fireEvent.click(screen.getByRole('button', { name: '하드 드롭' }), { detail: 0 });
    expect(onInstant).toHaveBeenCalledWith(ACTION.HARD_DROP);
  });

  it('누른 방향 팔만 밝힌다(aria-pressed)', () => {
    const { down, move } = setup();
    down('left');
    expect(screen.getByRole('button', { name: '왼쪽 이동' })).toHaveAttribute('aria-pressed', 'true');
    move('right');
    expect(screen.getByRole('button', { name: '왼쪽 이동' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '오른쪽 이동' })).toHaveAttribute('aria-pressed', 'true');
  });
});
