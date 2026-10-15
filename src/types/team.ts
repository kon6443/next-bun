/**
 * 팀 요약 정보
 * - 팀 목록 페이지에서 사용
 */
export type TeamSummary = {
  teamId: number;
  name: string;
  description: string;
  role: string;
  /** 안 읽은 채팅 수 (남이 보낸 메시지만) */
  unreadChatCount: number;
};
