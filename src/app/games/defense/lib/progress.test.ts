// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { bestStars, emptyProgress, isDifficultyUnlocked, isStageUnlocked, loadProgress, recordStars, saveProgress } from './progress';

describe('캠페인 진행 저장 (lib/progress)', () => {
  beforeEach(() => localStorage.clear());

  it('처음에는 S1만 열림 · 어떤 난이도로든 깨면 다음 스테이지 · 어려움은 그 스테이지 보통 클리어 후', () => {
    let p = emptyProgress();
    expect(isStageUnlocked(p, 's1')).toBe(true);
    expect(isStageUnlocked(p, 's2')).toBe(false);
    expect(isDifficultyUnlocked(p, 's1', 'easy')).toBe(true);
    expect(isDifficultyUnlocked(p, 's1', 'hard')).toBe(false);
    p = recordStars(p, 's1', 'easy', 1);
    expect(isStageUnlocked(p, 's2')).toBe(true);
    expect(isDifficultyUnlocked(p, 's1', 'hard')).toBe(false);
    p = recordStars(p, 's1', 'normal', 2);
    expect(isDifficultyUnlocked(p, 's1', 'hard')).toBe(true);
    expect(isDifficultyUnlocked(p, 's2', 'normal')).toBe(true);
    expect(isStageUnlocked(p, 's3')).toBe(false);
    expect(isStageUnlocked(p, 'x')).toBe(false);
  });

  it('별은 오를 때만 바뀐다 · 최고 별은 난이도 중 최댓값', () => {
    let p = recordStars(emptyProgress(), 's1', 'normal', 2);
    const same = recordStars(p, 's1', 'normal', 1);
    expect(same).toBe(p);
    p = recordStars(p, 's1', 'easy', 3);
    expect(bestStars(p, 's1')).toBe(3);
    expect(bestStars(p, 's2')).toBe(0);
  });

  it('저장·읽기 왕복 · 깨진 저장본·다른 버전은 빈 진행', () => {
    const p = recordStars(emptyProgress(), 's1', 'normal', 3);
    expect(saveProgress(p)).toBe(true);
    expect(loadProgress()).toEqual(p);
    localStorage.setItem('defense:progress', '{not json');
    expect(loadProgress()).toEqual(emptyProgress());
    localStorage.setItem('defense:progress', JSON.stringify({ v: 99, stars: {} }));
    expect(loadProgress()).toEqual(emptyProgress());
  });
});
