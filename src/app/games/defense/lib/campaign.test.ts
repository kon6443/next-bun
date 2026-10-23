import { describe, it, expect } from 'vitest';
import { CAMPAIGN_STAGES, findStage } from '../engine';
import { CAMPAIGN, DIFFICULTIES, boardKeyOf, parseBoardKey, playPath, starsFor } from './campaign';

describe('캠페인 화면 정보 (lib/campaign)', () => {
  it('허브·스테이지 화면 정보가 엔진 캠페인 데이터와 같다 (웨이브 수·시작 골드·타워·업그레이드 상한)', () => {
    expect(CAMPAIGN.map((s) => s.id)).toEqual(CAMPAIGN_STAGES.map((s) => s.id));
    CAMPAIGN.forEach((meta, i) => {
      const stage = CAMPAIGN_STAGES[i];
      expect([meta.waves, meta.startGold, meta.maxLevel, [...meta.towers]]).toEqual([stage.waves.length, stage.startGold, stage.maxLevel, [...stage.towers]]);
      expect(meta.number).toBe(i + 1);
    });
  });

  it('보드 키 왕복 — 보통은 접미사 없음, 엔진 findStage가 모두 찾는다', () => {
    for (const meta of CAMPAIGN) {
      for (const difficulty of DIFFICULTIES) {
        const key = boardKeyOf(meta.id, difficulty);
        expect(parseBoardKey(key)).toEqual({ stage: meta, difficulty });
        expect(findStage(key)?.id).toBe(key);
        expect(playPath(meta.id, difficulty)).toBe(`/games/defense/play/stage/${key}`);
      }
    }
    expect(boardKeyOf('s1', 'normal')).toBe('s1');
    for (const bad of ['s0', 's9', 's1-normal', 'S1', 'e1', 'endless-s1', 's1-easy-x', '']) expect(parseBoardKey(bad)).toBeNull();
  });

  it('별점 — 18 이상 ★3 · 6 이상 ★2 · 1 이상 ★1 · 0은 0 (§L5)', () => {
    expect([20, 18, 17, 6, 5, 1, 0].map(starsFor)).toEqual([3, 3, 2, 2, 1, 1, 0]);
  });
});
