'use client';

import { useEffect } from 'react';

/**
 * 요소 외부 클릭 감지 훅
 * 드롭다운, 모달 등에서 외부 클릭 시 닫기 기능에 사용
 * 
 * @param ref - 감지할 요소의 ref (null 허용)
 * @param handler - 외부 클릭 시 실행할 콜백
 * @param enabled - 훅 활성화 여부 (기본값: true)
 * 
 * @example
 * const dropdownRef = useRef<HTMLDivElement>(null);
 * useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);
 */
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler(event);
      }
    };

    // mousedown과 touchstart 모두 지원
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [ref, handler, enabled]);
}
