import { ACTION } from '../engine';

/**
 * 키보드 — e.code 기준(한글 IME·자판 배열과 무관)
 * hold: 누름/뗌이 있는 동작 (좌·우·소프트드롭) / instant: 누를 때 한 번 / pause: 일시정지
 */
export type KeyBinding =
  | { kind: 'hold'; press: number; release: number }
  | { kind: 'instant'; action: number }
  | { kind: 'pause' };

const HOLD_LEFT: KeyBinding = { kind: 'hold', press: ACTION.LEFT_PRESS, release: ACTION.LEFT_RELEASE };
const HOLD_RIGHT: KeyBinding = { kind: 'hold', press: ACTION.RIGHT_PRESS, release: ACTION.RIGHT_RELEASE };
const HOLD_SOFT: KeyBinding = { kind: 'hold', press: ACTION.SOFT_DROP_PRESS, release: ACTION.SOFT_DROP_RELEASE };
const instant = (action: number): KeyBinding => ({ kind: 'instant', action });

export const KEY_BINDINGS: Readonly<Record<string, KeyBinding>> = {
  ArrowLeft: HOLD_LEFT,
  ArrowRight: HOLD_RIGHT,
  ArrowDown: HOLD_SOFT,
  Space: instant(ACTION.HARD_DROP),
  ArrowUp: instant(ACTION.ROTATE_CW),
  KeyX: instant(ACTION.ROTATE_CW),
  KeyZ: instant(ACTION.ROTATE_CCW),
  ControlLeft: instant(ACTION.ROTATE_CCW),
  ControlRight: instant(ACTION.ROTATE_CCW),
  KeyC: instant(ACTION.HOLD),
  ShiftLeft: instant(ACTION.HOLD),
  ShiftRight: instant(ACTION.HOLD),
  Escape: { kind: 'pause' },
  KeyP: { kind: 'pause' },
};

/** 조작 안내 (시작 화면·일시정지 화면) */
export const CONTROL_GUIDE: readonly { keys: string; label: string }[] = [
  { keys: '← →', label: '이동 (누르고 있으면 연속)' },
  { keys: '↓', label: '소프트 드롭' },
  { keys: 'Space', label: '하드 드롭' },
  { keys: '↑ · X', label: '시계 방향 회전' },
  { keys: 'Z · Ctrl', label: '반시계 방향 회전' },
  { keys: 'C · Shift', label: '홀드' },
  { keys: 'Esc · P', label: '일시정지' },
];

/** 리플레이 키 오버레이 — 동작 코드 → 표시 */
export const ACTION_LABELS: Readonly<Record<number, string>> = {
  [ACTION.ROTATE_CW]: '↻',
  [ACTION.ROTATE_CCW]: '↺',
  [ACTION.HARD_DROP]: '⤓',
  [ACTION.HOLD]: 'H',
};

/** 누름 상태가 있는 동작의 뗌 코드 */
export const RELEASE_OF: Readonly<Record<number, number>> = {
  [ACTION.LEFT_PRESS]: ACTION.LEFT_RELEASE,
  [ACTION.RIGHT_PRESS]: ACTION.RIGHT_RELEASE,
  [ACTION.SOFT_DROP_PRESS]: ACTION.SOFT_DROP_RELEASE,
};
