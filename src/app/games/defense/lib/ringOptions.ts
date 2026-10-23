import {
  FLAG,
  OP,
  TARGET_MODE_COUNT,
  TOWERS,
  type GameState,
  type Stage,
  branchCost,
  buildCost,
  hasFlag,
  maxLevel,
  sellRefund,
  slotAvailable,
  towerAllowed,
  towerStage,
  upgradeCost,
} from '../engine';
import { TARGET_NAMES, TOWER_NAMES, TOWER_ROLES } from './labels';
import { type MatchHint, matchHint, nextWaveIndex } from './wavePreview';

/**
 * 링 메뉴 항목 (§F3) — 슬롯 상태에서 할 수 있는 명령만 만든다. enabled=false는 회색(골드 부족)이고 엔진에 보내지 않는다(§F0-2)
 * 2탭 확정: confirm=true 항목은 첫 탭 미리보기 → 같은 항목 다시 탭에 명령(지금은 모든 항목 — confirm=false는 바로 실행하는 항목용)
 */

export type RingOption = {
  /** 2탭 판정·data-testid 키 — 'build-0' · 'upgrade' · 'branch-1' · 'sell' · 'target' */
  id: string;
  label: string;
  /** 비용(+) 또는 환급(−) 표시 — 없으면 null */
  price: { kind: 'cost' | 'refund'; amount: number } | null;
  enabled: boolean;
  confirm: boolean;
  op: number;
  a: number;
  b: number;
  /** 미리보기 설명 한 줄 */
  detail: string;
  /** 미리보기 사거리 (밀리타일, 0 = 표시 안 함) */
  range: number;
  hint: MatchHint | null;
  /** 데스크톱 단축키 (§F3) */
  shortcut: string;
};

export type SlotInfo = { x: number; y: number; tower: { kind: number; level: number; branch: number; targetMode: number } | null };

export function slotInfo(state: GameState, stage: Stage, slot: number): SlotInfo | null {
  const spot = stage.map.slots[slot];
  if (!spot) return null;
  const tower = state.towers.find((t) => t.slot === slot) ?? null;
  return { x: spot.x, y: spot.y, tower: tower && { kind: tower.kind, level: tower.level, branch: tower.branch, targetMode: tower.targetMode } };
}

const SECONDS = 30;
const perSecond = (periodTicks: number) => (periodTicks > 0 ? Math.round((SECONDS / periodTicks) * 10) / 10 : 0);

export function ringOptions(state: GameState, stage: Stage, slot: number): RingOption[] {
  const info = slotInfo(state, stage, slot);
  if (!info || state.over) return [];
  const next = nextWaveIndex(state, stage);
  const options: RingOption[] = [];

  if (!info.tower) {
    if (!slotAvailable(state, stage, slot)) return [];
    stage.towers.forEach((kind, i) => {
      if (!towerAllowed(state, stage, kind)) return;
      const cost = buildCost(state, kind);
      const lv1 = towerStage(TOWERS[kind], 1, 0);
      options.push({
        id: `build-${kind}`,
        label: TOWER_NAMES[kind],
        price: { kind: 'cost', amount: cost },
        enabled: state.gold >= cost,
        confirm: true,
        op: OP.BUILD,
        a: slot,
        b: kind,
        detail: `${TOWER_ROLES[kind]} · 피해 ${lv1.damage} · 초당 ${perSecond(lv1.periodTicks)}회`,
        range: lv1.range,
        hint: next === null ? null : matchHint(stage, next, lv1, TOWERS[kind].damageType),
        shortcut: String(i + 1),
      });
    });
    return options;
  }

  const { kind, level, branch, targetMode } = info.tower;
  const cap = maxLevel(state, stage);
  const upgrade = upgradeCost(state, slot);
  if (upgrade > 0) {
    const nextStage = towerStage(TOWERS[kind], level + 1, branch);
    options.push({
      id: 'upgrade',
      label: level === 4 ? '궁극' : `Lv${level + 1}`,
      price: { kind: 'cost', amount: upgrade },
      enabled: state.gold >= upgrade,
      confirm: true,
      op: OP.UPGRADE,
      a: slot,
      b: 0,
      detail: `${TOWER_NAMES[kind]} Lv${level} → Lv${level + 1} · 피해 ${nextStage.damage} · 사거리 ${(nextStage.range / 1000).toFixed(1)}칸`,
      range: nextStage.range,
      hint: null,
      shortcut: 'U',
    });
  }
  if (level === 3 && cap >= 4) {
    for (const b of [0, 1]) {
      const cost = branchCost(state, slot, b);
      if (cost === 0) continue;
      const lv4 = towerStage(TOWERS[kind], 4, b + 1);
      options.push({
        id: `branch-${b}`,
        label: b === 0 ? '분기 A' : '분기 B',
        price: { kind: 'cost', amount: cost },
        enabled: state.gold >= cost,
        confirm: true,
        op: OP.BRANCH,
        a: slot,
        b,
        detail: `되돌릴 수 없어요 · 피해 ${lv4.damage} · 초당 ${perSecond(lv4.periodTicks)}회 · 사거리 ${(lv4.range / 1000).toFixed(1)}칸`,
        range: lv4.range,
        hint: null,
        shortcut: b === 0 ? 'A' : 'B',
      });
    }
  }
  const refund = sellRefund(state, slot);
  options.push({
    id: 'sell',
    label: '판매',
    price: { kind: 'refund', amount: refund },
    // 판매 금지 규칙(주간 R — FLAG.NO_SELL)이면 엔진이 거부한다 — 미리 막는다
    enabled: !hasFlag(state.effects, FLAG.NO_SELL),
    confirm: true,
    op: OP.SELL,
    a: slot,
    b: 0,
    detail: `${refund}골드를 돌려받아요`,
    range: 0,
    hint: null,
    shortcut: 'S',
  });
  const nextMode = (targetMode + 1) % TARGET_MODE_COUNT;
  options.push({
    id: 'target',
    label: `표적 ${TARGET_NAMES[targetMode]}`,
    price: null,
    enabled: true,
    // 링이 이웃 슬롯을 덮을 수 있다 — 잘못 누른 탭이 바로 명령이 되지 않게 타게팅도 2탭
    confirm: true,
    op: OP.SET_TARGET,
    a: slot,
    b: nextMode,
    detail: `${TARGET_NAMES[nextMode]}(으)로 바꿔요`,
    range: 0,
    hint: null,
    shortcut: 'T',
  });
  return options;
}

/**
 * 2탭 판정 — 비활성은 무시, 확정이 필요 없거나(타게팅) 이미 미리보기 중인 항목이면 명령, 아니면 미리보기로
 * 반환: 다음 armed와 보낼 명령(없으면 null)
 */
export function tapRing(armed: string | null, option: RingOption): { armed: string | null; command: RingOption | null } {
  if (!option.enabled) return { armed, command: null };
  if (!option.confirm || armed === option.id) return { armed: null, command: option };
  return { armed: option.id, command: null };
}

/** 선택된 슬롯의 현재 사거리 (타워가 있으면 그 단계 사거리) */
export function currentRange(state: GameState, slot: number): number {
  const tower = state.towers.find((t) => t.slot === slot);
  return tower ? towerStage(TOWERS[tower.kind], tower.level, tower.branch).range : 0;
}
