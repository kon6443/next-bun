import { FEEDBACK_LIMITS } from '@/app/config/feedbackConfig';
import type { FeedbackCategory } from '@/types/feedback';

export const FEEDBACK_PATH = '/feedback';

export function isFeedbackPath(path: string): boolean {
  return path === FEEDBACK_PATH || path.startsWith(`${FEEDBACK_PATH}/`);
}

/**
 * 피드백 작성 화면 링크 — 지금 보고 있는 경로를 ?from= 으로 넘겨 pagePath로 쓴다
 * 피드백 화면 안에서 누르면 붙이지 않는다 (직전 경로가 피드백 화면 자신이 되지 않게)
 */
export function buildFeedbackHref(currentPath: string): string {
  if (!currentPath || isFeedbackPath(currentPath)) return FEEDBACK_PATH;
  return `${FEEDBACK_PATH}?from=${encodeURIComponent(currentPath)}`;
}

/**
 * ?from= 값을 pagePath로 쓸 수 있으면 반환, 아니면 undefined (= 생략)
 * URL로 들어오는 값이라 내부 경로(/로 시작, //가 아님)만 받고, 쿼리·해시는 버린다(초대 토큰 등이 실리지 않게)
 */
export function toFeedbackPagePath(from: string | string[] | undefined): string | undefined {
  if (typeof from !== 'string') return undefined;
  const path = from.split(/[?#]/)[0];
  if (!path.startsWith('/') || path.startsWith('//')) return undefined;
  if (path.length > FEEDBACK_LIMITS.pagePathMax) return undefined;
  if (isFeedbackPath(path)) return undefined;
  return path;
}

const BUILD_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/** 빌드 SHA가 백엔드 형식(7~40자 hex)이면 반환, 아니면 undefined (= 생략) */
export function toBuildSha(value: string | undefined): string | undefined {
  const sha = value?.trim();
  return sha && BUILD_SHA_PATTERN.test(sha) ? sha : undefined;
}

export type FeedbackDraft = {
  category: FeedbackCategory | null;
  title: string;
  content: string;
};

/** 제출 가능 여부 — 카테고리 선택, 제목 1~100자·내용 1~5000자(앞뒤 공백 제외) */
export function isFeedbackDraftValid({ category, title, content }: FeedbackDraft): boolean {
  const titleLength = title.trim().length;
  const contentLength = content.trim().length;
  return (
    category !== null &&
    titleLength >= 1 &&
    titleLength <= FEEDBACK_LIMITS.titleMax &&
    contentLength >= 1 &&
    contentLength <= FEEDBACK_LIMITS.contentMax
  );
}
