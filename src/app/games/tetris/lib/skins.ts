/**
 * 테트리스 스킨 — 슬롯 4개를 따로 장착한다(D-003, 섞어 쓰기)
 * - block: 블록 7종·가비지·고스트·HOLD/NEXT 미리보기
 * - effect: 줄 삭제 충격파·번쩍임·콤보 문구 등 연출 색 (잔상·조각은 그 블록의 색 — block 슬롯)
 * - board: 판 배경·격자·레벨 색조·테두리 네온·배경 별·라벨·가비지 게이지·대전 미니 보드 바탕
 * - background: 게임 화면 바탕(GameSurface, DOM) — 늘 보는 사람 자신의 것
 * 보드 슬롯(block·effect·board)은 보드 주인의 것으로 그린다(내 판 = 내 장착, 상대·리플레이 = 그 기록 주인의 장착)
 * 카탈로그(id·획득 방식·보유)는 서버가 SSOT — 여기는 id → 시각 자료만. 모르는 id는 default로 그린다(서버가 아이템을 먼저 늘려도 안 깨지게)
 * default는 스킨 도입 전 상수와 같은 값이다(skins.test.ts가 고정) — 바꾸면 기본 화면이 바뀐다
 */

export const SKIN_SLOTS = ['block', 'effect', 'board', 'background'] as const;
export type SkinSlot = (typeof SKIN_SLOTS)[number];

/** 보드 하나를 그리는 데 쓰는 슬롯 — 서버 players[].skins·리플레이 skins와 같은 모양 */
export type BoardSkins = { block: string; effect: string; board: string };
export type EquippedSkins = BoardSkins & { background: string };

export const DEFAULT_SKIN_ID = 'default';
export const DEFAULT_BOARD_SKINS: BoardSkins = { block: DEFAULT_SKIN_ID, effect: DEFAULT_SKIN_ID, board: DEFAULT_SKIN_ID };
export const DEFAULT_EQUIPPED_SKINS: EquippedSkins = { ...DEFAULT_BOARD_SKINS, background: DEFAULT_SKIN_ID };

type Rgb = readonly [number, number, number];

export type BlockSkin = {
  /** 칸 값(0 빈칸 · 1~7 블록 I J L O S T Z · 8 가비지) → 색. 스프라이트가 밝기를 계산하므로 #rrggbb만 */
  cells: readonly string[];
  /** 블록마다 다른 무늬 — 색만으로 블록을 가르기 어려울 때(고대비·게임보이) */
  patterns: boolean;
};

export type EffectSkin = {
  /** 콤보 단계별 문구 색 — 0(기본) ~ 4. 띠 그라데이션에 알파를 붙이므로 #rrggbb만 */
  tierColors: readonly string[];
  /** 줄 삭제 충격파 — 보통 · 큰 삭제 */
  ring: { normal: string; big: string };
  /** 줄 삭제 번쩍임 — 번지는 빛(알파는 그릴 때) */
  flashGlow: Rgb;
};

export type BoardSkin = {
  /** 레벨별 판 배경 — 10레벨 주기 */
  levelTints: readonly Rgb[];
  /** 레벨별 네온(판 테두리·배경 별·레벨업 빛살) — levelTints와 같은 주기 */
  levelNeon: readonly string[];
  grid: string;
  /** HOLD·NEXT·COMBO 라벨 */
  label: string;
  /** 대전 가비지 게이지 — 바탕 · 대기 줄 · 곧 들어올 줄 */
  gauge: { track: string; pending: string; active: string };
  /** 대전 상대 미니 보드 바탕 */
  miniBoard: string;
};

export type BackgroundSkin = {
  /** 게임 화면 바탕(CSS background) */
  background: string;
};

/** 슬롯별 아이템 이름 — 카탈로그에 있어도 여기에 없으면 id를 그대로 보인다 */
export const SKIN_ITEM_LABELS: Record<string, string> = {
  default: '기본',
  gameboy: '게임보이',
  neon: '네온',
  'high-contrast': '고대비',
};

export const SKIN_SLOT_LABELS: Record<SkinSlot, string> = {
  block: '블록',
  effect: '연출',
  board: '보드',
  background: '배경',
};

// ==================== block ====================

const GB = { darkest: '#0f380f', dark: '#306230', light: '#8bac0f', lightest: '#9bbc0f' } as const;

const BLOCK_SKINS: Record<string, BlockSkin> = {
  default: {
    cells: ['#000000', '#22d3ee', '#3b82f6', '#f97316', '#facc15', '#22c55e', '#a855f7', '#ef4444', '#64748b'],
    patterns: false,
  },
  // 게임보이 4톤 — 밝은 두 톤을 번갈아(어두운 판 위에서 보이게), 가비지는 어두운 톤. 같은 톤이 겹치는 블록은 무늬로 가른다
  gameboy: {
    cells: ['#000000', GB.lightest, GB.light, GB.lightest, GB.light, GB.lightest, GB.light, GB.lightest, GB.dark],
    patterns: true,
  },
  neon: {
    cells: ['#000000', '#00f0ff', '#3d5afe', '#ff9100', '#ffea00', '#00e676', '#d500f9', '#ff1744', '#546e7a'],
    patterns: false,
  },
  // Okabe-Ito 색각 친화 팔레트(밝기 차가 크다) + 블록마다 무늬
  'high-contrast': {
    cells: ['#000000', '#56b4e9', '#0072b2', '#e69f00', '#f0e442', '#009e73', '#cc79a7', '#d55e00', '#9ca3af'],
    patterns: true,
  },
};

// ==================== effect ====================

const EFFECT_SKINS: Record<string, EffectSkin> = {
  default: { tierColors: ['#e2e8f0', '#7dd3fc', '#c4b5fd', '#fcd34d', '#fb7185'], ring: { normal: '#a5f3fc', big: '#fde68a' }, flashGlow: [186, 230, 253] },
  gameboy: { tierColors: [GB.lightest, GB.light, GB.lightest, GB.light, GB.lightest], ring: { normal: GB.light, big: GB.lightest }, flashGlow: [155, 188, 15] },
  neon: { tierColors: ['#f8fafc', '#00f0ff', '#d500f9', '#ffea00', '#ff1744'], ring: { normal: '#00f0ff', big: '#ffea00' }, flashGlow: [0, 240, 255] },
  'high-contrast': { tierColors: ['#ffffff', '#56b4e9', '#f0e442', '#e69f00', '#ffffff'], ring: { normal: '#ffffff', big: '#f0e442' }, flashGlow: [255, 255, 255] },
};

// ==================== board ====================

const repeat10 = <T>(value: T): T[] => Array.from({ length: 10 }, () => value);

const BOARD_SKINS: Record<string, BoardSkin> = {
  default: {
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
  },
  gameboy: {
    levelTints: repeat10<Rgb>([15, 56, 15]),
    levelNeon: repeat10(GB.light),
    grid: 'rgba(139, 172, 15, 0.1)',
    label: 'rgba(155, 188, 15, 0.9)',
    gauge: { track: 'rgba(15, 56, 15, 0.9)', pending: GB.dark, active: GB.lightest },
    miniBoard: 'rgba(15, 56, 15, 0.95)',
  },
  neon: {
    levelTints: [
      [6, 6, 18],
      [8, 6, 26],
      [14, 4, 28],
      [20, 4, 24],
      [24, 4, 16],
      [22, 6, 8],
      [18, 12, 4],
      [8, 18, 6],
      [4, 18, 14],
      [4, 14, 24],
    ],
    levelNeon: ['#00f0ff', '#3d5afe', '#d500f9', '#ff00c8', '#ff1744', '#ff9100', '#ffea00', '#76ff03', '#00e676', '#00f0ff'],
    grid: 'rgba(0, 240, 255, 0.07)',
    label: 'rgba(0, 240, 255, 0.85)',
    gauge: { track: 'rgba(6, 6, 18, 0.9)', pending: '#546e7a', active: '#ff1744' },
    miniBoard: 'rgba(6, 6, 18, 0.95)',
  },
  'high-contrast': {
    levelTints: repeat10<Rgb>([0, 0, 0]),
    levelNeon: repeat10('#ffffff'),
    grid: 'rgba(255, 255, 255, 0.18)',
    label: 'rgba(255, 255, 255, 0.95)',
    gauge: { track: 'rgba(0, 0, 0, 0.9)', pending: '#9ca3af', active: '#f0e442' },
    miniBoard: 'rgba(0, 0, 0, 0.95)',
  },
};

// ==================== background ====================

const BACKGROUND_SKINS: Record<string, BackgroundSkin> = {
  /** Tailwind bg-slate-950과 같은 색 */
  default: { background: '#020617' },
  gameboy: { background: 'radial-gradient(circle at 50% 30%, #1d4a1d 0%, #0f380f 70%)' },
  // 보라 중심 + 하단 시안 글로우 — 기본(#020617)과 나란히 놓아도 한눈에 구분되게
  neon: {
    background: 'radial-gradient(circle at 50% 110%, rgba(0, 240, 255, 0.22), transparent 55%), radial-gradient(circle at 50% 15%, #3b0a5c 0%, #12021f 55%, #05010d 100%)',
  },
  // 검은 바탕 + 아주 옅은 흰 격자 — 판 밖이 바뀐 것이 보이고, 판 안은 판 배경(레벨 색조 92% 불투명)이 덮어 가독성에 영향이 거의 없다
  'high-contrast': {
    background:
      'linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px) 0 0 / 24px 24px, #000000',
  },
};

// ==================== 조회 ====================

const lookup = <T>(registry: Record<string, T>, id: string | null | undefined): T =>
  (id && Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : undefined) ?? registry[DEFAULT_SKIN_ID];

export const blockSkin = (id?: string | null): BlockSkin => lookup(BLOCK_SKINS, id);
export const effectSkin = (id?: string | null): EffectSkin => lookup(EFFECT_SKINS, id);
export const boardSkin = (id?: string | null): BoardSkin => lookup(BOARD_SKINS, id);
export const backgroundSkin = (id?: string | null): BackgroundSkin => lookup(BACKGROUND_SKINS, id);

/** 이 프론트가 그릴 줄 아는 아이템 id(슬롯별) — 카탈로그에 있지만 여기 없으면 default로 그린다 */
export const KNOWN_SKIN_IDS: Record<SkinSlot, readonly string[]> = {
  block: Object.keys(BLOCK_SKINS),
  effect: Object.keys(EFFECT_SKINS),
  board: Object.keys(BOARD_SKINS),
  background: Object.keys(BACKGROUND_SKINS),
};

/** 블록 스프라이트 캐시 키용 번호 — 모르는 id는 default(0)와 같은 그림이라 같은 번호 */
export function blockSkinIndex(id: string): number {
  const index = KNOWN_SKIN_IDS.block.indexOf(id);
  return index < 0 ? 0 : index;
}

export const BLOCK_SKIN_COUNT = KNOWN_SKIN_IDS.block.length;

/** 서버 응답의 skins 객체 → 보드 슬롯. 없거나 문자열이 아닌 칸은 default (배포 순서·익명 기록) */
export function toBoardSkins(value: unknown): BoardSkins {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const pick = (slot: keyof BoardSkins) => (typeof raw[slot] === 'string' && raw[slot] ? (raw[slot] as string) : DEFAULT_SKIN_ID);
  return { block: pick('block'), effect: pick('effect'), board: pick('board') };
}

export function toEquippedSkins(value: unknown): EquippedSkins {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const background = typeof raw.background === 'string' && raw.background ? raw.background : DEFAULT_SKIN_ID;
  return { ...toBoardSkins(value), background };
}
