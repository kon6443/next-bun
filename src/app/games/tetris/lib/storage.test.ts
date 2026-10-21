// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  addMyScoreId,
  loadBestScore,
  loadMyScoreIds,
  loadPendingSubmissions,
  loadSettings,
  recordBestScore,
  removePendingSubmission,
  savePendingSubmission,
  saveSettings,
} from './storage';

describe('테트리스 저장소', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('설정: 저장값을 허용 범위로 자르고, 깨진 값이면 기본값', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    saveSettings({ das: 99, arr: -3, vibration: false });
    expect(loadSettings()).toEqual({ das: 20, arr: 0, vibration: false });
    window.localStorage.setItem('tetris:settings', '{깨짐');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('최고점: 더 높을 때만 갱신', () => {
    expect(recordBestScore(100)).toBe(true);
    expect(recordBestScore(50)).toBe(false);
    expect(loadBestScore()).toBe(100);
  });

  it('내 기록 id: 최신이 앞, 중복 없음', () => {
    addMyScoreId(1);
    addMyScoreId(2);
    addMyScoreId(1);
    expect(loadMyScoreIds()).toEqual([1, 2]);
  });

  it('등록 못 한 기록은 세션별로 보관 — 다른 판의 등록·삭제가 이 판 기록을 건드리지 않는다', () => {
    const make = (sessionId: string, score: number) => ({
      sessionId,
      playerName: 'n',
      replay: { engineVersion: 1, das: 10, arr: 2, frames: 10, inputs: [] },
      score,
      savedAt: 1,
    });
    savePendingSubmission(make('A', 1));
    savePendingSubmission(make('B', 2));
    savePendingSubmission(make('A', 3)); // 같은 세션은 갱신
    expect(loadPendingSubmissions().map((p) => [p.sessionId, p.score])).toEqual([['B', 2], ['A', 3]]);
    removePendingSubmission('B');
    expect(loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['A']);
    removePendingSubmission('A');
    expect(loadPendingSubmissions()).toEqual([]);
    expect(window.sessionStorage.getItem('tetris:pendingSubmission')).toBeNull();
  });

  it('용량을 넘으면 가장 오래된 기록부터 빼고 최신 기록을 지킨다', () => {
    const big = (sessionId: string) => ({
      sessionId,
      playerName: 'n',
      replay: { engineVersion: 1, das: 10, arr: 2, frames: 10, inputs: new Array(1000).fill(1) },
      score: 1,
      savedAt: 1,
    });
    savePendingSubmission(big('A'));
    savePendingSubmission(big('B'));
    // 이후에는 기록 1건 분량만 들어간다고 가정
    const limit = JSON.stringify([big('C')]).length;
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (value.length > limit) throw new DOMException('quota', 'QuotaExceededError');
      original.call(this, key, value);
    });
    savePendingSubmission(big('C'));
    expect(loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['C']);
  });

  it('보관은 최근 5건까지', () => {
    for (let i = 0; i < 7; i++) {
      savePendingSubmission({
        sessionId: `s${i}`,
        playerName: 'n',
        replay: { engineVersion: 1, das: 10, arr: 2, frames: 10, inputs: [] },
        score: i,
        savedAt: i,
      });
    }
    expect(loadPendingSubmissions().map((p) => p.sessionId)).toEqual(['s2', 's3', 's4', 's5', 's6']);
  });

  it('저장소 접근이 막혀도 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => recordBestScore(10)).not.toThrow();
    expect(loadBestScore()).toBe(0);
  });
});
