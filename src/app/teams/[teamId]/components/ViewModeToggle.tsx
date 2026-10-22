'use client';

import { KanbanIcon, TimelineIcon, ListIcon, CalendarIcon, ArchiveIcon } from '@/app/components/Icons';
import type { BoardViewMode, BoardDataTab } from '@/app/utils/boardStateStorage';

export type ViewMode = BoardViewMode;
export type DataTab = BoardDataTab;

type ViewModeToggleProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  dataTab: DataTab;
  onDataTabChange: (tab: DataTab) => void;
};

const viewModeConfig = [
  { key: 'kanban' as const, icon: KanbanIcon, title: '칸반 보드' },
  { key: 'gantt' as const, icon: TimelineIcon, title: '타임라인' },
  { key: 'list' as const, icon: ListIcon, title: '리스트' },
  { key: 'calendar' as const, icon: CalendarIcon, title: '캘린더' },
];

const dataTabConfig: { key: DataTab; label: string; icon?: typeof ArchiveIcon }[] = [
  { key: 'active', label: '활성' },
  { key: 'archive', label: '보관함', icon: ArchiveIcon },
];

export function ViewModeToggle({ viewMode, onViewModeChange, dataTab, onDataTabChange }: ViewModeToggleProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      {/* 데이터 탭: 활성 / 보관함 */}
      <div role="group" aria-label="데이터 구분" className="flex rounded-xl border border-white/10 bg-slate-900/30 p-1">
        {dataTabConfig.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onDataTabChange(key)}
            aria-pressed={dataTab === key}
            className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
              dataTab === key
                ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {/* 뷰 모드 토글 */}
      <div role="group" aria-label="보기 방식" className="ml-auto flex rounded-xl border border-white/10 bg-slate-900/30 p-1">
        {viewModeConfig.map(({ key, icon: Icon, title }) => (
          <button
            key={key}
            onClick={() => onViewModeChange(key)}
            title={title}
            aria-label={title}
            aria-pressed={viewMode === key}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2.5 rounded-lg transition ${
              viewMode === key
                ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
