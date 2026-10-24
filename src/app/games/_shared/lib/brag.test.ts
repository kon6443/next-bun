import { describe, it, expect } from 'vitest';
import { bragLabel } from './brag';

const ALL = ['daily', 'weekly', 'all'] as const;

describe('bragLabel — 등록 결과 자랑 문구 (games-growth B3)', () => {
  it('10위 안이면 넓은 기간부터 — 전체 > 이번 주 > 오늘', () => {
    expect(bragLabel({ ranks: { daily: 1, weekly: 2, all: 3 }, isNewBest: false, periods: ALL })).toBe('전체 3위! 친구에게 자랑하기');
    expect(bragLabel({ ranks: { daily: 2, weekly: 10, all: 11 }, isNewBest: false, periods: ALL })).toBe('이번 주 10위! 친구에게 자랑하기');
    expect(bragLabel({ ranks: { daily: 3, weekly: 11, all: 50 }, isNewBest: true, periods: ALL })).toBe('오늘 3위! 친구에게 자랑하기');
  });

  it('10위 밖이면 개인 최고 갱신일 때만, 아니면 null', () => {
    expect(bragLabel({ ranks: { daily: 11, weekly: 20, all: 99 }, isNewBest: true, periods: ALL })).toBe('개인 최고 갱신! 친구에게 자랑하기');
    expect(bragLabel({ ranks: { daily: 11, weekly: 20, all: 99 }, isNewBest: false, periods: ALL })).toBeNull();
  });

  it('순위 계산 실패(ranks null)는 개인 최고로만 판단한다', () => {
    expect(bragLabel({ ranks: null, isNewBest: true, periods: ALL })).toBe('개인 최고 갱신! 친구에게 자랑하기');
    expect(bragLabel({ ranks: null, isNewBest: false, periods: ALL })).toBeNull();
  });

  it('보이지 않는 기간의 순위로는 자랑하지 않는다 — 0·음수 같은 이상한 순위도 무시', () => {
    expect(bragLabel({ ranks: { daily: 1, weekly: 1, all: 40 }, isNewBest: false, periods: ['all'] })).toBeNull();
    expect(bragLabel({ ranks: { daily: 0, weekly: -1, all: 40 }, isNewBest: false, periods: ALL })).toBeNull();
  });
});
