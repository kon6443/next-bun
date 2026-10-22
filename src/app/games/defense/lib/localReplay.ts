import { readStorageJson, writeStorage } from '@/app/games/_shared/lib/storage';
import { DIFFICULTIES, type Difficulty } from './campaign';

/**
 * 캠페인 로컬 다시보기 저장 (§F7·§F10: `defense:replay:{stageId}`, 스테이지별 최고 1개) — 재생기는 F3
 * 명령 로그는 엔진 리플레이 입력 그대로(ReplayInput + engineVersion) — 재생 시 그 버전 엔진으로 simulateReplay
 */

const VERSION = 1;

export type LocalReplay = {
  v: number;
  engineVersion: number;
  boardKey: string;
  difficulty: Difficulty;
  seed: number;
  ticks: number;
  inputs: number[];
  stars: number;
  livesLeft: number;
  /** 저장 시각 (ms) */
  savedAt: number;
};

const keyOf = (stageId: string) => `defense:replay:${stageId}`;

export function loadLocalReplay(stageId: string): LocalReplay | null {
  const raw = readStorageJson<LocalReplay>('local', keyOf(stageId));
  return raw && raw.v === VERSION && Array.isArray(raw.inputs) ? raw : null;
}

/** 더 좋은 판 — 새 엔진 버전 → 별 → 난이도 → 남은 목숨 → 짧은 판 순 (구버전 기록은 재생 엔진이 생길 때까지 새 기록에 자리를 내준다) */
export function isBetterReplay(next: LocalReplay, current: LocalReplay | null): boolean {
  if (!current) return true;
  if (next.engineVersion !== current.engineVersion) return next.engineVersion > current.engineVersion;
  if (next.stars !== current.stars) return next.stars > current.stars;
  const rank = (d: Difficulty) => DIFFICULTIES.indexOf(d);
  if (next.difficulty !== current.difficulty) return rank(next.difficulty) > rank(current.difficulty);
  if (next.livesLeft !== current.livesLeft) return next.livesLeft > current.livesLeft;
  return next.ticks < current.ticks;
}

/** 이긴 판만 저장 — 기존 최고보다 좋을 때만. 저장했으면 true */
export function saveLocalReplayIfBest(stageId: string, replay: LocalReplay): boolean {
  if (replay.stars <= 0 || !isBetterReplay(replay, loadLocalReplay(stageId))) return false;
  return writeStorage('local', keyOf(stageId), JSON.stringify(replay));
}

export const LOCAL_REPLAY_VERSION = VERSION;
