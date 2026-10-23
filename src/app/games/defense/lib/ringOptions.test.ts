import { describe, it, expect } from 'vitest';
import { OP, TOWER_ID, applyCommand, buildCost, createGame, findStage } from '../engine';
import { ringOptions, tapRing } from './ringOptions';

const stage = findStage('s1')!;

describe('링 메뉴 항목 (lib/ringOptions)', () => {
  it('빈 슬롯 — 그 스테이지에서 쓸 수 있는 타워만, 비용 = buildCost, 골드가 모자라면 비활성', () => {
    const state = createGame(stage, 1);
    const options = ringOptions(state, stage, 0);
    expect(options.map((o) => o.id)).toEqual(['build-0', 'build-1']);
    for (const o of options) {
      expect(o.price).toEqual({ kind: 'cost', amount: buildCost(state, o.b) });
      expect([o.op, o.a, o.confirm, o.enabled]).toEqual([OP.BUILD, 0, true, true]);
      expect(o.range).toBeGreaterThan(0);
    }
    state.gold = 0;
    expect(ringOptions(state, stage, 0).every((o) => !o.enabled)).toBe(true);
  });

  it('타워 슬롯 — 업그레이드·판매·타게팅. S1은 Lv3 상한이라 Lv3에서 업그레이드·분기가 없다', () => {
    const state = createGame(stage, 1);
    state.gold = 10000;
    expect(applyCommand(state, OP.BUILD, 2, TOWER_ID.ARCHER)).toBe(true);
    expect(ringOptions(state, stage, 2).map((o) => o.id)).toEqual(['upgrade', 'sell', 'target']);
    applyCommand(state, OP.UPGRADE, 2);
    applyCommand(state, OP.UPGRADE, 2);
    const lv3 = ringOptions(state, stage, 2);
    expect(lv3.map((o) => o.id)).toEqual(['sell', 'target']);
    const target = lv3.find((o) => o.id === 'target')!;
    // 링이 이웃 슬롯을 덮을 수 있어 타게팅도 2탭
    expect([target.op, target.b, target.confirm]).toEqual([OP.SET_TARGET, 1, true]);
  });

  it('S2(Lv4 상한) Lv3 타워 — 분기 A·B(되돌릴 수 없음 경고), 업그레이드 대신', () => {
    const s2 = findStage('s2')!;
    const state = createGame(s2, 1);
    state.gold = 10000;
    applyCommand(state, OP.BUILD, 0, TOWER_ID.ARCHER);
    applyCommand(state, OP.UPGRADE, 0);
    applyCommand(state, OP.UPGRADE, 0);
    const options = ringOptions(state, s2, 0);
    expect(options.map((o) => o.id)).toEqual(['branch-0', 'branch-1', 'sell', 'target']);
    expect(options[0].detail).toContain('되돌릴 수 없어요');
  });

  it('없는 슬롯·끝난 판은 빈 목록', () => {
    const state = createGame(stage, 1);
    expect(ringOptions(state, stage, 99)).toEqual([]);
    state.over = true;
    expect(ringOptions(state, stage, 0)).toEqual([]);
  });

  it('2탭 확정 — 첫 탭 미리보기, 같은 항목 다시 탭에 명령, 다른 항목 탭은 미리보기 이동, 비활성 무시, 타게팅은 바로', () => {
    const state = createGame(stage, 1);
    const [archer, cannon] = ringOptions(state, stage, 0);
    expect(tapRing(null, archer)).toEqual({ armed: 'build-0', command: null });
    expect(tapRing('build-0', cannon)).toEqual({ armed: 'build-1', command: null });
    expect(tapRing('build-1', cannon)).toEqual({ armed: null, command: cannon });
    expect(tapRing('build-0', { ...archer, enabled: false })).toEqual({ armed: 'build-0', command: null });
    const target = { ...archer, id: 'target', confirm: false };
    expect(tapRing(null, target)).toEqual({ armed: null, command: target });
  });
});
