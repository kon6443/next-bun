// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createGameStorage } from './storage';

const pending = (sessionId: string) => ({
  sessionId,
  playerName: 'n',
  replay: { engineVersion: 1, frames: 30, inputs: [] },
  score: 1,
  savedAt: 1,
});

describe('createGameStorage — 게임별 키·보관 위치', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('키는 "{게임}:{이름}" — 게임끼리 값이 섞이지 않는다', () => {
    const tetris = createGameStorage('tetris', { pendingKind: 'session', pendingLimit: 5 });
    const defense = createGameStorage('defense', { pendingKind: 'local', pendingLimit: 3 });
    tetris.recordBestScore(100);
    defense.saveLastName('수비왕');
    defense.addMyScoreId(7);
    expect(window.localStorage.getItem('tetris:bestScore')).toBe('100');
    expect(window.localStorage.getItem('defense:lastName')).toBe('수비왕');
    expect(window.localStorage.getItem('defense:myScoreIds')).toBe('[7]');
    expect(defense.loadBestScore()).toBe(0);
    expect(tetris.loadLastName()).toBe('');
    expect(tetris.loadMyScoreIds()).toEqual([]);
  });

  it('등록 못 한 기록은 options의 저장소·상한을 따른다', () => {
    const defense = createGameStorage('defense', { pendingKind: 'local', pendingLimit: 3 });
    for (const id of ['a', 'b', 'c', 'd']) defense.savePendingSubmission(pending(id));
    expect(defense.loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['b', 'c', 'd']);
    expect(window.localStorage.getItem('defense:pendingSubmission')).not.toBeNull();
    expect(window.sessionStorage.getItem('defense:pendingSubmission')).toBeNull();
  });
});
