'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { TeamTag } from '@/app/types/task';
import { ApiError } from '@/types/api';
import { extractErrorMessage } from '@/app/utils/errorUtils';
import { useDialog } from '@/app/hooks/useDialog';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { TagChip } from '@/app/components/TagChip';
import { CloseIcon, EditIcon, GripIcon, PlusIcon, CheckIcon } from '@/app/components/Icons';
import {
  TAG_NAME_MAX_LENGTH,
  TASK_TAG_LIMIT,
  TEAM_TAG_LIMIT,
  findTagByName,
  getNextTagColor,
  normalizeTagName,
  validateTagName,
} from '@/app/utils/tagUtils';
import { useTeamTagsContext } from '../contexts/TeamTagsContext';
import { TagColorPicker } from './TagColorPicker';

type TagModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /**
   * manage: 팀 태그 생성·수정·삭제·순서 변경 (팀 보드 메뉴)
   * select: 위 기능 + 태스크에 붙일 태그 선택 (태스크 생성·수정 폼). 선택은 폼 state에만 두고 폼 제출 때 저장된다
   */
  mode: 'manage' | 'select';
  selectedTagIds?: number[];
  onSelectedTagIdsChange?: (tagIds: number[]) => void;
};

/**
 * 공통 태그 모달 (D-009) — 입구 3곳(보드 메뉴·태스크 생성·태스크 수정)이 같은 컴포넌트를 연다
 * - 입력하다 Enter: 같은 이름이 있으면 그 태그를 고르고(select), 없으면 새로 만든다
 * - manage 모드에서 핸들(⋮⋮)을 끌어 순서를 바꾼다. 검색 중에는 순서를 바꿀 수 없다(일부만 보이므로)
 * - 폼 안에서 열려도 폼이 제출되지 않게 body로 portal한다
 * - 태그를 수정하는 동안 footer는 "닫기" 대신 "취소 / 저장" — 모바일에서 편집 폼이 길어 폼 안 버튼은 화면 밖에 있었다.
 *   저장하지 않은 변경이 있으면 닫기·Esc·X·다른 태그 편집으로 넘어가기 전에 버릴지 묻는다
 */
export function TagModal({ isOpen, onClose, mode, selectedTagIds = [], onSelectedTagIdsChange }: TagModalProps) {
  const titleId = useId();
  const { tags, isLoading, isReordering, refresh, createTag, updateTag, deleteTag, reorderTags } = useTeamTagsContext();

  const [query, setQuery] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamTag | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  /** 드래그 중에는 시작 시점 순서를 고정한다 — 그사이 온 tagsReordered는 드롭 뒤에 보인다 */
  const [dragOrder, setDragOrder] = useState<number[] | null>(null);
  /** 편집 폼의 상태 — footer 저장 버튼과 미저장 변경 확인에 쓴다 */
  const [editorStatus, setEditorStatus] = useState<EditorStatus>(IDLE_EDITOR_STATUS);
  /** 미저장 변경을 버릴지 묻는 중이면, 버리기로 했을 때 이어서 할 일 */
  const [pendingDiscard, setPendingDiscard] = useState<{ run: () => void } | null>(null);
  const editorFormId = `${titleId}-tag-editor`;

  // 열 때마다 초기화하고 서버 목록(taskCount 포함)을 새로 받는다
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setFormError(null);
    setEditingTagId(null);
    setDeleteTarget(null);
    setDragOrder(null);
    setPendingDiscard(null);
    refresh();
  }, [isOpen, refresh]);

  // 편집 중인 태그 — 다른 팀원이 지웠으면 없다(그때 footer는 다시 "닫기")
  const editingTag = editingTagId === null ? undefined : (tags ?? []).find(tag => tag.tagId === editingTagId);
  const hasUnsavedEdit = editingTag !== undefined && editorStatus.dirty;

  /** 미저장 변경이 있으면 버릴지 먼저 묻고, 없으면 바로 한다 */
  const guardUnsavedEdit = (action: () => void) => {
    // 저장 요청이 진행 중이면 기다린다 — 이미 나간 저장은 "버리기"로 되돌릴 수 없다(Esc·취소도 같은 정책)
    if (editorStatus.saving) return;
    if (hasUnsavedEdit) setPendingDiscard({ run: action });
    else action();
  };
  // 닫을 때 편집도 끝낸다 — 남겨 두면 다시 열 때 첫 렌더에 이전 편집 폼이 잠깐 붙어 그 행으로 스크롤된다
  const requestClose = () =>
    guardUnsavedEdit(() => {
      setEditingTagId(null);
      onClose();
    });

  // 확인창(삭제·미저장 변경)이 열려 있는 동안에는 확인창이 포커스·Esc를 맡는다 — Esc 한 번에 둘 다 닫히지 않게.
  // 드래그 중 Esc는 드래그 취소에, 저장 중에는 결과를 기다린다
  const dialogRef = useDialog<HTMLDivElement>(isOpen && !deleteTarget && !pendingDiscard, requestClose, {
    closeOnEscape: dragOrder === null && !isCreating && !editorStatus.saving,
  });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // 길게 눌러야 시작 — 목록 스크롤과 겹치지 않게
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const orderedTags = useMemo(() => {
    if (!tags || !dragOrder) return tags ?? [];
    const byId = new Map(tags.map(tag => [tag.tagId, tag]));
    const frozen = dragOrder.flatMap(id => byId.get(id) ?? []);
    const added = tags.filter(tag => !dragOrder.includes(tag.tagId));
    return [...frozen, ...added];
  }, [tags, dragOrder]);

  const normalizedQuery = normalizeTagName(query);
  // 편집 중인 태그는 검색어와 맞지 않아도 남긴다 — 검색하다 편집 폼이 사라지면 고치던 내용이 조용히 버려진다
  const visibleTags = normalizedQuery
    ? orderedTags.filter(
        tag => tag.tagId === editingTagId || tag.tagName.toUpperCase().includes(normalizedQuery.toUpperCase()),
      )
    : orderedTags;
  const exactMatch = normalizedQuery ? findTagByName(orderedTags, normalizedQuery) : undefined;
  const isTeamLimitReached = (tags?.length ?? 0) >= TEAM_TAG_LIMIT;
  const canCreate = Boolean(normalizedQuery) && !exactMatch && !isTeamLimitReached && tags !== null;
  /** 순서를 바꿀 수 있는 화면(핸들 표시) — 검색 중·수정 중에는 일부만 보이거나 행이 커지므로 숨긴다 */
  const showHandles = mode === 'manage' && !normalizedQuery && editingTagId === null && orderedTags.length > 1;
  /** 이전 순서 변경 요청이 끝나기 전에는 핸들을 막는다 */
  const canReorder = showHandles && !isReordering;

  const selectedSet = new Set(selectedTagIds);
  const isSelectLimitReached = selectedTagIds.length >= TASK_TAG_LIMIT;

  const toggleSelect = (tagId: number) => {
    if (mode !== 'select' || !onSelectedTagIdsChange) return;
    if (selectedSet.has(tagId)) {
      onSelectedTagIdsChange(selectedTagIds.filter(id => id !== tagId));
    } else if (!isSelectLimitReached) {
      onSelectedTagIdsChange([...selectedTagIds, tagId]);
    }
  };

  const handleCreate = async () => {
    if (isCreating || tags === null) return;
    setFormError(null);
    if (exactMatch) {
      // 이미 있는 이름이면 새로 만들지 않고 고른다
      if (mode === 'select' && !selectedSet.has(exactMatch.tagId)) toggleSelect(exactMatch.tagId);
      else if (mode === 'manage') setFormError('같은 이름의 태그가 이미 있습니다.');
      setQuery('');
      return;
    }
    const invalid = validateTagName(normalizedQuery);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    if (isTeamLimitReached) {
      setFormError(`팀 태그는 최대 ${TEAM_TAG_LIMIT}개까지 만들 수 있습니다.`);
      return;
    }
    setIsCreating(true);
    try {
      const created = await createTag(normalizedQuery, getNextTagColor(tags.length));
      if (mode === 'select' && onSelectedTagIdsChange && !isSelectLimitReached) {
        onSelectedTagIdsChange([...selectedTagIds, created.tagId]);
      }
      // select 모드는 만든 태그가 바로 체크된 채 목록에 보인다 — 연달아 입력하는 흐름을 토스트로 끊지 않는다
      if (mode === 'manage') toast.success('태그를 만들었습니다.');
      setQuery('');
    } catch (err) {
      toast.error(extractErrorMessage(err, '태그를 만들지 못했습니다.'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleQueryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // 한글 조합 중 Enter는 조합 확정용이다 — 여기서 만들면 마지막 글자가 빠지거나 두 번 만들어진다
    if (e.nativeEvent.isComposing) return;
    handleCreate();
  };

  const handleDragStart = () => {
    setDragOrder(orderedTags.map(tag => tag.tagId));
    setEditingTagId(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const order = dragOrder;
    setDragOrder(null);
    if (!order || !over || active.id === over.id) return;
    const from = order.indexOf(Number(active.id));
    const to = order.indexOf(Number(over.id));
    if (from === -1 || to === -1) return;
    reorderTags(arrayMove(order, from, to)).catch(err => {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? '다른 팀원이 태그를 바꿔 목록을 새로 불러왔습니다. 다시 시도해주세요.'
          : extractErrorMessage(err, '태그 순서를 바꾸지 못했습니다.'),
      );
    });
  };

  const tagNameById = (id: string | number) => orderedTags.find(tag => tag.tagId === Number(id))?.tagName ?? '태그';
  const positionOf = (id: string | number) => orderedTags.findIndex(tag => tag.tagId === Number(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${tagNameById(active.id)} 태그를 집었습니다. 현재 ${positionOf(active.id)}번째입니다.`,
    onDragOver: ({ active, over }) =>
      over ? `${tagNameById(active.id)} 태그를 ${positionOf(over.id)}번째 위치로 옮기는 중입니다.` : `${tagNameById(active.id)} 태그가 목록 밖에 있습니다.`,
    onDragEnd: ({ active, over }) =>
      over ? `${tagNameById(active.id)} 태그를 ${positionOf(over.id)}번째에 놓았습니다.` : `${tagNameById(active.id)} 태그 이동을 취소했습니다.`,
    onDragCancel: ({ active }) => `${tagNameById(active.id)} 태그 이동을 취소했습니다.`,
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTag(deleteTarget.tagId);
      if (mode === 'select' && onSelectedTagIdsChange && selectedSet.has(deleteTarget.tagId)) {
        onSelectedTagIdsChange(selectedTagIds.filter(id => id !== deleteTarget.tagId));
      }
      toast.success('태그를 삭제했습니다.');
      setEditingTagId(null);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, '태그를 삭제하지 못했습니다.'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const rows = visibleTags.map(tag => (
    <SortableTagRow
      key={tag.tagId}
      tag={tag}
      mode={mode}
      showHandle={showHandles}
      canReorder={canReorder}
      isSelected={selectedSet.has(tag.tagId)}
      isSelectDisabled={!selectedSet.has(tag.tagId) && isSelectLimitReached}
      isEditing={editingTagId === tag.tagId}
      onToggle={() => toggleSelect(tag.tagId)}
      onEdit={() => {
        // 다음 값은 지금 계산한다 — 확인창의 "변경 버리기"가 편집을 먼저 닫은 뒤 실행해도 토글이 되돌아가지 않게
        const nextEditingTagId = editingTagId === tag.tagId ? null : tag.tagId;
        guardUnsavedEdit(() => {
          setFormError(null);
          setEditingTagId(nextEditingTagId);
        });
      }}
      editor={
        editingTagId === tag.tagId ? (
          <TagEditor
            formId={editorFormId}
            tag={tag}
            allTags={orderedTags}
            onStatusChange={setEditorStatus}
            onCancel={() => setEditingTagId(null)}
            onSave={async request => {
              await updateTag(tag.tagId, request);
              toast.success('태그를 수정했습니다.');
              setEditingTagId(null);
            }}
            onRequestDelete={() => setDeleteTarget(tag)}
          />
        ) : null
      }
    />
  ));

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl border border-white/10 bg-slate-900 focus:outline-none sm:rounded-3xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/5 p-4">
            <h3 id={titleId} className="text-lg font-bold text-white">
              {mode === 'manage' ? '태그 관리' : '태그 선택'}
            </h3>
            <button
              type="button"
              onClick={requestClose}
              disabled={editorStatus.saving}
              className="flex h-11 w-11 disabled:opacity-50 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
              aria-label="닫기"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-white/5 p-4">
            <label htmlFor={`${titleId}-query`} className="sr-only">
              {mode === 'manage' ? '새 태그 이름 또는 검색어' : '태그 검색 또는 새 태그 이름'}
            </label>
            <input
              id={`${titleId}-query`}
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setFormError(null);
              }}
              onKeyDown={handleQueryKeyDown}
              maxLength={TAG_NAME_MAX_LENGTH}
              placeholder={mode === 'manage' ? '새 태그 이름 입력 후 Enter' : '태그 검색 또는 새로 만들기'}
              autoComplete="off"
              className="w-full max-w-full box-border rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-slate-200 placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
            />
            {formError && (
              <p role="alert" className="mt-2 text-xs text-red-400">
                {formError}
              </p>
            )}
            {mode === 'select' && (
              <p className="mt-2 text-xs text-slate-400" aria-live="polite">
                {selectedTagIds.length}/{TASK_TAG_LIMIT}개 선택
                {isSelectLimitReached && ' — 태스크당 최대 개수입니다.'}
              </p>
            )}
            {isTeamLimitReached && (
              <p className="mt-2 text-xs text-amber-400">팀 태그는 최대 {TEAM_TAG_LIMIT}개까지 만들 수 있습니다.</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="mb-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
              >
                <PlusIcon className="h-4 w-4 shrink-0 text-sky-400" />
                <span className="min-w-0 truncate">
                  {isCreating ? '만드는 중...' : `'${normalizedQuery}' 만들기`}
                </span>
              </button>
            )}

            {tags === null ? (
              isLoading ? (
                <p className="p-4 text-center text-sm text-slate-400">태그를 불러오는 중...</p>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-sm text-slate-400">태그를 불러오지 못했습니다.</p>
                  <button
                    type="button"
                    onClick={() => refresh()}
                    className="mt-2 min-h-11 rounded-lg border border-white/20 bg-white/5 px-4 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    다시 시도
                  </button>
                </div>
              )
            ) : visibleTags.length === 0 && !canCreate ? (
              <p className="p-4 text-center text-sm text-slate-400">
                {normalizedQuery ? '일치하는 태그가 없습니다.' : '아직 태그가 없습니다. 이름을 입력하고 Enter로 만들어 보세요.'}
              </p>
            ) : showHandles ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setDragOrder(null)}
                accessibility={{
                  announcements,
                  screenReaderInstructions: {
                    draggable:
                      '순서를 바꾸려면 Space 또는 Enter로 태그를 집고, 위·아래 화살표로 옮긴 뒤 Space 또는 Enter로 놓습니다. Esc를 누르면 취소합니다.',
                  },
                }}
              >
                <SortableContext items={visibleTags.map(tag => tag.tagId)} strategy={verticalListSortingStrategy}>
                  <ul>{rows}</ul>
                </SortableContext>
              </DndContext>
            ) : (
              <ul>{rows}</ul>
            )}
          </div>

          <div className="border-t border-white/5 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            {editingTag ? (
              // 편집 중: 저장은 편집 폼을 제출한다(form 속성) — 폼이 길어도 저장·취소가 늘 보이게
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTagId(null)}
                  disabled={editorStatus.saving}
                  className="min-h-11 flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  form={editorFormId}
                  disabled={editorStatus.saving}
                  className="min-h-11 flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50"
                >
                  {editorStatus.saving ? '저장 중...' : '저장'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110"
              >
                {mode === 'select' ? '선택 완료' : '닫기'}
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        title="태그 삭제"
        message={
          deleteTarget
            ? deleteTarget.taskCount > 0
              ? `"${deleteTarget.tagName}" 태그를 삭제하시겠습니까? 이 태그가 붙은 태스크 ${deleteTarget.taskCount}개에서도 빠지며 되돌릴 수 없습니다.`
              : `"${deleteTarget.tagName}" 태그를 삭제하시겠습니까? 되돌릴 수 없습니다.`
            : ''
        }
        confirmLabel="삭제"
        variant="danger"
        isLoading={isDeleting}
      />

      <ConfirmModal
        isOpen={pendingDiscard !== null}
        onClose={() => setPendingDiscard(null)}
        onConfirm={() => {
          const next = pendingDiscard;
          setPendingDiscard(null);
          setEditingTagId(null);
          next?.run();
        }}
        title="수정 중인 태그"
        message="저장하지 않은 변경을 버릴까요?"
        confirmLabel="변경 버리기"
        cancelLabel="계속 편집"
        variant="danger"
      />
    </>,
    document.body,
  );
}

// ===== 목록 행 =====

type SortableTagRowProps = {
  tag: TeamTag;
  mode: 'manage' | 'select';
  showHandle: boolean;
  canReorder: boolean;
  isSelected: boolean;
  isSelectDisabled: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  editor: React.ReactNode;
};

function SortableTagRow({
  tag,
  mode,
  showHandle,
  canReorder,
  isSelected,
  isSelectDisabled,
  isEditing,
  onToggle,
  onEdit,
  editor,
}: SortableTagRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.tagId,
    disabled: !canReorder,
  });

  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-lg ${isDragging ? 'relative z-10 bg-slate-800 shadow-lg shadow-black/40' : ''}`}
    >
      <div className="flex min-h-11 items-center gap-1">
        {showHandle && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            disabled={!canReorder}
            aria-label={canReorder ? `${tag.tagName} 순서 바꾸기` : `${tag.tagName} 순서 바꾸기 (저장 중)`}
            className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-500 hover:text-slate-300 active:cursor-grabbing disabled:cursor-wait disabled:opacity-40"
          >
            <GripIcon className="h-4 w-4" />
          </button>
        )}

        {mode === 'select' ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            onClick={onToggle}
            disabled={isSelectDisabled}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                isSelected ? 'border-sky-400 bg-sky-500 text-white' : 'border-white/20'
              }`}
              aria-hidden="true"
            >
              {isSelected && <CheckIcon className="h-3.5 w-3.5" />}
            </span>
            <TagChip tag={tag} size="md" className="min-w-0" />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
            <TagChip tag={tag} size="md" className="min-w-0" />
            <span className="shrink-0 text-xs text-slate-500">{tag.taskCount}개</span>
          </div>
        )}

        <button
          type="button"
          onClick={onEdit}
          aria-label={`${tag.tagName} 태그 수정`}
          aria-expanded={isEditing}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/5 ${
            isEditing ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <EditIcon className="h-4 w-4" />
        </button>
      </div>
      {editor}
    </li>
  );
}

// ===== 이름·색 수정 =====

type EditorStatus = {
  /** 저장하지 않은 이름·색 변경이 있다 */
  dirty: boolean;
  saving: boolean;
};

const IDLE_EDITOR_STATUS: EditorStatus = { dirty: false, saving: false };

type TagEditorProps = {
  /** 모달 footer의 저장 버튼이 이 폼을 제출한다 (form 속성) */
  formId: string;
  tag: TeamTag;
  allTags: TeamTag[];
  onStatusChange: (status: EditorStatus) => void;
  onCancel: () => void;
  onSave: (request: { tagName?: string; tagColor?: string }) => Promise<void>;
  onRequestDelete: () => void;
};

function TagEditor({ formId, tag, allTags, onStatusChange, onCancel, onSave, onRequestDelete }: TagEditorProps) {
  const nameId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(tag.tagName);
  const [color, setColor] = useState(tag.tagColor);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // 편집을 연 때의 값 — 그사이 다른 팀원이 이 태그를 바꿔도(소켓) 내가 고친 것만 변경으로 보고 저장한다.
  // 현재 값과 비교하면 손대지 않은 칸까지 변경으로 보여 확인창이 뜨고, 저장 때 상대 변경을 덮는다
  const [initial] = useState({ tagName: tag.tagName, tagColor: tag.tagColor });

  const isDirty = normalizeTagName(name) !== initial.tagName || color !== initial.tagColor;
  useEffect(() => {
    onStatusChange({ dirty: isDirty, saving: isSaving });
  }, [isDirty, isSaving, onStatusChange]);
  // 편집이 끝나면(언마운트) 모달의 footer·확인창 상태를 되돌린다
  useEffect(() => () => onStatusChange(IDLE_EDITOR_STATUS), [onStatusChange]);

  // 열면 편집 중인 행부터 보이게 — 모바일에서는 폼이 스크롤 영역보다 길다
  useEffect(() => {
    formRef.current?.closest('li')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, []);

  const handleSave = async () => {
    if (isSaving) return;
    // 이름 오류는 이름 칸 아래에 뜬다 — 색을 고르느라 아래로 내려가 저장했으면 그 칸까지 올려 보여 준다
    // (포커스까지 옮기면 모바일 키보드가 올라와 화면을 더 가린다)
    const showNameError = (message: string) => {
      setError(message);
      nameInputRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    };
    const invalid = validateTagName(name);
    if (invalid) {
      showNameError(invalid);
      return;
    }
    const tagName = normalizeTagName(name);
    // 이름을 고쳤을 때만 중복을 본다 — 그사이 다른 팀원이 이름을 바꿔 생긴 겹침이 색만 바꾼 저장을 막지 않게
    if (tagName !== initial.tagName && findTagByName(allTags, tagName, tag.tagId)) {
      showNameError('같은 이름의 태그가 이미 있습니다.');
      return;
    }
    const request = {
      ...(tagName !== initial.tagName && { tagName }),
      ...(color !== initial.tagColor && { tagColor: color }),
    };
    if (Object.keys(request).length === 0) {
      onCancel();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(request);
    } catch (err) {
      toast.error(extractErrorMessage(err, '태그를 수정하지 못했습니다.'));
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 모달은 portal이지만 React 이벤트는 컴포넌트 트리로 올라간다 — 태스크 폼(select 모드) 제출로 번지지 않게
    e.stopPropagation();
    handleSave();
  };

  return (
    <form
      ref={formRef}
      id={formId}
      onSubmit={handleSubmit}
      noValidate
      className="mx-2 mb-2 space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-3"
    >
      <div>
        <label htmlFor={nameId} className="mb-1 block text-xs font-semibold text-slate-300">
          이름 ({normalizeTagName(name).length}/{TAG_NAME_MAX_LENGTH})
        </label>
        <input
          ref={nameInputRef}
          id={nameId}
          type="text"
          value={name}
          onChange={e => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.nativeEvent.isComposing) handleSave();
          }}
          maxLength={TAG_NAME_MAX_LENGTH}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${nameId}-error` : undefined}
          className="w-full max-w-full box-border rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-base text-slate-200 focus:border-white/20 focus:outline-none"
        />
        {/* 오류는 모두 이름 검증이라 이름 칸 바로 아래 — footer 저장을 눌러도 화면 안(폼 맨 위)에서 보인다 */}
        {error && (
          <p id={`${nameId}-error`} role="alert" className="mt-1 text-xs text-red-400">
            {error}
          </p>
        )}
      </div>

      <TagColorPicker value={color} onChange={setColor} />

      <div className="flex items-center gap-2">
        <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">미리보기</span>
        <TagChip tag={{ tagName: normalizeTagName(name) || tag.tagName, tagColor: color }} size="md" className="min-w-0" />
      </div>

      {/* 저장·취소는 모달 footer에 있다. 삭제는 되돌릴 수 없어 확인창을 거친다 */}
      <button
        type="button"
        onClick={onRequestDelete}
        disabled={isSaving}
        className="min-h-11 rounded-lg border border-red-500/30 px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
      >
        태그 삭제
      </button>
    </form>
  );
}
