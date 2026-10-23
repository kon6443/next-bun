// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { defenseStatLine, formatDefenseScore, loadBest, loadBests, recordBest, splitDefenseScore } from './defenseGame';

describe('defenseGame — 보드별 최고 점수·랭킹 요약', () => {
  beforeEach(() => localStorage.clear());

  it('보드마다 따로, 더 높을 때만 새 최고', () => {
    expect(recordBest('endless-s1', 5_000_000)).toBe(true);
    expect(recordBest('endless-s1', 4_000_000)).toBe(false);
    expect(recordBest('weekly-2026-w43', 1_000_000)).toBe(true);
    expect([loadBest('endless-s1'), loadBest('weekly-2026-w43'), loadBest('weekly-2026-w44')]).toEqual([5_000_000, 1_000_000, 0]);
  });

  it('주간은 최근 8주만 남긴다(무한 시즌은 그대로)', () => {
    recordBest('endless-s1', 1);
    for (let w = 30; w <= 40; w++) recordBest(`weekly-2026-w${w}`, w);
    const keys = Object.keys(loadBests()).sort();
    expect(keys).toEqual(['endless-s1', ...Array.from({ length: 8 }, (_, i) => `weekly-2026-w${33 + i}`)]);
  });

  it('손상된 저장본은 비운 것으로', () => {
    localStorage.setItem('defense:best', '{"v":9,"boards":{"endless-s1":5}}');
    expect(loadBests()).toEqual({});
  });

  it('점수 표기 — 웨이브 n · 진척 p%(‰ 내림)', () => {
    expect(splitDefenseScore(24_523_000)).toEqual({ wave: 24, progress: 523 });
    expect(formatDefenseScore(24_523_000)).toBe('웨이브 24 · 진척 52%');
    expect(formatDefenseScore(0)).toBe('웨이브 0 · 진척 0%');
    expect(formatDefenseScore(1_999_000)).toBe('웨이브 1 · 진척 99%');
  });

  it('랭킹 행 요약 — 처치·시간(웨이브는 점수 칸)', () => {
    expect(defenseStatLine({ wave: 24, kills: 812 }, 1_880_000)).toBe('처치 812 · 31:20');
    expect(defenseStatLine({}, 0)).toBe('0:00');
  });
});
