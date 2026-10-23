// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { type LocalReplay, LOCAL_REPLAY_VERSION, isBetterReplay, loadLocalReplay, saveLocalReplayIfBest } from './localReplay';

const base: LocalReplay = {
  v: LOCAL_REPLAY_VERSION,
  engineVersion: 3,
  boardKey: 's1',
  difficulty: 'normal',
  seed: 1,
  ticks: 5000,
  inputs: [0, 0],
  stars: 2,
  livesLeft: 10,
  savedAt: 0,
};

describe('캠페인 로컬 다시보기 저장 (lib/localReplay)', () => {
  beforeEach(() => localStorage.clear());

  it('더 좋은 판 — 별 → 난이도 → 남은 목숨 → 짧은 판', () => {
    expect(isBetterReplay(base, null)).toBe(true);
    expect(isBetterReplay({ ...base, stars: 3 }, base)).toBe(true);
    expect(isBetterReplay({ ...base, stars: 1, difficulty: 'hard' }, base)).toBe(false);
    expect(isBetterReplay({ ...base, difficulty: 'hard', livesLeft: 6 }, base)).toBe(true);
    expect(isBetterReplay({ ...base, difficulty: 'easy', livesLeft: 20 }, base)).toBe(false);
    expect(isBetterReplay({ ...base, livesLeft: 11 }, base)).toBe(true);
    expect(isBetterReplay({ ...base, ticks: 4999 }, base)).toBe(true);
    expect(isBetterReplay(base, base)).toBe(false);
  });

  it('이긴 판만, 기존보다 좋을 때만 스테이지별 1개 저장', () => {
    expect(saveLocalReplayIfBest('s1', { ...base, stars: 0 })).toBe(false);
    expect(loadLocalReplay('s1')).toBeNull();
    expect(saveLocalReplayIfBest('s1', base)).toBe(true);
    expect(saveLocalReplayIfBest('s1', { ...base, livesLeft: 9 })).toBe(false);
    expect(saveLocalReplayIfBest('s1', { ...base, stars: 3, livesLeft: 19 })).toBe(true);
    expect(loadLocalReplay('s1')?.stars).toBe(3);
    expect(loadLocalReplay('s2')).toBeNull();
    localStorage.setItem('defense:replay:s1', JSON.stringify({ ...base, v: 99 }));
    expect(loadLocalReplay('s1')).toBeNull();
  });

  it('손상된 저장본(정수 아님·모르는 난이도·명령 로그 오염)은 없는 것으로', () => {
    for (const patch of [{ seed: 'x' }, { ticks: 0 }, { difficulty: 'nightmare' }, { inputs: [0, 'a'] }, { engineVersion: 1.5 }, { boardKey: 3 }]) {
      localStorage.setItem('defense:replay:s1', JSON.stringify({ ...base, ...patch }));
      expect(loadLocalReplay('s1')).toBeNull();
    }
  });
});
