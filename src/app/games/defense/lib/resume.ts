import { readStorageJson, removeStorage, writeStorage } from '@/app/games/_shared/lib/storage';

/**
 * 판 이어하기 (defense DESIGN §F9b) — 엔진이 결정적이므로 { 보드·seed·엔진 버전·명령 로그·틱 }만 저장하고 복귀 때 다시 돌린다
 * 저장 시점: 웨이브 경계 · 화면 숨김(visibilitychange hidden) · pagehide · 판 중 나가기. 판이 끝나면 지운다. 1슬롯(`defense:resume`)
 * 저장소만 — 엔진을 import하지 않는다(허브 번들). 다시 돌리기는 lib/restoreGame
 */

const KEY = 'defense:resume';
const VERSION = 1;

export type ResumeSlot = {
  v: number;
  engineVersion: number;
  boardKey: string;
  seed: number;
  /** 저장한 순간의 처리 완료 틱 */
  tick: number;
  inputs: number[];
  savedAt: number;
};

export function loadResume(): ResumeSlot | null {
  const raw = readStorageJson<ResumeSlot>('local', KEY);
  if (!raw || raw.v !== VERSION || typeof raw.boardKey !== 'string' || !Array.isArray(raw.inputs)) return null;
  return Number.isInteger(raw.tick) && Number.isInteger(raw.seed) && Number.isInteger(raw.engineVersion) && raw.inputs.every(Number.isInteger) ? raw : null;
}

export function saveResume(slot: Omit<ResumeSlot, 'v'>): boolean {
  return writeStorage('local', KEY, JSON.stringify({ v: VERSION, ...slot }));
}

export function clearResume(): void {
  removeStorage('local', KEY);
}

