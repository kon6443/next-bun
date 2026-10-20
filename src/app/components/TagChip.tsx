'use client';

import type { TaskTag } from '../types/task';
import { getTagChipStyle, resolveTaskTags } from '../utils/tagUtils';
import { useTeamTagsContextOptional } from '../teams/[teamId]/contexts/TeamTagsContext';

type TagChipProps = {
  tag: Pick<TaskTag, 'tagName' | 'tagColor'>;
  size?: 'sm' | 'md';
  className?: string;
};

/** 태그 칩 — 저장 색 배경 20%·테두리 40%·글자색은 대비 계산 (tagUtils.getTagChipStyle) */
export function TagChip({ tag, size = 'sm', className = '' }: TagChipProps) {
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded border font-medium leading-tight ${sizeClass} ${className}`.trim()}
      style={getTagChipStyle(tag.tagColor)}
      title={tag.tagName}
    >
      <span className="truncate">{tag.tagName}</span>
    </span>
  );
}

type TaskTagChipsProps = {
  /** 태스크 응답의 tags */
  tags: TaskTag[];
  /** 보여줄 최대 개수 — 넘치면 "+N". 생략하면 전부 */
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
  /** 주면 칩이 버튼이 된다 — 누르면 그 태그로 보드를 거른다. 카드·행 클릭으로 번지지 않게 막는다 */
  onTagClick?: (tagId: number) => void;
};

/**
 * 태스크의 태그 칩 목록
 * 팀 태그 목록(TeamTagsContext)이 있으면 그 순서·이름·색을 따르고 삭제된 태그는 숨긴다
 */
export function TaskTagChips({ tags, max, size = 'sm', className = '', onTagClick }: TaskTagChipsProps) {
  const teamTags = useTeamTagsContextOptional()?.tags ?? null;
  const resolved = resolveTaskTags(tags, teamTags);
  if (resolved.length === 0) return null;

  const visible = max === undefined ? resolved : resolved.slice(0, max);
  const hiddenCount = resolved.length - visible.length;

  return (
    <ul className={`flex flex-wrap items-center gap-1 ${className}`.trim()} aria-label="태그">
      {visible.map(tag => (
        <li key={tag.tagId} className="min-w-0 max-w-full">
          {onTagClick ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onTagClick(tag.tagId);
              }}
              onKeyDown={e => e.stopPropagation()}
              aria-label={`${tag.tagName} 태그로 필터`}
              className="flex max-w-full rounded py-1 transition hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <TagChip tag={tag} size={size} />
            </button>
          ) : (
            <TagChip tag={tag} size={size} />
          )}
        </li>
      ))}
      {hiddenCount > 0 && (
        <li
          className={`text-slate-400 ${size === 'sm' ? 'text-[11px]' : 'text-xs'}`}
          title={resolved.slice(visible.length).map(tag => tag.tagName).join(', ')}
        >
          +{hiddenCount}
        </li>
      )}
    </ul>
  );
}
