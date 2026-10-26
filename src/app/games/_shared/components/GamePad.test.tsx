// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GamePad, type GamePadLayout, PAD_INSTANT_GUARD_MS } from './GamePad';

/** 게임 무관 시험 배치 — 유지형 ←→↓, 즉시형 ↑, 즉시형 A·B, 유지형 어깨 버튼 */
const L = { press: 10, release: 11 };
const R = { press: 12, release: 13 };
const D = { press: 14, release: 15 };
const UP = 20;
const A = 30;
const B = 31;
const S = { press: 40, release: 41 };
const LAYOUT: GamePadLayout = {
  dpad: {
    left: { action: { kind: 'hold', ...L }, aria: '왼쪽', label: '◀' },
    right: { action: { kind: 'hold', ...R }, aria: '오른쪽', label: '▶' },
    down: { action: { kind: 'hold', ...D }, aria: '아래', label: '▼' },
    up: { action: { kind: 'instant', action: UP }, aria: '위', label: '▲' },
  },
  buttons: [
    { id: 'a', slot: 'a', action: { kind: 'instant', action: A }, aria: 'A', content: 'A' },
    { id: 'b', slot: 'b', action: { kind: 'instant', action: B }, aria: 'B', content: 'B' },
    { id: 'sh', slot: 'shoulder', action: { kind: 'hold', ...S }, aria: '어깨', content: 'L' },
  ],
};

const SIZE = 150;
type Dir = 'left' | 'right' | 'up' | 'down';
const POINT: Record<Dir, [number, number]> = { left: [10, 75], right: [140, 75], up: [75, 10], down: [75, 140] };

function setupPad(layout: GamePadLayout, active = true) {
  const onHoldStart = vi.fn();
  const onHoldEnd = vi.fn();
  const onInstant = vi.fn();
  const props = { layout, onHoldStart, onHoldEnd, onInstant };
  const view = render(<GamePad {...props} active={active} />);
  const pad = screen.getByTestId('game-pad-dpad');
  vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: SIZE, height: SIZE, right: SIZE, bottom: SIZE, x: 0, y: 0, toJSON: () => ({}) });
  const at = (dir: Dir) => ({ clientX: POINT[dir][0], clientY: POINT[dir][1] });
  return {
    ...props,
    pad,
    rerender: (next: boolean) => view.rerender(<GamePad {...props} active={next} />),
    down: (dir: Dir, pointerId = 1) => fireEvent.pointerDown(pad, { pointerId, ...at(dir) }),
    move: (dir: Dir, pointerId = 1) => fireEvent.pointerMove(pad, { pointerId, ...at(dir) }),
    up: (pointerId = 1) => fireEvent.pointerUp(pad, { pointerId }),
  };
}

let clock = 1000;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

describe('공통 GamePad — 포인터 처리 (games-polish P9)', () => {
  it('← 누른 채 A 10연타 → 즉시형 10번, 유지형은 끊기지 않는다', () => {
    const { onHoldStart, onHoldEnd, onInstant, down } = setupPad(LAYOUT);
    down('left');
    for (let i = 0; i < 10; i++) fireEvent.pointerDown(screen.getByTestId('pad-a'), { pointerId: 2 + i });
    expect(onInstant.mock.calls.filter(([x]) => x === A)).toHaveLength(10);
    expect(onHoldStart).toHaveBeenCalledWith(L.press, L.release);
    expect(onHoldEnd).not.toHaveBeenCalled();
  });

  it('미끄러지면 유지형은 떼기→누르기, 즉시형 방향은 미끄러져 들어오면 0번 · 새로 누르면 1번 · 유지형을 막 뗐으면 무시', () => {
    const { onHoldStart, onHoldEnd, onInstant, down, move, up } = setupPad(LAYOUT);
    down('left');
    move('right');
    expect(onHoldEnd).toHaveBeenLastCalledWith(L.press);
    expect(onHoldStart).toHaveBeenLastCalledWith(R.press, R.release);
    move('up');
    move('down');
    up();
    expect(onHoldEnd).toHaveBeenLastCalledWith(D.press);
    expect(onInstant).not.toHaveBeenCalledWith(UP);
    clock += PAD_INSTANT_GUARD_MS - 10;
    down('up');
    up();
    expect(onInstant).not.toHaveBeenCalledWith(UP);
    clock += PAD_INSTANT_GUARD_MS;
    down('up');
    up();
    expect(onInstant.mock.calls.filter(([x]) => x === UP)).toHaveLength(1);
  });

  it('두 번째 손가락은 십자 패드를 맡지 않고, 취소·숨김·blur에서 모두 뗀다 — 유지형 버튼까지', () => {
    const { onHoldStart, onHoldEnd, pad, down } = setupPad(LAYOUT);
    down('left', 1);
    down('right', 2);
    expect(onHoldStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerCancel(pad, { pointerId: 1 });
    expect(onHoldEnd).toHaveBeenLastCalledWith(L.press);

    down('down', 3);
    fireEvent.pointerDown(screen.getByTestId('pad-sh'), { pointerId: 4 });
    expect(onHoldStart).toHaveBeenLastCalledWith(S.press, S.release);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onHoldEnd).toHaveBeenCalledWith(D.press);
    expect(onHoldEnd).toHaveBeenCalledWith(S.press);

    down('right', 5);
    window.dispatchEvent(new Event('blur'));
    expect(onHoldEnd).toHaveBeenLastCalledWith(R.press);
  });

  it('유지형 버튼은 누르는 동안 — 뗌·취소에서 뗀다', () => {
    const { onHoldStart, onHoldEnd } = setupPad(LAYOUT);
    const sh = screen.getByTestId('pad-sh');
    fireEvent.pointerDown(sh, { pointerId: 7 });
    expect(onHoldStart).toHaveBeenCalledWith(S.press, S.release);
    fireEvent.pointerUp(sh, { pointerId: 7 });
    expect(onHoldEnd).toHaveBeenCalledWith(S.press);
    fireEvent.pointerCancel(sh, { pointerId: 7 });
    expect(onHoldEnd).toHaveBeenCalledTimes(1);
  });

  it('멈춤·카운트다운 동안 누르고 있던 유지형은 진행이 시작되는 순간 다시 보낸다', () => {
    const { onHoldStart, down, rerender } = setupPad(LAYOUT, false);
    down('left');
    fireEvent.pointerDown(screen.getByTestId('pad-sh'), { pointerId: 2 });
    expect(onHoldStart).toHaveBeenCalledTimes(2);
    rerender(true);
    expect(onHoldStart).toHaveBeenCalledTimes(4);
    expect(onHoldStart).toHaveBeenCalledWith(L.press, L.release);
    expect(onHoldStart).toHaveBeenLastCalledWith(S.press, S.release);
  });

  it('키보드·보조기기(click detail 0)로도 — 유지형은 누르고 바로 떼 한 번, 즉시형 1번 · 터치의 뒤따르는 click은 무시', () => {
    const { onHoldStart, onHoldEnd, onInstant } = setupPad(LAYOUT);
    fireEvent.click(screen.getByRole('button', { name: '왼쪽' }), { detail: 0 });
    expect(onHoldStart).toHaveBeenCalledWith(L.press, L.release);
    expect(onHoldEnd).toHaveBeenCalledWith(L.press);
    const a = screen.getByTestId('pad-a');
    fireEvent.pointerDown(a, { pointerId: 9 });
    fireEvent.click(a, { detail: 1 });
    fireEvent.click(a, { detail: 0 });
    expect(onInstant.mock.calls).toEqual([[A], [A]]);
  });

  it('누른 방향 팔만 밝힌다(data-pressed — 순간 동작이라 토글로 읽히지 않게)', () => {
    const { down, move } = setupPad(LAYOUT);
    down('left');
    const left = screen.getByRole('button', { name: '왼쪽' });
    expect(left).toHaveAttribute('data-pressed', 'true');
    expect(left).not.toHaveAttribute('aria-pressed');
    move('right');
    expect(left).toHaveAttribute('data-pressed', 'false');
    expect(screen.getByRole('button', { name: '오른쪽' })).toHaveAttribute('data-pressed', 'true');
  });
});

describe('공통 GamePad — 길게 누르기 제스처 차단 (iOS 선택·확대경·콜아웃)', () => {
  /** jsdom에 TouchEvent가 없을 수 있다 — 취소 가능한 touchstart를 직접 만든다 */
  const touchStart = (target: Element) => {
    const event = new Event('touchstart', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('십자 패드에서 시작한 touchstart를 취소한다 — iOS는 터치 롱프레스에 contextmenu를 보내지 않아 CSS·contextmenu로는 못 막는다', () => {
    const { pad } = setupPad(LAYOUT);
    expect(touchStart(pad)).toBe(true);
    expect(touchStart(pad.querySelector('[aria-label="왼쪽"]') ?? pad)).toBe(true);
  });

  it('탭으로 쓰는 버튼(A·어깨)은 취소하지 않는다 — 터치 :active 눌림 표시를 지킨다', () => {
    setupPad(LAYOUT);
    expect(touchStart(screen.getByRole('button', { name: 'A' }))).toBe(false);
    expect(touchStart(screen.getByRole('button', { name: '어깨' }))).toBe(false);
  });

  it('취소할 수 있게 passive: false로 붙인다(React onTouchStart는 passive라 취소가 무시된다)', () => {
    const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    setupPad(LAYOUT);
    expect(add.mock.calls.some(([type, , options]) => type === 'touchstart' && typeof options === 'object' && options?.passive === false)).toBe(true);
  });

  it('터치를 취소해도 포인터 입력은 그대로 — 누르기·떼기가 동작한다', () => {
    const { pad, down, up, onHoldStart, onHoldEnd } = setupPad(LAYOUT);
    touchStart(pad);
    down('left');
    up();
    expect(onHoldStart).toHaveBeenCalledWith(L.press, L.release);
    expect(onHoldEnd).toHaveBeenCalledWith(L.press);
  });
});
