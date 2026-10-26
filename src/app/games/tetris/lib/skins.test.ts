import { describe, expect, it } from 'vitest';
import { CELL_COLORS } from './blockSprites';
import { levelNeon } from './effectsRenderer';
import {
  BLOCK_SKIN_COUNT,
  DEFAULT_BOARD_SKINS,
  KNOWN_SKIN_IDS,
  SKIN_ITEM_LABELS,
  SKIN_SLOTS,
  backgroundSkin,
  blockSkin,
  blockSkinIndex,
  boardSkin,
  effectSkin,
  toBoardSkins,
  toEquippedSkins,
} from './skins';

const HEX = /^#[0-9a-f]{6}$/;
const FIRST_ITEMS = ['default', 'gameboy', 'neon', 'high-contrast'];

describe('테트리스 스킨 — 기본은 스킨 도입 전과 같다(시각 회귀 0)', () => {
  // 아래 값은 스킨 도입 전(blockSprites·effectsRenderer·renderer·MiniBoard·GameSurface)에 하드코딩돼 있던 그대로
  it('block', () => {
    expect(blockSkin('default')).toEqual({
      cells: ['#000000', '#22d3ee', '#3b82f6', '#f97316', '#facc15', '#22c55e', '#a855f7', '#ef4444', '#64748b'],
      patterns: false,
    });
    expect(CELL_COLORS).toBe(blockSkin('default').cells);
  });

  it('effect', () => {
    expect(effectSkin('default')).toEqual({
      tierColors: ['#e2e8f0', '#7dd3fc', '#c4b5fd', '#fcd34d', '#fb7185'],
      ring: { normal: '#a5f3fc', big: '#fde68a' },
      flashGlow: [186, 230, 253],
    });
  });

  it('board', () => {
    expect(boardSkin('default')).toEqual({
      levelTints: [
        [15, 23, 42],
        [16, 30, 78],
        [36, 22, 82],
        [58, 18, 74],
        [70, 16, 52],
        [72, 22, 30],
        [66, 38, 16],
        [40, 52, 18],
        [14, 56, 40],
        [12, 48, 70],
      ],
      levelNeon: ['#38bdf8', '#60a5fa', '#a78bfa', '#e879f9', '#f472b6', '#fb7185', '#fb923c', '#a3e635', '#34d399', '#22d3ee'],
      grid: 'rgba(148, 163, 184, 0.08)',
      label: 'rgba(148, 163, 184, 0.9)',
      gauge: { track: 'rgba(15, 23, 42, 0.9)', pending: '#94a3b8', active: '#ef4444' },
      miniBoard: 'rgba(15, 23, 42, 0.95)',
    });
  });

  it('background — Tailwind bg-slate-950', () => {
    expect(backgroundSkin('default')).toEqual({ background: '#020617' });
  });
});

describe('테트리스 스킨 레지스트리', () => {
  it.each(SKIN_SLOTS)('%s — 처음 아이템 4종(기본·게임보이·네온·고대비)을 그릴 수 있다', (slot) => {
    expect(KNOWN_SKIN_IDS[slot]).toEqual(FIRST_ITEMS);
    for (const id of FIRST_ITEMS) expect(SKIN_ITEM_LABELS[id]).toBeTruthy();
  });

  it.each(FIRST_ITEMS)('%s — 블록 9칸·레벨 10단계·콤보 5단계, 계산에 쓰는 색은 #rrggbb', (id) => {
    expect(blockSkin(id).cells).toHaveLength(9);
    for (const color of blockSkin(id).cells) expect(color).toMatch(HEX);
    expect(boardSkin(id).levelTints).toHaveLength(10);
    expect(boardSkin(id).levelNeon).toHaveLength(10);
    expect(effectSkin(id).tierColors).toHaveLength(5);
    for (const color of effectSkin(id).tierColors) expect(color).toMatch(HEX);
  });

  it('모르는 id·없음은 기본으로 그린다 — 서버가 아이템을 먼저 늘려도 안 깨진다', () => {
    for (const id of ['retro-2027', '', undefined, null, 'constructor', '__proto__']) {
      expect(blockSkin(id)).toBe(blockSkin('default'));
      expect(effectSkin(id)).toBe(effectSkin('default'));
      expect(boardSkin(id)).toBe(boardSkin('default'));
      expect(backgroundSkin(id)).toBe(backgroundSkin('default'));
    }
  });

  it('배경은 기본과 한눈에 구분된다 — 기본이 아닌 배경은 기본 단색이 아니고 서로도 다르다', () => {
    const backgrounds = FIRST_ITEMS.map((id) => backgroundSkin(id).background);
    expect(new Set(backgrounds).size).toBe(FIRST_ITEMS.length);
    for (const id of FIRST_ITEMS.filter((x) => x !== 'default')) {
      // 단색 한 가지(기본처럼)가 아니라 그라데이션·패턴이 있어야 바탕이 바뀐 것이 보인다
      expect(backgroundSkin(id).background).toMatch(/gradient\(/);
    }
  });

  it('블록 무늬는 같은 톤이 겹치거나(게임보이) 색각 친화(고대비)일 때만', () => {
    expect(FIRST_ITEMS.filter((id) => blockSkin(id).patterns)).toEqual(['gameboy', 'high-contrast']);
  });

  it('블록 스킨 번호는 겹치지 않고, 모르는 id는 기본과 같은 번호(같은 그림 → 같은 캐시)', () => {
    expect(new Set(FIRST_ITEMS.map(blockSkinIndex)).size).toBe(BLOCK_SKIN_COUNT);
    expect(blockSkinIndex('retro-2027')).toBe(blockSkinIndex('default'));
  });

  it('레벨 네온은 보드 스킨을 따른다 — 생략하면 기본', () => {
    expect(levelNeon(1)).toBe('#38bdf8');
    expect(levelNeon(11)).toBe('#38bdf8');
    expect(levelNeon(1, boardSkin('gameboy'))).toBe('#8bac0f');
  });
});

describe('서버 skins 값 정규화', () => {
  it('빈 값·필드 누락·문자열 아님은 슬롯별 기본 (배포 순서·익명 기록)', () => {
    expect(toBoardSkins(undefined)).toEqual(DEFAULT_BOARD_SKINS);
    expect(toBoardSkins(null)).toEqual(DEFAULT_BOARD_SKINS);
    expect(toBoardSkins({ block: 'neon', effect: 3, board: '' })).toEqual({ block: 'neon', effect: 'default', board: 'default' });
  });

  it('보드 슬롯에는 background를 넣지 않는다(배경은 보는 사람 자신의 것)', () => {
    expect(toBoardSkins({ block: 'neon', effect: 'neon', board: 'neon', background: 'neon' })).toEqual({ block: 'neon', effect: 'neon', board: 'neon' });
    expect(toEquippedSkins({ block: 'neon', background: 'gameboy' })).toEqual({ block: 'neon', effect: 'default', board: 'default', background: 'gameboy' });
  });
});
