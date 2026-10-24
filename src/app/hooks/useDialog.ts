'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type UseDialogOptions = {
  /** false면 Esc로 닫지 않는다 (예: 처리 중에는 닫기 버튼도 막혀 있을 때) */
  closeOnEscape?: boolean;
};

/**
 * 모달 공통 키보드·포커스 동작
 * - 열릴 때 대화상자 안 첫 포커스 가능 요소로 이동 (없으면 컨테이너)
 * - Esc로 닫기
 * - Tab 이동을 대화상자 안에 가둔다
 * - 닫히면 열기 전에 포커스가 있던 요소로 돌려준다
 *
 * 반환한 ref를 대화상자 컨테이너(role="dialog")에 붙인다. 컨테이너에는 tabIndex={-1}을 준다.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose: () => void,
  { closeOnEscape = true }: UseDialogOptions = {},
) {
  const dialogRef = useRef<T>(null);
  // 부모가 매 렌더 새 onClose를 넘겨도 effect가 다시 돌아 포커스를 빼앗지 않게 최신 값만 참조한다
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  });

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    // 안쪽 컴포넌트가 이미 자기 첫 포커스를 정했으면(예: 결과 패널 제목) 그대로 둔다 — 자식 effect가 먼저 돈다
    if (!dialog.contains(document.activeElement)) (getFocusable()[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!closeOnEscapeRef.current) return;
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // 내용이 바뀌며 포커스된 요소가 사라지면 포커스가 body로 빠진다 — 그 상태의 Tab도 대화상자 안으로 되돌린다
      if (!dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  return dialogRef;
}
