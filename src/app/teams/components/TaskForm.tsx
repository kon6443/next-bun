"use client";

import { useState } from "react";
import { Input, TextArea, DateInput, TimeInput } from "./FormInput";
import { Button, ButtonLink } from "./Button";
import { Alert } from "./Alert";
import { DEFAULT_START_TIME, DEFAULT_END_TIME, isTaskRangeInverted } from "@/app/utils/dateUtils";
import { TaskTagField } from "@/app/teams/[teamId]/components/TaskTagField";

export type TaskFormData = {
  taskName: string;
  taskDescription: string;
  startAt: string;
  endAt: string;
  startAtTime: string;
  endAtTime: string;
  /** 붙일 태그 ID (팀 태그 순서와 무관하게 고른 순서) */
  tagIds: number[];
};

type TaskFormProps = {
  mode: "create" | "edit";
  initialData?: TaskFormData;
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
  cancelHref?: string; // 취소 버튼이 링크일 경우 사용
  isSubmitting: boolean;
};

/**
 * 태스크 생성/수정 공통 폼 컴포넌트
 * - mode: "create" | "edit"로 생성/수정 구분
 * - 모바일 전용 레이아웃
 * - initialData는 마운트 시 1회만 반영한다 — 편집 중 부모 리렌더(소켓 갱신 등)로 입력이 덮어써지지 않게.
 *   편집 화면은 수정 모드 진입마다 새로 마운트된다(TaskDetailPage의 isEditing 조건부 렌더)
 */
export function TaskForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  cancelHref,
  isSubmitting,
}: TaskFormProps) {
  const [taskName, setTaskName] = useState(initialData?.taskName || "");
  const [taskDescription, setTaskDescription] = useState(
    initialData?.taskDescription || ""
  );
  const [startAt, setStartAt] = useState(initialData?.startAt || "");
  const [endAt, setEndAt] = useState(initialData?.endAt || "");
  const [startAtTime, setStartAtTime] = useState(initialData?.startAtTime || DEFAULT_START_TIME);
  const [endAtTime, setEndAtTime] = useState(initialData?.endAtTime || DEFAULT_END_TIME);
  const [tagIds, setTagIds] = useState<number[]>(initialData?.tagIds ?? []);

  const isRangeInverted = isTaskRangeInverted(startAt, startAtTime, endAt, endAtTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRangeInverted) return;
    onSubmit({
      taskName: taskName.trim(),
      taskDescription: taskDescription.trim(),
      startAt,
      endAt,
      startAtTime,
      endAtTime,
      tagIds,
    });
  };

  const isValid = taskName.trim() && taskDescription.trim() && !isRangeInverted;

  const submitButtonText = isSubmitting
    ? mode === "create"
      ? "생성 중..."
      : "수정 중..."
    : mode === "create"
      ? "태스크 생성"
      : "수정 완료";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="taskName"
        label="태스크 이름"
        required
        value={taskName}
        onChange={(e) => setTaskName(e.target.value)}
        placeholder="태스크 이름을 입력하세요"
        disabled={isSubmitting}
      />

      <TextArea
        id="taskDescription"
        label="태스크 설명"
        required
        value={taskDescription}
        onChange={(e) => setTaskDescription(e.target.value)}
        placeholder="태스크에 대한 상세 설명을 입력하세요"
        disabled={isSubmitting}
      />

      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:items-end">
          <DateInput
            id="startAt"
            label="시작일"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            disabled={isSubmitting}
          />
          <TimeInput
            id="startAtTime"
            label="시작 시간"
            value={startAtTime}
            onChange={(e) => setStartAtTime(e.target.value)}
            disabled={isSubmitting || !startAt}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:items-end">
          <DateInput
            id="endAt"
            label="종료일"
            value={endAt}
            min={startAt || undefined}
            onChange={(e) => setEndAt(e.target.value)}
            disabled={isSubmitting}
          />
          <TimeInput
            id="endAtTime"
            label="종료 시간"
            value={endAtTime}
            onChange={(e) => setEndAtTime(e.target.value)}
            disabled={isSubmitting || !endAt}
          />
        </div>
        {isRangeInverted && (
          <Alert variant="error" message="종료 시각은 시작 시각보다 빠를 수 없습니다." />
        )}
      </div>

      <TaskTagField value={tagIds} onChange={setTagIds} disabled={isSubmitting} />

      <div className="flex flex-col justify-end gap-2 pt-2">
        {cancelHref ? (
          <ButtonLink href={cancelHref} variant="secondary">
            취소
          </ButtonLink>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            취소
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || !isValid}>
          {submitButtonText}
        </Button>
      </div>
    </form>
  );
}
