"use client";

import { useState, useEffect } from "react";
import { Input, TextArea, DateInput, TimeInput } from "./FormInput";
import { Button, ButtonLink } from "./Button";
import { DEFAULT_START_TIME, DEFAULT_END_TIME } from "@/app/utils/dateUtils";

export type TaskFormData = {
  taskName: string;
  taskDescription: string;
  startAt: string;
  endAt: string;
  startAtTime: string;
  endAtTime: string;
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

  // initialData가 변경되면 폼 상태 업데이트 (편집 모드 진입 시)
  useEffect(() => {
    if (initialData) {
      setTaskName(initialData.taskName);
      setTaskDescription(initialData.taskDescription);
      setStartAt(initialData.startAt);
      setEndAt(initialData.endAt);
      setStartAtTime(initialData.startAtTime || DEFAULT_START_TIME);
      setEndAtTime(initialData.endAtTime || DEFAULT_END_TIME);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      taskName: taskName.trim(),
      taskDescription: taskDescription.trim(),
      startAt,
      endAt,
      startAtTime,
      endAtTime,
    });
  };

  const isValid = taskName.trim() && taskDescription.trim();

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

      <div className="grid gap-4">
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
      </div>

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
