'use client';

import { useEffect, useState } from 'react';
import { TagChip } from '@/app/components/TagChip';
import { TagIcon } from '@/app/components/Icons';
import { TASK_TAG_LIMIT } from '@/app/utils/tagUtils';
import { useTeamTagsContext } from '../contexts/TeamTagsContext';
import { TagModal } from './TagModal';

type TaskTagFieldProps = {
  /** 고른 태그 ID (폼 state) */
  value: number[];
  onChange: (tagIds: number[]) => void;
  disabled?: boolean;
};

/**
 * 태스크 생성·수정 폼의 "태그" 필드 — 누르면 공통 태그 모달(select)이 열린다
 * 고른 태그는 폼 제출 때 tagIds로 함께 저장된다 (D-009)
 */
export function TaskTagField({ value, onChange, disabled = false }: TaskTagFieldProps) {
  const { tags, canFetch, refresh } = useTeamTagsContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  /**
   * 폼을 연 뒤 조회 결과가 목록에 실제로 반영됐는지 — 그 전의 목록은 오래됐을 수 있다.
   * 반영 뒤의 목록 변화는 그 이후 이벤트만 쌓인 것이라 따라가도 된다. 끝내 반영 못 하면(false) 정리하지 않는다 —
   * 저장 때 400이 보이는 쪽이 태그가 조용히 떨어지는 것보다 낫다
   */
  const [isSynced, setIsSynced] = useState(false);

  // 하드 로드 직후에는 세션(토큰)이 아직 없다 — 토큰이 생기면 그때 읽는다
  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    // 폼을 열기 전에 시작된 조회에는 합류하지 않는다 — 그 결과에는 상세를 받은 뒤 생긴 태그(다른 탭)가 없을 수 있다
    refresh({ fresh: true }).then(applied => {
      if (!cancelled && applied) setIsSynced(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, canFetch]);

  // 고른 뒤 삭제된 태그는 뺀다 — 그대로 보내면 서버가 400(TEAM_TASK_BAD_REQUEST)으로 거부한다.
  // 새로 받은 목록으로만 판단한다: 오래된 목록에 없을 뿐인 태그를 지우면 저장 때 경고 없이 떼어진다
  useEffect(() => {
    if (!isSynced || !tags) return;
    const existing = new Set(tags.map(tag => tag.tagId));
    if (value.some(id => !existing.has(id))) onChange(value.filter(id => existing.has(id)));
  }, [isSynced, tags, value, onChange]);

  const selectedTags = tags?.filter(tag => value.includes(tag.tagId)) ?? [];

  return (
    <div>
      <span id="taskTags-label" className="mb-2 block text-sm font-semibold text-slate-300">
        태그 <span className="text-xs font-normal text-slate-500">(최대 {TASK_TAG_LIMIT}개)</span>
      </span>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={disabled}
        aria-labelledby="taskTags-label"
        aria-haspopup="dialog"
        className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-left transition hover:border-white/20 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <TagIcon className="h-4 w-4 shrink-0 text-slate-500" />
        {selectedTags.length > 0 ? (
          <span className="flex min-w-0 flex-wrap gap-1">
            {selectedTags.map(tag => (
              <TagChip key={tag.tagId} tag={tag} size="md" className="max-w-[10rem]" />
            ))}
          </span>
        ) : (
          <span className="text-sm text-slate-500">
            {value.length > 0 ? `${value.length}개 선택됨` : '태그 선택 (선택사항)'}
          </span>
        )}
      </button>

      <TagModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode="select"
        selectedTagIds={value}
        onSelectedTagIdsChange={onChange}
      />
    </div>
  );
}
