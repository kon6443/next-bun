'use client';

import { useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckIcon, CloseIcon, EditIcon } from '@/app/components/Icons';
import { useDialog } from '@/app/hooks/useDialog';
import type { MyTeamNickname } from '@/app/hooks/useMyTeamNickname';
import { TEAM_NICKNAME_MAX_LENGTH } from '@/app/utils/teamNicknameUtils';

/**
 * "이 팀에서 내 이름" 표시·편집 UI — 진입점은 모두 이 파일의 컴포넌트만 쓴다.
 * 상태·검증·저장·토스트·응답 반영은 useMyTeamNickname(TeamBoard에서 1개)이 맡고, 여기는 그리기만 한다.
 *
 * - TeamNicknameInlineEditor: 이름이 보이는 행 안에서 바로 바꾼다 (온라인 목록의 내 항목, 멤버 카드)
 * - TeamNicknameChip: 팀 헤더 설명 줄의 작은 알약 → 대화상자
 */

export const TEAM_NICKNAME_EDIT_LABEL = '이 팀에서 내 이름 바꾸기';

const BUTTON_BASE =
  'min-h-11 rounded-lg border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50';

/** 아이콘만 있는 버튼 — 보이는 크기와 상관없이 누르는 영역 44px */
const ICON_BUTTON =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50';

type TeamNicknameFormProps = {
  nickname: MyTeamNickname;
  /** stacked: 라벨·안내·글자 버튼(대화상자) · row: 입력 칸+아이콘 버튼 한 줄(행 안 편집 — 라벨·안내는 화면 낭독용으로만) */
  layout: 'stacked' | 'row';
  /** 행 편집은 스스로 입력 칸에 포커스한다. 대화상자 안에서는 false — 첫 포커스는 useDialog에 맡겨야 닫을 때 복원된다 */
  focusOnMount: boolean;
  /** 저장(또는 변경 없음)으로 끝남 */
  onDone: () => void;
  onCancel: () => void;
};

/** 공통 폼 — Enter 저장 · Esc 취소. 안내 영역은 폼이 떠 있는 동안 늘 마운트 */
function TeamNicknameForm({ nickname, layout, focusOnMount, onDone, onCancel }: TeamNicknameFormProps) {
  const [value, setValue] = useState(nickname.currentName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 열려 있는 동안 다른 진입점·다른 탭(소켓)에서 이름이 바뀌면, 손대지 않은 입력은 새 이름을 따라간다 —
  // 옛 이름이 남은 채 저장해 되돌리는 일이 없게. 사용자가 고친 입력은 그대로 둔다
  const [baseName, setBaseName] = useState(nickname.currentName);
  if (nickname.currentName !== baseName) {
    setBaseName(nickname.currentName);
    if (value === baseName) setValue(nickname.currentName);
  }

  // 저장 중에 폼이 사라지면(섹션 접기·바텀시트 닫기) 인라인 안내를 볼 곳이 없다 — 실패만 토스트로 알린다
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (nickname.isSaving) return;
    setError(null);
    const result = await nickname.submit(value);
    if (result.ok) {
      if (isMountedRef.current) onDone();
      return;
    }
    if (!isMountedRef.current) {
      toast.error(result.message);
      return;
    }
    setError(result.message);
    inputRef.current?.focus();
  };

  const isRow = layout === 'row';
  const hint = `1~${TEAM_NICKNAME_MAX_LENGTH}자 · 이 팀 안에서만 보여요. 계정 닉네임과 따로 저장돼요.`;

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="text"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        if (error) setError(null);
      }}
      readOnly={nickname.isSaving}
      placeholder={nickname.accountUserName ? `계정 닉네임: ${nickname.accountUserName}` : '팀 닉네임'}
      aria-invalid={error !== null}
      aria-describedby={`${hintId} ${errorId}`}
      autoComplete="off"
      className={`box-border min-h-11 max-w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 text-base text-white placeholder:text-slate-500 focus:border-sky-500/50 focus:outline-none aria-[invalid=true]:border-red-500/50 ${
        isRow ? 'min-w-0 flex-1' : 'w-full'
      }`}
    />
  );

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // 바깥 바텀시트·대화상자는 닫지 않고 폼만 닫는다 (저장 중에는 닫지 않는다).
        // useDialog는 preventDefault된 Esc를 무시한다 — React 루트가 document라 stopPropagation만으로는 못 막는다
        event.preventDefault();
        event.stopPropagation();
        if (!nickname.isSaving) onCancel();
      }}
      className={isRow ? 'min-w-0 flex-1' : 'space-y-2'}
      aria-busy={nickname.isSaving}
    >
      <label htmlFor={inputId} className={isRow ? 'sr-only' : 'block text-xs font-medium text-slate-300'}>
        이 팀에서 내 이름
      </label>
      {isRow ? (
        <div className="flex items-center gap-1">
          {input}
          <button type="submit" disabled={nickname.isSaving} className={`${ICON_BUTTON} text-sky-300`} aria-label={nickname.isSaving ? '저장 중' : '저장'}>
            <CheckIcon className="h-5 w-5" />
          </button>
          <button type="button" disabled={nickname.isSaving} onClick={onCancel} className={ICON_BUTTON} aria-label="취소">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      ) : (
        input
      )}
      <p id={hintId} className={isRow ? 'sr-only' : 'text-xs text-slate-400'}>
        {hint}
      </p>
      {/* 비어 있으면 높이·여백 0 — 행 높이도, 대화상자의 형제 간격(space-y)도 늘리지 않는다 */}
      <p id={errorId} aria-live="polite" className="text-xs text-red-400 not-empty:mt-1 empty:mb-0">
        {error}
      </p>
      {!isRow && (
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={nickname.isSaving}
            className={`${BUTTON_BASE} border-sky-500/30 bg-sky-500/10 text-sky-300 hover:border-sky-500/50 hover:bg-sky-500/20`}
          >
            {nickname.isSaving ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            disabled={nickname.isSaving}
            onClick={onCancel}
            className={`${BUTTON_BASE} border-white/10 bg-transparent text-slate-400 hover:text-slate-300`}
          >
            취소
          </button>
        </div>
      )}
    </form>
  );
}

type TeamNicknameInlineEditorProps = {
  nickname: MyTeamNickname;
  /** 평소에 보이는 이름 부분 — 편집 중에는 이 자리가 입력 칸으로 바뀐다 */
  children: React.ReactNode;
  /** 평소에만 연필 버튼 뒤에 붙는 것 (예: 온라인 상태) — 편집 중에는 입력 칸에 자리를 내준다 */
  trailing?: React.ReactNode;
  className?: string;
};

/**
 * 행 안 편집 — 이름 옆 연필 버튼을 누르면 그 자리의 이름이 입력 칸(+저장·취소 아이콘)으로 바뀐다.
 * 열면 입력 칸으로, 닫으면 연필 버튼으로 포커스. 편집 자격이 없으면 이름만 그린다
 */
export function TeamNicknameInlineEditor({ nickname, children, trailing, className = '' }: TeamNicknameInlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (!isEditing && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [isEditing]);

  // 편집 중 자격을 잃으면(비활성화 등) 편집을 접는다 — 다시 활성화될 때 폼이 혼자 열리지 않게
  useEffect(() => {
    if (!nickname.canEdit) setIsEditing(false);
  }, [nickname.canEdit]);

  const close = () => {
    shouldRestoreFocusRef.current = true;
    setIsEditing(false);
  };

  if (nickname.canEdit && isEditing) {
    return (
      <div className={`flex min-w-0 flex-1 items-center ${className}`}>
        <TeamNicknameForm nickname={nickname} layout="row" focusOnMount onDone={close} onCancel={close} />
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 flex-1 items-center gap-1 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {nickname.canEdit && (
        <button
          ref={editButtonRef}
          type="button"
          onClick={() => setIsEditing(true)}
          className={ICON_BUTTON}
          aria-label={TEAM_NICKNAME_EDIT_LABEL}
          title={TEAM_NICKNAME_EDIT_LABEL}
        >
          <EditIcon className="h-4 w-4" />
        </button>
      )}
      {trailing}
    </div>
  );
}

type TeamNicknameChipProps = {
  nickname: MyTeamNickname;
  /** 대화상자 열림·닫힘 (FAB 숨김·튜토리얼 자동 표시 판단용) */
  onOpenChange?: (isOpen: boolean) => void;
};

/**
 * 팀 헤더 설명 줄 끝의 작은 알약 "내 이름 X ✎" — 누르면 대화상자.
 * 보이는 높이는 작게, 누르는 영역은 위아래로 넓혀 44px. 긴 이름은 말줄임
 */
export function TeamNicknameChip({ nickname, onOpenChange }: TeamNicknameChipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const setOpen = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  // 열린 채로 편집 자격을 잃으면(비활성화 등) 닫힘을 알린다 — 부모가 FAB를 숨긴 채 남지 않게
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => {
    if (!nickname.canEdit && isOpen) {
      setIsOpen(false);
      onOpenChangeRef.current?.(false);
    }
  }, [nickname.canEdit, isOpen]);

  if (!nickname.canEdit) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 text-xs text-slate-300 transition before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] hover:border-white/20 hover:bg-white/10"
        // 보이는 글자("내 이름 X")로 시작해야 음성 제어로 부를 수 있다 (WCAG 2.5.3)
        aria-label={`내 이름 ${nickname.currentName}, ${TEAM_NICKNAME_EDIT_LABEL}`}
        title={TEAM_NICKNAME_EDIT_LABEL}
        aria-haspopup="dialog"
      >
        <span className="shrink-0 text-slate-500">내 이름</span>
        <span className="min-w-0 truncate font-medium text-slate-200">{nickname.currentName}</span>
        <EditIcon className="h-3 w-3 shrink-0 text-slate-400" />
      </button>
      <TeamNicknameDialog nickname={nickname} isOpen={isOpen} onClose={() => setOpen(false)} />
    </>
  );
}

function TeamNicknameDialog({
  nickname,
  isOpen,
  onClose,
}: {
  nickname: MyTeamNickname;
  isOpen: boolean;
  onClose: () => void;
}) {
  // 저장 중에는 Esc·바깥 클릭으로 닫지 않는다 — 응답이 오면 폼이 닫는다
  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose, { closeOnEscape: !nickname.isSaving });
  const titleId = useId();
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/60"
        onClick={() => {
          if (!nickname.isSaving) onClose();
        }}
        aria-hidden="true"
      />
      <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl focus:outline-none"
        >
          <h2 id={titleId} className="mb-3 text-base font-bold text-white">
            {TEAM_NICKNAME_EDIT_LABEL}
          </h2>
          <TeamNicknameForm nickname={nickname} layout="stacked" focusOnMount={false} onDone={onClose} onCancel={onClose} />
        </div>
      </div>
    </>
  );
}
