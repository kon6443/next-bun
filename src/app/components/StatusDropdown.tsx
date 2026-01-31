'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { TASK_STATUS, type TaskStatusKey } from '../config/taskStatusConfig';
import { ChevronDownIcon } from './Icons';

type StatusDropdownProps = {
  currentStatus: TaskStatusKey;
  onStatusChange: (newStatus: number, e: React.MouseEvent) => void;
  disabled?: boolean;
};

export function StatusDropdown({ currentStatus, onStatusChange, disabled = false }: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<'up' | 'down'>('up');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
    const dropdownHeight = otherStatuses.length * 44; // 대략적인 드롭다운 높이

    // 위쪽 공간이 부족하면 아래로, 그렇지 않으면 위로
    if (spaceAbove < dropdownHeight && spaceBelow > spaceAbove) {
      return 'down';
    }
    return 'up';
  }, [otherStatuses.length]);

  // 외부 클릭 감지로 드롭다운 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 방지
    if (!disabled) {
      setOpenDirection(calculateOpenDirection());
      setIsOpen(!isOpen);
    }
  };

  const handleSelect = (statusKey: number, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 방지
    setIsOpen(false);
    onStatusChange(statusKey, e);
  };

  return (
    <div ref={dropdownRef} className='relative'>
      {/* 현재 상태 버튼 (드롭다운 트리거) */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled}
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
        {/* 화살표 아이콘 */}
        <ChevronDownIcon
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div
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
          {otherStatuses.map(status => (
            <button
              key={status.key}
              onClick={e => handleSelect(status.key, e)}
              className='
                flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm
                text-slate-300 transition-colors hover:bg-slate-700/50
                first:rounded-t-lg last:rounded-b-lg
              '
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
