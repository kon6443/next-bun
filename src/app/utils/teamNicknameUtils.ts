import { ApiError } from '@/types/api';
import type { TaskDetailResponse } from '@/services/teamService';
import type { TeamChatMessage } from './teamChatUtils';

/**
 * 팀 닉네임 — 입력 검증과 memberNicknameChanged 반영
 *
 * 반영 함수는 모두 바뀐 것이 없으면 같은 객체·배열을 돌려준다(불필요한 리렌더 방지).
 * 같은 변경을 HTTP 응답과 소켓 이벤트로 두 번 받아도 결과가 같다(멱등).
 */

export const TEAM_NICKNAME_MAX_LENGTH = 20;
/** DB 컬럼 VARCHAR2(100 BYTE) — 백엔드 @IsByteLength(1, 100) */
export const TEAM_NICKNAME_MAX_BYTES = 100;

export type TeamNicknameValidation = { ok: true; value: string } | { ok: false; message: string };

/**
 * 백엔드 길이 판정(class-validator @Length → validator.js isLength)과 같은 계산.
 * UTF-16 길이에서 이모지 변형 선택자(U+FE0E·U+FE0F)가 붙은 쌍과 서로게이트 쌍을 하나씩 뺀다.
 * String.length나 코드포인트 수와는 다르다 — 예: ❤️ 1자, 👨‍👩‍👧 5자
 */
export function countTeamNicknameLength(value: string): number {
  const variationSelectorPairs = value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g) ?? [];
  const surrogatePairs = value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) ?? [];
  return value.length - variationSelectorPairs.length - surrogatePairs.length;
}

/** 앞뒤 공백을 뺀 1~20자, UTF-8 100바이트 이하 (백엔드 검증과 같은 기준) */
export function validateTeamNickname(raw: string): TeamNicknameValidation {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: '팀 닉네임을 입력해주세요.' };
  if (countTeamNicknameLength(value) > TEAM_NICKNAME_MAX_LENGTH) {
    return { ok: false, message: `팀 닉네임은 ${TEAM_NICKNAME_MAX_LENGTH}자 이하로 입력해주세요.` };
  }
  if (new TextEncoder().encode(value).length > TEAM_NICKNAME_MAX_BYTES) {
    return { ok: false, message: '팀 닉네임이 너무 깁니다. 이모지·특수문자를 줄여 주세요.' };
  }
  return { ok: true, value };
}

/** 저장 실패 안내 — 백엔드 영문 검증 메시지 대신 코드별 한국어 문구 */
export function getTeamNicknameErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'TEAM_FORBIDDEN' || err.status === 403) return '활성 멤버만 팀 닉네임을 바꿀 수 있습니다.';
    if (err.code === 'VALIDATION_ERROR' || err.status === 422) {
      return `팀 닉네임은 1~${TEAM_NICKNAME_MAX_LENGTH}자로 입력해주세요.`;
    }
  }
  return err instanceof Error && err.message ? err.message : '팀 닉네임 변경에 실패했습니다.';
}

/** userId가 같은 항목의 userName을 바꾼다 (멤버 목록·온라인 유저·채팅 읽음 명단) */
export function renameUser<T extends { userId: number; userName: string | null }>(
  list: T[],
  userId: number,
  userName: string,
): T[] {
  if (!list.some((item) => item.userId === userId && item.userName !== userName)) return list;
  return list.map((item) => (item.userId === userId ? { ...item, userName } : item));
}

/** 태스크 작성자(crtdBy) 이름 */
export function renameTaskCreator<T extends { crtdBy: number; userName: string | null }>(
  tasks: T[],
  userId: number,
  userName: string,
): T[] {
  if (!tasks.some((task) => task.crtdBy === userId && task.userName !== userName)) return tasks;
  return tasks.map((task) => (task.crtdBy === userId ? { ...task, userName } : task));
}

/** 태스크 상세 — 작성자와 그 사람의 댓글 */
export function renameInTaskDetail(detail: TaskDetailResponse, userId: number, userName: string): TaskDetailResponse {
  const comments = renameUser(detail.comments, userId, userName);
  const isCreatorChanged = detail.crtdBy === userId && detail.userName !== userName;
  if (!isCreatorChanged && comments === detail.comments) return detail;
  return { ...detail, comments, ...(isCreatorChanged ? { userName } : {}) };
}

/** 채팅 보낸 사람 — 내 메시지는 이름 대신 '나'로 다루므로 건드리지 않는다 */
export function renameChatSender(messages: TeamChatMessage[], userId: number, userName: string): TeamChatMessage[] {
  const shouldRename = (m: TeamChatMessage) => !m.isMine && m.userId === userId && m.sender !== userName;
  if (!messages.some(shouldRename)) return messages;
  return messages.map((m) => (shouldRename(m) ? { ...m, sender: userName } : m));
}
