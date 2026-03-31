'use client';

import { KanbanIcon, TimelineIcon, ListIcon, CalendarIcon, ArchiveIcon } from '@/app/components/Icons';

export type ViewMode = 'kanban' | 'gantt' | 'list' | 'calendar';
export type DataTab = 'active' | 'archive';

type ViewModeToggleProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  dataTab: DataTab;
  onDataTabChange: (tab: DataTab) => void;
  archiveCount?: number;
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

export function ViewModeToggle({ viewMode, onViewModeChange, dataTab, onDataTabChange, archiveCount }: ViewModeToggleProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      {/* 데이터 탭: 활성 / 보관함 */}
      <div className="flex rounded-xl border border-white/10 bg-slate-900/30 p-1">
        {dataTabConfig.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onDataTabChange(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              dataTab === key
                ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
            {key === 'archive' && archiveCount !== undefined && archiveCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-slate-700 text-slate-300">
                {archiveCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 뷰 모드 토글 */}
      <div className="flex rounded-xl border border-white/10 bg-slate-900/30 p-1">
        {viewModeConfig.map(({ key, icon: Icon, title }) => (
          <button
            key={key}
            onClick={() => onViewModeChange(key)}
            title={title}
            className={`p-2.5 rounded-lg transition ${
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
