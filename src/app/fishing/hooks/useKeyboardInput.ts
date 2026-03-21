'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Direction } from '../types/game';

export interface KeyboardState {
  direction: Direction | null;
  actionPressed: boolean;
  enterPressed: boolean;
  escapePressed: boolean;
}

/**
 * 물리 키 → 방향 매핑 (한글 IME, 영문 대소문자 모든 경우 커버)
 *
 * 한국어 IME 활성화 시 브라우저별로 e.code, e.key, e.keyCode 값이
 * 제각각이므로 3가지를 모두 체크한다.
 *
 * - e.code  : 물리 키 위치 (가장 신뢰도 높지만 일부 IME에서 빈 값)
 * - e.key   : 입력 문자 (IME시 한글 자모 or 'Process')
 * - e.keyCode: deprecated지만 여전히 동작 (IME시 229)
 */
function resolveDir(code: string, key: string, keyCode: number): Direction | null {
  // ── UP (W / ㅈ / ArrowUp) ──
  if (code === 'KeyW' || code === 'ArrowUp') return 'up';
  if (key === 'w' || key === 'W' || key === 'ㅈ' || key === 'ArrowUp') return 'up';
  if (keyCode === 87 || keyCode === 38) return 'up';

  // ── LEFT (A / ㅁ / ArrowLeft) ──
  if (code === 'KeyA' || code === 'ArrowLeft') return 'left';
  if (key === 'a' || key === 'A' || key === 'ㅁ' || key === 'ArrowLeft') return 'left';
  if (keyCode === 65 || keyCode === 37) return 'left';

  // ── DOWN (S / ㄴ / ArrowDown) ──
  if (code === 'KeyS' || code === 'ArrowDown') return 'down';
  if (key === 's' || key === 'S' || key === 'ㄴ' || key === 'ArrowDown') return 'down';
  if (keyCode === 83 || keyCode === 40) return 'down';

  // ── RIGHT (D / ㅇ / ArrowRight) ──
  if (code === 'KeyD' || code === 'ArrowRight') return 'right';
  if (key === 'd' || key === 'D' || key === 'ㅇ' || key === 'ArrowRight') return 'right';
  if (keyCode === 68 || keyCode === 39) return 'right';

  return null;
}

export function useKeyboardInput() {
  const pressed = useRef({ up: false, down: false, left: false, right: false });
  const actionQueue = useRef(false);
  const enterQueue = useRef(false);
  const escapeQueue = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // input 포커스 중에는 Esc만 허용
      if (inInput) {
        if (e.key === 'Escape') escapeQueue.current = true;
        return;
      }

      // IME composing 중에도 e.keyCode === 229 일 수 있음
      // 229인 경우 e.keyCode 기반 방향 매핑은 무시 (code/key로만 판단)
      const kc = e.keyCode === 229 ? 0 : e.keyCode;
      const dir = resolveDir(e.code, e.key, kc);

      if (dir) {
        pressed.current[dir] = true;
        e.preventDefault();
        return;
      }

      // Space (게임 액션)
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        actionQueue.current = true;
        return;
      }

      // Enter (채팅 열기)
      if (e.code === 'Enter' || e.key === 'Enter') {
        e.preventDefault();
        enterQueue.current = true;
        return;
      }

      // Escape
      if (e.code === 'Escape' || e.key === 'Escape') {
        escapeQueue.current = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // keyup은 IME가 끝난 후이므로 keyCode가 정상값일 수 있음
      // 하지만 안전하게 code/key도 같이 체크
      const dir = resolveDir(e.code, e.key, e.keyCode);
      if (dir) {
        pressed.current[dir] = false;
      }
    };

    const onBlur = () => {
      pressed.current = { up: false, down: false, left: false, right: false };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const consumeInput = useCallback((): KeyboardState => {
    const { up, down, left, right } = pressed.current;

    // 마지막 방향 우선이 아닌, 단일 방향만 반환 (동시 입력 시 우선순위)
    let direction: Direction | null = null;
    if (right) direction = 'right';
    if (left) direction = 'left';
    if (down) direction = 'down';
    if (up) direction = 'up';

    const actionPressed = actionQueue.current;
    const enterPressed = enterQueue.current;
    const escapePressed = escapeQueue.current;
    actionQueue.current = false;
    enterQueue.current = false;
    escapeQueue.current = false;

    return { direction, actionPressed, enterPressed, escapePressed };
  }, []);

  return { consumeInput };
}
