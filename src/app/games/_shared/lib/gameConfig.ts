import type { GameType, RankingItem, ScoreDetailByGame } from '@/types/game';
import type { GameStorage } from './storage';

/**
 * 게임별 화면 사양 — 공용 화면(랭킹·등록 패널)이 경로·이름·기록 요약·저장소를 여기서 받는다
 * 함수가 들어 있어 서버 컴포넌트에서 클라이언트 컴포넌트로 넘길 수 없다 — 게임 쪽 클라이언트 파일에서 넘긴다
 * 모듈 상수로 둔다(렌더마다 새로 만들지 않는다) — 공용 화면의 effect가 사양·저장소의 동일성에 의존한다
 */
export type GameUiConfig<G extends GameType> = {
  gameType: G;
  /** 화면 표시 이름 — "테트리스" */
  name: string;
  homePath: string;
  playPath: string;
  rankingsPath: string;
  replayPath: (scoreId: number) => string;
  /** 랭킹 행 둘째 줄의 기록 요약 (날짜 앞) — "40줄 · 레벨 5 · 1:23" */
  rankingDetail: (item: RankingItem<ScoreDetailByGame[G]>) => string;
  /** 점수 표시 — 없으면 숫자(1,234). 디펜스는 "웨이브 n · 진척 p%"(정렬은 서버 점수 그대로) */
  formatScore?: (score: number) => string;
  storage: GameStorage<G>;
};
