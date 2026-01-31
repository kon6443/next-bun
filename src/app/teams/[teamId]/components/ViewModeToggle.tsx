'use client';

import { KanbanIcon, TimelineIcon, ListIcon, CalendarIcon } from '@/app/components/Icons';

export type ViewMode = 'kanban' | 'gantt' | 'list' | 'calendar';

type ViewModeToggleProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
};

const viewModeConfig = [
  { key: 'kanban' as const, icon: KanbanIcon, title: '칸반 보드' },
  { key: 'gantt' as const, icon: TimelineIcon, title: '타임라인' },
  { key: 'list' as const, icon: ListIcon, title: '리스트' },
  { key: 'calendar' as const, icon: CalendarIcon, title: '캘린더' },
];

export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="flex justify-end mb-4">
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
