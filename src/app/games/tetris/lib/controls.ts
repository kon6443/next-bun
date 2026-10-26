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

/** 조작 안내 (시작 화면·일시정지 화면) — pause: 일시정지 키(대전은 멈출 수 없어 뺀다) */
export const CONTROL_GUIDE: readonly { keys: string; label: string; pause?: true }[] = [
  { keys: '← →', label: '이동 (누르고 있으면 연속)' },
  { keys: '↓', label: '소프트 드롭' },
  { keys: 'Space', label: '하드 드롭' },
  { keys: '↑ · X', label: '시계 방향 회전' },
  { keys: 'Z · Ctrl', label: '반시계 방향 회전' },
  { keys: 'C · Shift', label: '홀드' },
  { keys: 'Esc · P', label: '일시정지', pause: true },
];

/** 터치 패드 안내 — 터치 기기의 준비·일시정지 화면(키보드 표 대신, UX 점검). 라벨은 패드 버튼 글자와 같다(tetrisPadLayout) */
export const PAD_GUIDE: readonly { keys: string; label: string }[] = [
  { keys: '◀ ▶', label: '이동 (누르고 있으면 연속)' },
  { keys: '▼', label: '누르는 동안 소프트 드롭' },
  { keys: '⤓ 드롭', label: '하드 드롭' },
  { keys: 'A ↻', label: '시계 방향 회전' },
  { keys: 'B ↺', label: '반시계 방향 회전' },
  { keys: 'HOLD', label: '홀드' },
  { keys: '❚❚', label: '일시정지 (오른쪽 위)' },
];

/** 대전 조작 안내 — 대전은 멈출 수 없다(useBattlePlay가 일시정지 키를 무시) (games-polish FE-32) */
export const BATTLE_CONTROL_GUIDE = CONTROL_GUIDE.filter((item) => !item.pause);

/** 리플레이 키 오버레이 — 동작 코드 → 표시 */
export const ACTION_LABELS: Readonly<Record<number, string>> = {
  [ACTION.ROTATE_CW]: '↻',
  [ACTION.ROTATE_CCW]: '↺',
  [ACTION.HARD_DROP]: '⤓',
  [ACTION.HOLD]: 'H',
};

/**
 * 게임으로 보내지 않을 키 — 입력창·편집 영역에서 친 키
 * includeDialogs면 열린 대화상자(대전 기권 확인 등) 안의 키도 (FE-23: 싱글·대전이 같은 함수를 쓴다)
 */
export function isTypingTarget(target: EventTarget | null, { includeDialogs = false }: { includeDialogs?: boolean } = {}): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return true;
  return includeDialogs && target.closest('[role="dialog"]') !== null;
}
