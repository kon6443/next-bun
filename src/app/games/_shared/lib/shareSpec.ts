import { SITE_CONFIG } from '@/app/config/siteConfig';
import type { ScoreSummary } from '@/types/game';
import type { ReplayCard } from './replayCard';

/**
 * 리플레이 공유 사양 — 게임마다 하나. 공유 메뉴·카카오 카드·링크 미리보기 메타·OG 이미지가 모두 이 사양에서 문구를 받는다
 * (defense D-019 — 경로·문구·상세 필드만 게임별, 나머지 흐름은 공통)
 */

/** 공유 대상 기록 — 랭킹 항목·재생 데이터에서 뽑는다 */
export type ShareSubject<D> = {
  scoreId: number;
  playerName: string;
  score: number;
  detail: D;
  /** 기록의 랭킹 보드 — 보드가 여럿인 게임만 문구에 쓴다(테트리스는 무시) */
  boardKey?: string;
};

export type ReplayShareSpec<D> = {
  /** 리플레이 페이지 경로 — 경로 문자열 그대로도 받는다(메타의 canonical) */
  replayPath: (scoreId: number | string) => string;
  /** 미리보기 이미지 경로 — route group 밖 고정 route handler (replays/[scoreId]/og/route.tsx) */
  imagePath: (scoreId: number | string) => string;
  /** 제목 — "{이름}님의 테트리스 {점수}점" */
  headline: (subject: Pick<ShareSubject<D>, 'playerName' | 'score' | 'boardKey'>) => string;
  /** 짧은 기록 요약 — 공유 문구·카카오 설명 ("40줄 · 레벨 5") */
  statLine: (detail: D) => string;
  /** 링크 미리보기 설명 (기록이 있을 때) */
  metaDescription: (summary: ScoreSummary<D>) => string;
  /** 미리보기 카드 문구 — korean=false면 ASCII만, summary가 없으면 일반 카드 */
  card: (summary: ScoreSummary<D> | null, korean: boolean) => ReplayCard;
  /** 기록을 못 찾았을 때(없음·숨김·네트워크) */
  fallback: {
    /** 메타 제목·이미지 대체 텍스트 */
    title: string;
    description: string;
    /** 카드 가운데 큰 글씨 (ASCII — 폰트 없이도 그린다) */
    cardTitle: string;
  };
};

/** 사이트 절대 URL — 공유 링크는 쿼리 없이 */
export function absoluteUrl(path: string): string {
  return `${SITE_CONFIG.url}${path}`;
}

/** "{제목} ({기록 요약}) — 리플레이 보기" */
export function buildShareText<D>(spec: ReplayShareSpec<D>, subject: ShareSubject<D>): string {
  return `${spec.headline(subject)} (${spec.statLine(subject.detail)}) — 리플레이 보기`;
}

/** 공유 메뉴에 넘기는 내용 — 게임 무관 */
export type ShareContent = {
  url: string;
  /** Web Share 제목 */
  title: string;
  /** Web Share 본문·메뉴 미리보기 문구 */
  text: string;
  kakao: { title: string; description: string; imageUrl: string };
};

export function buildShareContent<D>(spec: ReplayShareSpec<D>, subject: ShareSubject<D>): ShareContent {
  const headline = spec.headline(subject);
  return {
    url: absoluteUrl(spec.replayPath(subject.scoreId)),
    title: headline,
    text: buildShareText(spec, subject),
    kakao: {
      title: headline,
      description: `${spec.statLine(subject.detail)} — 리플레이로 플레이를 다시 보세요`,
      imageUrl: absoluteUrl(spec.imagePath(subject.scoreId)),
    },
  };
}
