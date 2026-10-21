/**
 * 피드백 카테고리·상태 표시 설정과 입력 한도
 *
 * 코드 값은 백엔드 계약이고, 표시명·배지 스타일만 프론트가 정한다.
 * 카테고리·상태를 추가하면 src/types/feedback.ts의 유니온과 이 파일을 함께 고친다.
 */

import type { FeedbackCategory, FeedbackStatus } from '@/types/feedback';

/** 입력 한도 — 백엔드 검증과 같은 값 */
export const FEEDBACK_LIMITS = {
  titleMax: 100,
  contentMax: 5000,
  pagePathMax: 500,
} as const;

/** 내 피드백 목록 한 번에 불러올 개수 (백엔드 1~50) */
export const FEEDBACK_PAGE_SIZE = 20;

/** 작성 폼 칩 순서 */
export const FEEDBACK_CATEGORIES: readonly { key: FeedbackCategory; label: string }[] = [
  { key: 'FEATURE', label: '기능 추가' },
  { key: 'BUG', label: '버그 리포트' },
  { key: 'IMPROVEMENT', label: '개선 요청' },
  { key: 'QUESTION', label: '문의' },
  { key: 'OTHER', label: '기타' },
];

const CATEGORY_LABELS = Object.fromEntries(
  FEEDBACK_CATEGORIES.map(({ key, label }) => [key, label]),
) as Record<FeedbackCategory, string>;

type FeedbackStatusMeta = {
  label: string;
  /** 배지 스타일 (Tailwind 클래스) */
  badgeClassName: string;
};

const FEEDBACK_STATUS: Record<FeedbackStatus, FeedbackStatusMeta> = {
  RECEIVED: { label: '접수', badgeClassName: 'border-slate-400/30 bg-slate-500/15 text-slate-300' },
  IN_PROGRESS: { label: '검토 중', badgeClassName: 'border-sky-500/30 bg-sky-500/15 text-sky-300' },
  DONE: { label: '반영 완료', badgeClassName: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' },
  REJECTED: { label: '반려', badgeClassName: 'border-rose-500/30 bg-rose-500/15 text-rose-300' },
};

/** 모르는 코드(백엔드가 먼저 추가한 값)는 코드 그대로 보여준다 */
export function getFeedbackCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as FeedbackCategory] ?? category;
}

/** 모르는 상태 코드는 코드 그대로·중립 스타일로 보여준다 */
export function getFeedbackStatusMeta(status: string): FeedbackStatusMeta {
  return (
    FEEDBACK_STATUS[status as FeedbackStatus] ?? {
      label: status,
      badgeClassName: FEEDBACK_STATUS.RECEIVED.badgeClassName,
    }
  );
}
