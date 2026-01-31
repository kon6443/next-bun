'use client';

import type { ReactNode } from 'react';

type ViewHeaderProps = {
  /** 뷰 제목 (영문 라벨) */
  title: string;
  /** 부제목/설명 */
  subtitle: string;
  /** 태스크 수 (우측 표시) */
  count: number;
  /** 추가 액션 버튼 등 (옵션) */
  actions?: ReactNode;
};

/**
 * 뷰 공통 헤더 컴포넌트
 * GanttChart, ListView, CalendarView 등에서 사용
 */
export function ViewHeader({ title, subtitle, count, actions }: ViewHeaderProps) {
  return (
    <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <p className="text-[0.7rem] uppercase tracking-[0.4em] text-slate-400">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <span className="text-xs font-semibold text-slate-400">
          {count} tasks
        </span>
      </div>
    </div>
  );
}
