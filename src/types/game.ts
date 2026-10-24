/**
 * 게임·랭킹 API 타입 (백엔드 /api/v1/games/:gameType 계약 — 백엔드 DESIGN §3·§7, 게임 일반화는 defense DESIGN §B)
 * 게임별로 모양이 다른 값(기록 상세·제출 리플레이·재생 데이터)은 *ByGame 맵으로 gameType과 짝짓는다
 */

/** 경로의 게임 종류 (소문자) */
export type GameType = 'tetris' | 'defense';

export type RankingPeriod = 'daily' | 'weekly' | 'all';

/** 세션 모드 — 디펜스 endless·weekly, 테트리스 daily(오늘의 테트리스)·challenge(도전장 — 기본 판은 null) */
export type GameMode = 'endless' | 'weekly' | 'daily' | 'challenge';

/** 세션 요청 본문 board로 고를 수 있는 모드 — 도전장은 board가 아니라 challengeScoreId로 */
export type SessionBoard = Exclude<GameMode, 'challenge'>;

export type GameSession = {
  sessionId: string;
  /** 0 ~ 2³²−1 */
  seed: number;
  engineVersion: number;
  /** ISO 8601 (UTC) */
  expiresAt: string;
  /** 세션 유효 시간(초, 엔진별) — 만료는 받은 시각 + 이 값으로 센다(기기 시계와 무관). 이 필드 배포 전 서버면 없다 */
  ttlSeconds?: number;
  /** 이 세션이 등록될 랭킹 보드 (테트리스 'default') — 백엔드 보드 일반화 배포 전에는 오지 않는다 */
  boardKey?: string;
  mode?: GameMode | null;
};

/** 랭킹 보드 (GET /games/:gameType/boards — D-024) */
export type GameBoard = {
  boardKey: string;
  mode: GameMode | null;
  /** 지금 등록받는 보드 (지난 시즌·지난 주는 false) */
  current: boolean;
  /** 기간 있는 보드(주간)의 시작·끝 — ISO 8601 (UTC), 없으면 null */
  startsAt: string | null;
  endsAt: string | null;
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

/** 테트리스 밖 게임의 기록 상세 — 게임별 정수 값 (백엔드 detail: Record<string, number>) */
export type GenericScoreDetail = Record<string, number>;

export type ScoreDetailByGame = {
  tetris: TetrisScoreDetail;
  defense: GenericScoreDetail;
};

/** 테트리스 제출 리플레이 (DESIGN §4-1) — das·arr를 최상위에 싣는다 */
export type ReplayPayload = {
  engineVersion: number;
  das: number;
  arr: number;
  frames: number;
  /** [deltaFrame, actionCode, ...] */
  inputs: number[];
};

/** 테트리스 밖 게임의 제출 리플레이 — frames = 엔진 틱 수, 게임별 값은 params (defense D-018) */
export type ParamsReplayPayload = {
  engineVersion: number;
  frames: number;
  inputs: number[];
  params?: Record<string, number>;
};

export type ReplayPayloadByGame = {
  tetris: ReplayPayload;
  defense: ParamsReplayPayload;
};

export type SubmitScoreRequest<G extends GameType = 'tetris'> = {
  sessionId: string;
  playerName: string;
  replay: ReplayPayloadByGame[G];
};

export type SubmitScoreResponse<D = TetrisScoreDetail> = {
  scoreId: number;
  /** 서버가 리플레이로 다시 계산한 점수 */
  score: number;
  detail: D;
  /** 기록은 저장됐지만 순위 계산만 실패하면 null — 등록은 성공이다 */
  ranks: Record<RankingPeriod, number> | null;
  /** 서버가 저장한 이름(앞뒤 공백·연속 공백 정리값) — 공유 카드·결과·최근 이름은 이 값. 이 필드 배포 전 응답에는 없다(보낸 이름으로 폴백) */
  playerName?: string;
};

export type RankingItem<D = TetrisScoreDetail> = {
  rank: number;
  scoreId: number;
  playerName: string;
  score: number;
  detail: D;
  /** 플레이 시간 (리플레이 프레임 × 1000 / 게임의 초당 프레임 — 테트리스 60) */
  durationMs: number;
  /** ISO 8601 (UTC) */
  createdAt: string;
  /** 기록이 속한 랭킹 보드 (테트리스 'default' · 디펜스 endless-s{N}·weekly-YYYY-wNN) — 보드 일반화 전 응답에는 없다 */
  boardKey?: string;
  /** 누적 조회수 — 조회수 배포 전 응답에는 없다(0으로 표시) */
  viewCount?: number;
  /** 누적 시청 시간(ms, 벽시계) — 조회수 배포 전 응답에는 없다 */
  watchMs?: number;
};

/** 인기 리플레이 정렬 — 기간 조회수·기간 시청 시간 */
export type PopularSort = 'views' | 'watch';

/** 인기 리플레이 항목 — rank는 인기 순서(점수 순위가 아니다) */
export type PopularReplayItem<D = TetrisScoreDetail> = RankingItem<D> & {
  periodViewCount: number;
  periodWatchMs: number;
};

/** GET /games/:gameType/popular-replays */
export type PopularReplayList<D = TetrisScoreDetail> = {
  boardKey: string;
  period: RankingPeriod;
  sort: PopularSort;
  /** 기간 시작 (ISO 8601 UTC) — 전체 기간이면 의미 없음 */
  periodStart: string | null;
  items: PopularReplayItem<D>[];
};

/** POST /games/:gameType/scores/:scoreId/views — counted=false(서버가 세지 않음)여도 200 */
export type ReplayViewResult = { scoreId: number; viewCount: number; counted: boolean };

/** POST /games/:gameType/scores/:scoreId/watch — countedMs는 서버 상한으로 자른 뒤 반영된 양 */
export type ReplayWatchResult = { scoreId: number; watchMs: number; countedMs: number };

/** 기록 1건 요약 (GET /games/:gameType/scores/:scoreId) — 랭킹 항목과 같은 형태, rank는 전체 기간 순위 */
export type ScoreSummary<D = TetrisScoreDetail> = RankingItem<D>;

export type RankingList<D = TetrisScoreDetail> = {
  items: RankingItem<D>[];
  /** 기간 시작 (ISO 8601 UTC) — 전체 기간이면 의미 없음 */
  periodStart: string | null;
};

/** 테트리스 재생 데이터 — 랭킹 항목 필드(rank = 전체 순위) + 재생 데이터 */
export type ReplayData = RankingItem & {
  engineVersion: number;
  seed: number;
  das: number;
  arr: number;
  frames: number;
  inputs: number[];
};

/** 테트리스 밖 게임의 재생 데이터 — das·arr 대신 params, 보드 키 (defense DESIGN §B6) */
export type ParamsReplayData = RankingItem<GenericScoreDetail> & {
  engineVersion: number;
  seed: number;
  frames: number;
  inputs: number[];
  params?: Record<string, number>;
};

export type ReplayDataByGame = {
  tetris: ReplayData;
  defense: ParamsReplayData;
};
