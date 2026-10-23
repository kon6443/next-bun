// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { settleCampaign } from './campaignResult';
import { loadLocalReplay } from './localReplay';
import { isStageUnlocked, loadProgress } from './progress';

const game = { stageId: 's1', difficulty: 'normal' as const, boardKey: 's1', seed: 3, engineVersion: 3, victory: true, livesLeft: 19, endTick: 4000, inputs: [0, 0] };

describe('캠페인 판 끝 처리 (lib/campaignResult)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('승리 — 별 계산 · 진행 저장(다음 스테이지 열림) · 다시보기 저장', () => {
    expect(settleCampaign(game, 1)).toEqual({ stars: 3, progressSaved: true, replaySaved: true });
    expect(loadProgress().stars.s1?.normal).toBe(3);
    expect(isStageUnlocked(loadProgress(), 's2')).toBe(true);
    expect(loadLocalReplay('s1')).toMatchObject({ boardKey: 's1', seed: 3, ticks: 4000, inputs: [0, 0], stars: 3, savedAt: 1 });
    // 더 못한 판은 다시보기를 바꾸지 않는다 · 별이 안 올라도 진행은 유효
    expect(settleCampaign({ ...game, livesLeft: 7 })).toEqual({ stars: 2, progressSaved: true, replaySaved: false });
  });

  it('패배 — 아무것도 저장하지 않는다', () => {
    expect(settleCampaign({ ...game, victory: false, livesLeft: 0 })).toEqual({ stars: 0, progressSaved: true, replaySaved: false });
    expect(localStorage.length).toBe(0);
  });

  it('저장소가 막히면 progressSaved=false (화면이 안내)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(settleCampaign(game)).toEqual({ stars: 3, progressSaved: false, replaySaved: false });
  });
});
