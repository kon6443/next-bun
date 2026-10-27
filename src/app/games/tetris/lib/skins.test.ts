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
  backgroundStyle,
  toBoardSkins,
  toEquippedSkins,
  toSkinLevel,
} from './skins';

const HEX = /^#[0-9a-f]{6}$/;
const FIRST_ITEMS = ['default', 'gameboy', 'neon', 'high-contrast'];
/** 이 프론트가 그리는 아이템 — 처음 4종 + skin-levels 새 아이템(투명·초콜릿) */
const ALL_ITEMS = [...FIRST_ITEMS, 'clear', 'chocolate'];
const L1 = { block: 1, effect: 1, board: 1 };

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
  it.each(SKIN_SLOTS)('%s — 아이템 6종(기본·게임보이·네온·고대비·투명·초콜릿)을 그릴 수 있다', (slot) => {
    expect(KNOWN_SKIN_IDS[slot]).toEqual(ALL_ITEMS);
    for (const id of ALL_ITEMS) expect(SKIN_ITEM_LABELS[id]).toBeTruthy();
  });

  it.each(ALL_ITEMS)('%s — 블록 9칸·레벨 10단계·콤보 5단계, 계산에 쓰는 색은 #rrggbb', (id) => {
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
    const backgrounds = ALL_ITEMS.map((id) => backgroundSkin(id).background);
    expect(new Set(backgrounds).size).toBe(ALL_ITEMS.length);
    for (const id of ALL_ITEMS.filter((x) => x !== 'default')) {
      // 단색 한 가지(기본처럼)가 아니라 그라데이션·패턴이 있어야 바탕이 바뀐 것이 보인다
      expect(backgroundSkin(id).background).toMatch(/gradient\(/);
    }
  });

  it('블록 무늬는 한 색 계열(게임보이·투명·초콜릿 — 명도·무늬로 가른다)이거나 색각 친화(고대비)일 때만', () => {
    expect(ALL_ITEMS.filter((id) => blockSkin(id).patterns)).toEqual(['gameboy', 'high-contrast', 'clear', 'chocolate']);
    expect(ALL_ITEMS.filter((id) => blockSkin(id).mono)).toEqual(['gameboy', 'clear', 'chocolate']);
  });

  it('한 색 계열(D-003) — 투명은 무채색, 초콜릿은 갈색(빨강 > 초록 > 파랑)만, 블록 7종의 밝기는 서로 다르다', () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const lum = ([r, g, b]: number[]) => 0.299 * r + 0.587 * g + 0.114 * b;
    for (const color of blockSkin('clear').cells.slice(1)) {
      const [r, g, b] = rgb(color);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(30);
    }
    for (const color of blockSkin('chocolate').cells.slice(1)) {
      const [r, g, b] = rgb(color);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    }
    for (const id of ['clear', 'chocolate']) {
      const pieces = blockSkin(id).cells.slice(1, 8).map((c) => Math.round(lum(rgb(c))));
      expect(new Set(pieces).size).toBe(7);
    }
  });

  it('블록 스킨 번호는 겹치지 않고, 모르는 id는 기본과 같은 번호(같은 그림 → 같은 캐시)', () => {
    expect(new Set(ALL_ITEMS.map(blockSkinIndex)).size).toBe(BLOCK_SKIN_COUNT);
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
    expect(toBoardSkins({ block: 'neon', effect: 3, board: '' })).toEqual({ block: 'neon', effect: 'default', board: 'default', levels: L1 });
  });

  it('보드 슬롯에는 background를 넣지 않는다(배경은 보는 사람 자신의 것)', () => {
    expect(toBoardSkins({ block: 'neon', effect: 'neon', board: 'neon', background: 'neon' })).toEqual({ block: 'neon', effect: 'neon', board: 'neon', levels: L1 });
    expect(toEquippedSkins({ block: 'neon', background: 'gameboy' })).toEqual({ block: 'neon', effect: 'default', board: 'default', background: 'gameboy' });
  });
});

describe('스킨 레벨 (skin-levels)', () => {
  it('서버 레벨은 1~5 정수만 — 없음·범위 밖·소수·문자열은 1(레벨 이전 기록·배포 순서)', () => {
    expect([1, 2, 5].map(toSkinLevel)).toEqual([1, 2, 5]);
    for (const value of [undefined, null, 0, 6, 2.5, '3', NaN]) expect(toSkinLevel(value)).toBe(1);
  });

  it('보드 skins.levels — 슬롯별로 읽고, 없으면 모두 1', () => {
    expect(toBoardSkins({ block: 'neon', levels: { block: 3, effect: 9, board: 5 } }).levels).toEqual({ block: 3, effect: 1, board: 5 });
    expect(toBoardSkins({ block: 'neon' }).levels).toEqual(L1);
  });

  it('배경 레벨 레이어 — Lv1은 테마 바탕 그대로, 오를수록 레이어가 늘고 테마 바탕은 맨 아래', () => {
    expect(backgroundStyle('default', 1)).toBe('#020617');
    const layers = [2, 3, 4, 5].map((level) => backgroundStyle('chocolate', level));
    for (const style of layers) expect(style.endsWith(backgroundSkin('chocolate').background)).toBe(true);
    expect(layers[1].length).toBeGreaterThan(layers[0].length);
    expect(layers[2].length).toBeGreaterThan(layers[1].length);
  });

  it('새 아이템 — 투명은 비치는 유리 블록·판(대신 격자를 진하게), 초콜릿은 홈 질감', () => {
    expect(blockSkin('clear').finish).toBe('glass');
    expect(boardSkin('clear').opacity).toBeLessThan(0.92);
    expect(blockSkin('chocolate').finish).toBe('chocolate');
    // 기본 판 격자보다 진하다 — 비치는 판에서도 칸이 읽힌다
    const alpha = (rgba: string) => Number(rgba.match(/([\d.]+)\)$/)![1]);
    expect(alpha(boardSkin('clear').grid)).toBeGreaterThan(alpha(boardSkin('default').grid));
  });
});
