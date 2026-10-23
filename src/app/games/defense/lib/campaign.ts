/**
 * 캠페인 화면 정보 — 허브·스테이지 화면은 엔진을 불러오지 않는다(§F10: 엔진·데이터는 /play 라우트만)
 * 엔진 데이터(CAMPAIGN_STAGES)와 어긋나지 않는지는 campaign.test.ts가 지킨다
 */

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export type StageMeta = {
  /** 엔진 스테이지 id ('s1' ~ 's8') */
  id: string;
  number: number;
  waves: number;
  startGold: number;
  /** 쓸 수 있는 타워 (TOWER_ID) */
  towers: readonly number[];
  maxLevel: number;
  /** 새로 나오는 것 — 스테이지 화면 한 줄 (§L2) */
  intro: string;
};

export const CAMPAIGN: readonly StageMeta[] = [
  { id: 's1', number: 1, waves: 6, startGold: 220, towers: [0, 1], maxLevel: 3, intro: '궁수탑과 대포로 졸개·질주병을 막아요' },
  { id: 's2', number: 2, waves: 8, startGold: 260, towers: [0, 1, 2], maxLevel: 4, intro: '새 타워 마법탑 · 새 적 방패병' },
  { id: 's3', number: 3, waves: 8, startGold: 300, towers: [0, 1, 2, 3], maxLevel: 4, intro: '새 타워 서리탑 · 새 적 분열체' },
  { id: 's4', number: 4, waves: 8, startGold: 340, towers: [0, 1, 2, 3, 4], maxLevel: 4, intro: '새 타워 대공 석궁 · 공중 적 박쥐 떼' },
  { id: 's5', number: 5, waves: 10, startGold: 380, towers: [0, 1, 2, 3, 4], maxLevel: 5, intro: 'Lv5 궁극 해금 · 중간 보스 소환사' },
  { id: 's6', number: 6, waves: 10, startGold: 420, towers: [0, 1, 2, 3, 4, 5], maxLevel: 5, intro: '새 타워 테슬라 · 유령·와이번' },
  { id: 's7', number: 7, waves: 10, startGold: 460, towers: [0, 1, 2, 3, 4, 5], maxLevel: 5, intro: '사제(치유)·공성 거인' },
  { id: 's8', number: 8, waves: 12, startGold: 500, towers: [0, 1, 2, 3, 4, 5], maxLevel: 5, intro: '모든 적과 최종 보스 용' },
];

export function stageMeta(id: string): StageMeta | null {
  return CAMPAIGN.find((s) => s.id === id) ?? null;
}

/** 엔진 보드 키 — 보통은 접미사 없음 (engine data/stages findStage) */
export function boardKeyOf(stageId: string, difficulty: Difficulty): string {
  return difficulty === 'normal' ? stageId : `${stageId}-${difficulty}`;
}

/** 보드 키 → 캠페인 스테이지·난이도 (캠페인이 아니면 null) */
export function parseBoardKey(key: string): { stage: StageMeta; difficulty: Difficulty } | null {
  const match = /^(s[1-8])(?:-(easy|hard))?$/.exec(key);
  const stage = match ? stageMeta(match[1]) : null;
  if (!match || !stage) return null;
  return { stage, difficulty: (match[2] as Difficulty | undefined) ?? 'normal' };
}

/** 별점 — 남은 목숨 18 이상 ★3 · 6 이상 ★2 · 1 이상 ★1 (§L5) */
export function starsFor(livesLeft: number): number {
  if (livesLeft >= 18) return 3;
  if (livesLeft >= 6) return 2;
  return livesLeft >= 1 ? 1 : 0;
}

/** 시드 없이 들어오면 무작위 — 캠페인은 랭킹이 없어 seed는 전투 난수에만 쓰인다 (1 ~ 2³¹−1) */
export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 0x7ffffffe);
}

/** ?seed= 쿼리 — 1 이상 2³¹ 미만 정수만, 그 밖은 null(무작위로) */
export function parseSeedParam(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  const seed = Number(raw);
  return seed >= 1 && seed < 2 ** 31 ? seed : null;
}

export function playPath(stageId: string, difficulty: Difficulty): string {
  return `/games/defense/play/stage/${boardKeyOf(stageId, difficulty)}`;
}

export function stagePath(stageId: string): string {
  return `/games/defense/campaign/${stageId}`;
}
