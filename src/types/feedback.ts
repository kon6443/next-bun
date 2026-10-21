/**
 * 피드백 API 타입 (백엔드 /api/v1/feedbacks 계약)
 * 표시명·한도 상수는 src/app/config/feedbackConfig.ts
 */

export type FeedbackCategory = 'FEATURE' | 'BUG' | 'IMPROVEMENT' | 'QUESTION' | 'OTHER';

export type FeedbackStatus = 'RECEIVED' | 'IN_PROGRESS' | 'DONE' | 'REJECTED';

export type FeedbackListItem = {
  feedbackId: number;
  category: FeedbackCategory;
  title: string;
  status: FeedbackStatus;
  hasReply: boolean;
  /** ISO 8601 (UTC) */
  createdAt: string;
};

export type FeedbackDetail = FeedbackListItem & {
  content: string;
  adminReply: string | null;
  /** ISO 8601 (UTC) */
  repliedAt: string | null;
  pagePath: string | null;
};

/** 요청 바디 — 백엔드 DTO에 있는 필드만 (여분 필드는 VALIDATION_ERROR). User-Agent는 서버가 헤더에서 저장한다 */
export type CreateFeedbackRequest = {
  category: FeedbackCategory;
  title: string;
  content: string;
  /** 피드백 화면 진입 직전 경로 (최대 500자) */
  pagePath?: string;
  /** 빌드 커밋 SHA (7~40자 hex) */
  buildSha?: string;
};

/** 내 피드백 조회 조건 — beforeId는 미포함(exclusive), 없으면 최신부터 */
export type GetMyFeedbacksQuery = {
  beforeId?: number;
  /** 1~50, 기본 20 */
  limit?: number;
};

export type MyFeedbackPage = {
  /** 최신순 */
  items: FeedbackListItem[];
  hasMore: boolean;
};
