import type { RankingPeriod } from '@/types/game';

/**
 * 등록 결과 자랑 문구 (games-growth B3) — 상위권이거나 개인 최고를 갱신했을 때만 공유 버튼을 강조한다
 * 기간은 넓은 것부터 본다: 전체 10위 안이면 주간·일간도 10위 안이라, 더 드문 성취를 말한다
 */

/** 이 순위 안이면 자랑 */
export const BRAG_RANK_LIMIT = 10;

const PERIOD_ORDER: readonly RankingPeriod[] = ['all', 'weekly', 'daily'];
const PERIOD_LABEL: Record<RankingPeriod, string> = { all: '전체', weekly: '이번 주', daily: '오늘' };

/**
 * @param ranks 등록 응답의 서버 순위 — 순위 계산이 실패하면 null
 * @param isNewBest 이 기기의 개인 최고를 갱신했나 (게임·보드별 로컬 기록)
 * @param periods 결과 화면에 보이는 기간 — 보이지 않는 기간의 순위로 자랑하지 않는다
 * @returns 공유 버튼 문구, 자랑할 것이 없으면 null
 */
export function bragLabel({
  ranks,
  isNewBest,
  periods,
}: {
  ranks: Record<RankingPeriod, number> | null;
  isNewBest: boolean;
  periods: readonly RankingPeriod[];
}): string | null {
  for (const period of PERIOD_ORDER) {
    if (!periods.includes(period)) continue;
    const rank = ranks?.[period];
    if (typeof rank === 'number' && rank >= 1 && rank <= BRAG_RANK_LIMIT) return `${PERIOD_LABEL[period]} ${rank}위! 친구에게 자랑하기`;
  }
  return isNewBest ? '개인 최고 갱신! 친구에게 자랑하기' : null;
}
