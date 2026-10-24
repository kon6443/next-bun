import { readStorageJson, writeStorage } from '@/app/games/_shared/lib/storage';
import { CAMPAIGN, type Difficulty } from './campaign';

/**
 * 캠페인 진행 저장 (§F10 저장: `defense:progress`, `{ v }` 스키마 버전, 쓰기 실패 허용)
 * 해금(§L2·§L5·§L7): S1은 처음부터 · 스테이지를 어느 난이도로든 깨면(별 1+) 다음 스테이지 · 어려움은 그 스테이지 보통 클리어 후
 * 영구 강화가 없어 조작해도 랭킹 영향 0 (D-005·D-006)
 */

export const PROGRESS_KEY = 'defense:progress';
const KEY = PROGRESS_KEY;
const VERSION = 1;

/**
 * 스테이지 id → 난이도별 최고 별 (깬 적 없으면 키 없음)
 * 학습(§F5)·도감 기록은 선택 필드(v1 그대로 — 없으면 처음 상태): S1 튜토리얼 끝냄 · 본 브리핑 카드(스테이지 id) · 만난 적(ENEMY_ID)
 */
export type Progress = {
  v: number;
  stars: Record<string, Partial<Record<Difficulty, number>>>;
  tutorialDone?: boolean;
  briefingsSeen?: string[];
  metEnemies?: number[];
};

export function emptyProgress(): Progress {
  return { v: VERSION, stars: {} };
}

/**
 * 저장본이 없거나 형식이 다르면 빈 진행. 선택 필드는 필드별로 — 형식이 틀린 필드만 버린다(손상된 저장본이 도감·결과 화면을 깨뜨리지 않게)
 */
export function loadProgress(): Progress {
  const raw = readStorageJson<Progress>('local', KEY);
  if (!raw || raw.v !== VERSION || typeof raw.stars !== 'object' || raw.stars === null || Array.isArray(raw.stars)) return emptyProgress();
  const progress: Progress = { v: VERSION, stars: raw.stars };
  if (raw.tutorialDone === true) progress.tutorialDone = true;
  if (Array.isArray(raw.briefingsSeen)) progress.briefingsSeen = raw.briefingsSeen.filter((id): id is string => typeof id === 'string');
  if (Array.isArray(raw.metEnemies)) progress.metEnemies = raw.metEnemies.filter((kind): kind is number => Number.isInteger(kind));
  return progress;
}

export function saveProgress(progress: Progress): boolean {
  return writeStorage('local', KEY, JSON.stringify(progress));
}

/** 결과 반영 — 별이 기존보다 높을 때만 갱신(새 객체). 패배(별 0)는 그대로 */
export function recordStars(progress: Progress, stageId: string, difficulty: Difficulty, stars: number): Progress {
  const current = progress.stars[stageId]?.[difficulty] ?? 0;
  if (stars <= current) return progress;
  return { ...progress, stars: { ...progress.stars, [stageId]: { ...progress.stars[stageId], [difficulty]: stars } } };
}

/** 그 스테이지의 최고 별(모든 난이도 중) */
export function bestStars(progress: Progress, stageId: string): number {
  const record = progress.stars[stageId];
  if (!record) return 0;
  return Math.max(0, ...Object.values(record).map((n) => n ?? 0));
}

/** 무한·주간을 여는 스테이지 (§L7 — 공중까지 배운 뒤). 랭킹 보기는 해금과 무관 */
export const RANKED_UNLOCK_STAGE = 's4';

export function isRankedUnlocked(progress: Progress): boolean {
  return bestStars(progress, RANKED_UNLOCK_STAGE) > 0;
}

export function isStageUnlocked(progress: Progress, stageId: string): boolean {
  const index = CAMPAIGN.findIndex((s) => s.id === stageId);
  if (index < 0) return false;
  return index === 0 || bestStars(progress, CAMPAIGN[index - 1].id) > 0;
}

export function isDifficultyUnlocked(progress: Progress, stageId: string, difficulty: Difficulty): boolean {
  if (!isStageUnlocked(progress, stageId)) return false;
  return difficulty !== 'hard' || (progress.stars[stageId]?.normal ?? 0) > 0;
}

export function markTutorialDone(progress: Progress): Progress {
  return progress.tutorialDone ? progress : { ...progress, tutorialDone: true };
}

export function hasSeenBriefing(progress: Progress, stageId: string): boolean {
  return (progress.briefingsSeen ?? []).includes(stageId);
}

export function markBriefingSeen(progress: Progress, stageId: string): Progress {
  return hasSeenBriefing(progress, stageId) ? progress : { ...progress, briefingsSeen: [...(progress.briefingsSeen ?? []), stageId] };
}

/** 만난 적 추가 — 새로 만난 것이 없으면 같은 객체(저장 생략 판단용) */
export function markEnemiesMet(progress: Progress, kinds: readonly number[]): Progress {
  const met = progress.metEnemies ?? [];
  const fresh = kinds.filter((k, i) => !met.includes(k) && kinds.indexOf(k) === i);
  return fresh.length === 0 ? progress : { ...progress, metEnemies: [...met, ...fresh].sort((a, b) => a - b) };
}
