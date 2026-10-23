import { describe, it, expect } from 'vitest';
import { CAMPAIGN_STAGES, ENEMIES, RANK } from '../engine';
import { BOSS_KINDS, ENEMY_COLORS, ENEMY_MARKS, ENEMY_SCALE, MARK } from '../renderer/palette';
import { BRIEFINGS } from './briefings';
import { ENEMY_NAMES, ENEMY_TRAITS } from './labels';
import { emptyProgress, hasSeenBriefing, markBriefingSeen, markEnemiesMet, markTutorialDone } from './progress';
import { tutorialStep } from './tutorial';

describe('F1b 화면 데이터가 엔진과 맞는다', () => {
  it('적 머리 위 표식 = 엔진 저항(400‰ 이상)·특수 능력 · 보스 종류 = RANK.BOSS · 표 길이 = 적 종류 수', () => {
    ENEMIES.forEach((kind, id) => {
      const expected = (kind.resistPhy >= 400 ? MARK.PHYSICAL : 0) | (kind.resistMag >= 400 ? MARK.MAGIC : 0) | (kind.ability.kind !== 0 ? MARK.SPECIAL : 0);
      expect([id, ENEMY_MARKS[id]]).toEqual([id, expected]);
    });
    expect([...BOSS_KINDS]).toEqual(ENEMIES.flatMap((k, id) => (k.rank === RANK.BOSS ? [id] : [])));
    for (const table of [ENEMY_COLORS, ENEMY_SCALE, ENEMY_MARKS, ENEMY_NAMES, ENEMY_TRAITS]) expect(table).toHaveLength(ENEMIES.length);
  });

  it('브리핑 카드의 새 적은 그 스테이지에서 처음 나오고, 새 타워는 그 스테이지에서 처음 열린다', () => {
    for (const briefing of BRIEFINGS) {
      const index = CAMPAIGN_STAGES.findIndex((s) => s.id === briefing.stageId);
      const enemiesIn = (i: number) => new Set(CAMPAIGN_STAGES[i].waves.flatMap((w) => w.groups.map((g) => g.enemyId)));
      for (const enemy of briefing.enemies) {
        expect([briefing.stageId, enemy, enemiesIn(index).has(enemy)]).toEqual([briefing.stageId, enemy, true]);
        for (let i = 0; i < index; i++) expect([briefing.stageId, enemy, enemiesIn(i).has(enemy)]).toEqual([briefing.stageId, enemy, false]);
      }
      for (const tower of briefing.towers) {
        expect(CAMPAIGN_STAGES[index].towers).toContain(tower);
        expect(CAMPAIGN_STAGES[index - 1].towers).not.toContain(tower);
      }
    }
  });
});

describe('학습·도감 진행 (lib/progress·lib/tutorial)', () => {
  it('튜토리얼·브리핑·만난 적 기록 — 바뀔 것이 없으면 같은 객체', () => {
    const p = emptyProgress();
    const done = markTutorialDone(p);
    expect(done.tutorialDone).toBe(true);
    expect(markTutorialDone(done)).toBe(done);
    const seen = markBriefingSeen(p, 's2');
    expect(hasSeenBriefing(seen, 's2')).toBe(true);
    expect(markBriefingSeen(seen, 's2')).toBe(seen);
    const met = markEnemiesMet(p, [3, 0, 3]);
    expect(met.metEnemies).toEqual([0, 3]);
    expect(markEnemiesMet(met, [0])).toBe(met);
  });

  it('튜토리얼 단계 — 링 열기 → 타워 → 웨이브 시작이면 끝', () => {
    expect(tutorialStep({ ringOpen: false, towers: 0, wavesStarted: 0 })).toBe(0);
    expect(tutorialStep({ ringOpen: true, towers: 0, wavesStarted: 0 })).toBe(1);
    expect(tutorialStep({ ringOpen: false, towers: 1, wavesStarted: 0 })).toBe(2);
    expect(tutorialStep({ ringOpen: true, towers: 2, wavesStarted: 0 })).toBe(2);
    expect(tutorialStep({ ringOpen: false, towers: 1, wavesStarted: 1 })).toBeNull();
  });
});
