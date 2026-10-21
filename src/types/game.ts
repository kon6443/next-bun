/**
 * 게임·랭킹 API 타입 (백엔드 /api/v1/games/:gameType 계약 — 백엔드 DESIGN §3·§7)
 */

/** 경로의 게임 종류 (소문자) */
export type GameType = 'tetris';

export type RankingPeriod = 'daily' | 'weekly' | 'all';

export type GameSession = {
  sessionId: string;
  /** 0 ~ 2³²−1 */
  seed: number;
  engineVersion: number;
  /** ISO 8601 (UTC) */
  expiresAt: string;
};

/** 테트리스 기록 상세 (DESIGN §1 DETAIL) */
export type TetrisScoreDetail = {
  lines: number;
  level: number;
  pieces: number;
  tSpins: number;
  maxCombo: number;
  tetrises: number;
  engineVersion: number;
  das: number;
  arr: number;
};

/** 제출 리플레이 (DESIGN §4-1) */
export type ReplayPayload = {
  engineVersion: number;
  das: number;
  arr: number;
  frames: number;
  /** [deltaFrame, actionCode, ...] */
  inputs: number[];
};

export type SubmitScoreRequest = {
  sessionId: string;
  playerName: string;
  replay: ReplayPayload;
};

export type SubmitScoreResponse = {
  scoreId: number;
  /** 서버가 리플레이로 다시 계산한 점수 */
  score: number;
  detail: TetrisScoreDetail;
  /** 기록은 저장됐지만 순위 계산만 실패하면 null — 등록은 성공이다 */
  ranks: Record<RankingPeriod, number> | null;
};

export type RankingItem = {
  rank: number;
  scoreId: number;
  playerName: string;
  score: number;
  detail: TetrisScoreDetail;
  /** 플레이 시간 (리플레이 프레임 × 1000 / 60) */
  durationMs: number;
  /** ISO 8601 (UTC) */
  createdAt: string;
};

export type RankingList = {
  items: RankingItem[];
  /** 기간 시작 (ISO 8601 UTC) — 전체 기간이면 의미 없음 */
  periodStart: string | null;
};

/** 랭킹 항목 필드(rank = 전체 순위) + 재생 데이터 */
export type ReplayData = RankingItem & {
  engineVersion: number;
  seed: number;
  das: number;
  arr: number;
  frames: number;
  inputs: number[];
};
