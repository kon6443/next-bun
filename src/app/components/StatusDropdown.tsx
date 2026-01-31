'use client';

import { useState, useRef, useEffect } from 'react';
import { TASK_STATUS, type TaskStatusKey } from '../config/taskStatusConfig';

type StatusDropdownProps = {
  currentStatus: TaskStatusKey;
  onStatusChange: (newStatus: number, e: React.MouseEvent) => void;
  disabled?: boolean;
};

export function StatusDropdown({ currentStatus, onStatusChange, disabled = false }: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 현재 상태 메타데이터
  const currentStatusMeta = TASK_STATUS[currentStatus] || TASK_STATUS[1];

  // 현재 상태를 제외한 다른 상태들
  const otherStatuses = Object.values(TASK_STATUS).filter(s => s.key !== currentStatus);

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
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
        </svg>
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div
          className='
            absolute bottom-full left-0 right-0 z-50 mb-1
            rounded-lg border border-white/10 bg-slate-800/95 backdrop-blur-sm
            shadow-xl shadow-black/20 overflow-hidden
            animate-in fade-in slide-in-from-bottom-2 duration-150
          '
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
