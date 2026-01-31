'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { TASK_STATUS, type TaskStatusKey } from '../config/taskStatusConfig';
import { ChevronDownIcon } from './Icons';
import { useClickOutside } from '../hooks';

type StatusDropdownProps = {
  currentStatus: TaskStatusKey;
  onStatusChange: (newStatus: number, e: React.MouseEvent) => void;
  disabled?: boolean;
};

export function StatusDropdown({ currentStatus, onStatusChange, disabled = false }: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<'up' | 'down'>('up');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 현재 상태 메타데이터
  const currentStatusMeta = TASK_STATUS[currentStatus] || TASK_STATUS[1];

  // 현재 상태를 제외한 다른 상태들
  const otherStatuses = Object.values(TASK_STATUS).filter(s => s.key !== currentStatus);

  // 드롭다운 열릴 방향 계산
  const calculateOpenDirection = useCallback(() => {
    if (!buttonRef.current) return 'up';

    const rect = buttonRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = otherStatuses.length * 44;

    if (spaceAbove < dropdownHeight && spaceBelow > spaceAbove) {
      return 'down';
    }
    return 'up';
  }, [otherStatuses.length]);

  // 외부 클릭 감지로 드롭다운 닫기 (커스텀 훅 사용)
  useClickOutside(dropdownRef as React.RefObject<HTMLElement | null>, () => setIsOpen(false), isOpen);

  // focusedIndex 변경 시 해당 옵션에 실제 포커스 적용
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  // 드롭다운이 닫힐 때 focusedIndex 리셋
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      setOpenDirection(calculateOpenDirection());
      setIsOpen(!isOpen);
      setFocusedIndex(-1);
    }
  };

  const handleSelect = (statusKey: number, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onStatusChange(statusKey, e as React.MouseEvent);
  };

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && focusedIndex >= 0) {
          handleSelect(otherStatuses[focusedIndex].key, e);
        } else {
          setOpenDirection(calculateOpenDirection());
          setIsOpen(!isOpen);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setOpenDirection(calculateOpenDirection());
          setIsOpen(true);
          setFocusedIndex(0);
        } else {
          setFocusedIndex(prev => Math.min(prev + 1, otherStatuses.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          setFocusedIndex(prev => Math.max(prev - 1, 0));
        }
        break;
      case 'Home':
        if (isOpen) {
          e.preventDefault();
          setFocusedIndex(0);
        }
        break;
      case 'End':
        if (isOpen) {
          e.preventDefault();
          setFocusedIndex(otherStatuses.length - 1);
        }
        break;
    }
  };

  const dropdownId = `status-dropdown-${currentStatus}`;

  return (
    <div ref={dropdownRef} className='relative'>
      {/* 현재 상태 버튼 (드롭다운 트리거) */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={dropdownId}
        aria-activedescendant={isOpen && focusedIndex >= 0 ? `${dropdownId}-option-${otherStatuses[focusedIndex]?.key}` : undefined}
        aria-label={`태스크 상태: ${currentStatusMeta.label}. 상태 변경하려면 클릭하세요.`}
        className={`
          flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 
          bg-slate-800/50 px-3 py-2 text-left text-sm transition-all
          ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-700/50 hover:border-white/20'}
          ${isOpen ? 'border-sky-500/50 ring-1 ring-sky-500/20' : ''}
        `}
      >
        <div className='flex items-center gap-2'>
          <span
            className='h-3 w-3 rounded-full border border-white/20 flex-shrink-0'
            style={{ background: currentStatusMeta.accent }}
            aria-hidden='true'
          />
          <span className='font-medium text-slate-200'>{currentStatusMeta.label}</span>
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div
          id={dropdownId}
          role="listbox"
          aria-label="상태 선택"
          className={`
            absolute left-0 right-0 z-50
            rounded-lg border border-white/10 bg-slate-800/95 backdrop-blur-sm
            shadow-xl shadow-black/20 overflow-hidden
            animate-in fade-in duration-150
            ${openDirection === 'up' 
              ? 'bottom-full mb-1 slide-in-from-bottom-2' 
              : 'top-full mt-1 slide-in-from-top-2'
            }
          `}
        >
          {otherStatuses.map((status, index) => (
            <button
              key={status.key}
              ref={el => { optionRefs.current[index] = el; }}
              id={`${dropdownId}-option-${status.key}`}
              role="option"
              aria-selected={focusedIndex === index}
              tabIndex={focusedIndex === index ? 0 : -1}
              onClick={e => handleSelect(status.key, e)}
              onKeyDown={handleKeyDown}
              onMouseEnter={() => setFocusedIndex(index)}
              className={`
                flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm
                text-slate-300 transition-colors outline-none
                first:rounded-t-lg last:rounded-b-lg
                ${focusedIndex === index ? 'bg-slate-700/50' : 'hover:bg-slate-700/50'}
                focus:bg-slate-700/50 focus:ring-1 focus:ring-sky-500/30 focus:ring-inset
              `}
            >
              <span
                className='h-3 w-3 rounded-full border border-white/20 flex-shrink-0'
                style={{ background: status.accent }}
                aria-hidden='true'
              />
              <span>{status.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
