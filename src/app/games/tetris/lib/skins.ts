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

/**
 * 아이템 레벨 Lv1~5(skin-levels D-001) — 레벨이 오를수록 화려해진다. Lv1 = 레벨 도입 전 모습
 * 테마(아이템)는 색만 정하고, 레벨별 강화는 모든 테마에 같은 레이어를 얹는다(blockSprites·levelLayers·backgroundStyle)
 * 게임의 레벨(속도·판 색조)과 다른 값이다 — 코드에서는 skinLevel로 부른다
 */
export const MAX_SKIN_LEVEL = 5;

/** 보드 슬롯의 레벨 — 서버 skins.levels와 같은 모양(레벨 이전 기록은 모두 1) */
export type BoardSkinLevels = { block: number; effect: number; board: number };
export type EquippedSkinLevels = BoardSkinLevels & { background: number };

/** 보드 하나를 그리는 데 쓰는 슬롯과 레벨 — 서버 players[].skins·리플레이 skins와 같은 모양 */
export type BoardSkins = { block: string; effect: string; board: string; levels: BoardSkinLevels };
export type EquippedSkins = { block: string; effect: string; board: string; background: string };

export const DEFAULT_SKIN_ID = 'default';
export const DEFAULT_BOARD_SKIN_LEVELS: BoardSkinLevels = { block: 1, effect: 1, board: 1 };
export const DEFAULT_EQUIPPED_SKIN_LEVELS: EquippedSkinLevels = { ...DEFAULT_BOARD_SKIN_LEVELS, background: 1 };
export const DEFAULT_BOARD_SKINS: BoardSkins = { block: DEFAULT_SKIN_ID, effect: DEFAULT_SKIN_ID, board: DEFAULT_SKIN_ID, levels: DEFAULT_BOARD_SKIN_LEVELS };
export const DEFAULT_EQUIPPED_SKINS: EquippedSkins = { block: DEFAULT_SKIN_ID, effect: DEFAULT_SKIN_ID, board: DEFAULT_SKIN_ID, background: DEFAULT_SKIN_ID };

type Rgb = readonly [number, number, number];

export type BlockSkin = {
  /** 칸 값(0 빈칸 · 1~7 블록 I J L O S T Z · 8 가비지) → 색. 스프라이트가 밝기를 계산하므로 #rrggbb만 */
  cells: readonly string[];
  /** 블록마다 다른 무늬 — 색만으로 블록을 가르기 어려울 때(고대비·게임보이) */
  patterns: boolean;
  /** 질감 — 없으면 입체 블록. glass = 거의 무색으로 비치는 몸통 + 밝은 외곽선·반사광(투명) · chocolate = 판 초콜릿의 몰드 테두리(초콜릿) */
  finish?: 'glass' | 'chocolate';
  /** 한 색 계열(게임보이·투명·초콜릿) — Lv4 두 톤(색상을 돌린 색)을 얹지 않는다(팔레트를 벗어나지 않게) */
  mono?: boolean;
  /** 레벨 강화의 하이라이트 색(광택·림라이트·별·샤인·반짝임, #rrggbb) — 없으면 흰색. 초콜릿은 캐러멜·골드로 갈색을 살린다 */
  highlight?: string;
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
  /** 판 배경 불투명도 — 없으면 0.92. 투명 보드는 낮춰 화면 바탕이 비치게(대신 격자를 진하게) */
  opacity?: number;
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
  clear: '투명',
  chocolate: '초콜릿',
};

/** 레벨별로 더해지는 것(Lv1~5, 누적) — 강화 화면 안내. 그림은 blockSprites·levelLayers·effectsRenderer·backgroundStyle */
export const SKIN_LEVEL_FEATURES: Record<SkinSlot, readonly string[]> = {
  block: ['기본 블록', '광택 띠', '림라이트 · 진한 발광', '두 톤 그라데이션 · 샤인', '반짝이는 별 · 쌓인 블록 반짝임'],
  effect: ['기본 연출', '충격파 메아리', '번쩍임 · 문구 발광 강화', '줄을 가로지르는 빛줄기 · 그라데이션 문구', '줄 삭제 불꽃 · 큰 삭제 가장자리 빛'],
  board: ['기본 판', '모서리 브래킷', '테두리 발광 강화 · 격자 점', '위에서 내리는 빛 · 오로라', '테두리를 도는 빛 · 별 더 많이'],
  background: ['기본 바탕', '비네트', '보조 광원', '사선 결 무늬', '떠다니는 빛'],
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
    mono: true,
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
  // 유리(skin-levels D-003) — 무색 한 계열. 몸통은 거의 투명하고, 블록은 외곽선의 밝기 단계·반사광·무늬로 가른다(판 가독성은 외곽선이 지킨다)
  clear: {
    cells: ['#000000', '#ffffff', '#b8c0c8', '#e4e8ec', '#8f99a3', '#f4f6f8', '#a3adb7', '#d0d6dc', '#5c636a'],
    patterns: true,
    finish: 'glass',
    mono: true,
  },
  // 초콜릿(skin-levels D-003) — 갈색 한 계열. 게임보이처럼 명도 단계 + 무늬로 블록을 가르고, 판 초콜릿 몰드 테두리 질감. 어두운 코코아 판 위에서 보이게 가장 어두운 블록도 판보다 밝게
  chocolate: {
    cells: ['#000000', '#e6bf94', '#8a5532', '#c48a58', '#f0d6b5', '#a86d42', '#d8a574', '#764427', '#4a3326'],
    patterns: true,
    finish: 'chocolate',
    mono: true,
    highlight: '#ffcf8a',
  },
};

// ==================== effect ====================

const EFFECT_SKINS: Record<string, EffectSkin> = {
  default: { tierColors: ['#e2e8f0', '#7dd3fc', '#c4b5fd', '#fcd34d', '#fb7185'], ring: { normal: '#a5f3fc', big: '#fde68a' }, flashGlow: [186, 230, 253] },
  gameboy: { tierColors: [GB.lightest, GB.light, GB.lightest, GB.light, GB.lightest], ring: { normal: GB.light, big: GB.lightest }, flashGlow: [155, 188, 15] },
  neon: { tierColors: ['#f8fafc', '#00f0ff', '#d500f9', '#ffea00', '#ff1744'], ring: { normal: '#00f0ff', big: '#ffea00' }, flashGlow: [0, 240, 255] },
  'high-contrast': { tierColors: ['#ffffff', '#56b4e9', '#f0e442', '#e69f00', '#ffffff'], ring: { normal: '#ffffff', big: '#f0e442' }, flashGlow: [255, 255, 255] },
  clear: { tierColors: ['#f4f6f8', '#d0d6dc', '#e4e8ec', '#ffffff', '#ffffff'], ring: { normal: '#e4e8ec', big: '#ffffff' }, flashGlow: [240, 243, 246] },
  chocolate: { tierColors: ['#f5e6d3', '#e6bf94', '#d8a574', '#f0d6b5', '#fff4e6'], ring: { normal: '#d8a574', big: '#f5e0c4' }, flashGlow: [230, 191, 148] },
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
  // 유리 판 — 배경이 비친다. 대신 격자·테두리를 진하게 해 칸이 읽히게
  clear: {
    levelTints: repeat10<Rgb>([14, 16, 18]),
    levelNeon: ['#e4e8ec', '#f4f6f8', '#d0d6dc', '#ffffff', '#c4ccd4', '#e4e8ec', '#f4f6f8', '#d0d6dc', '#ffffff', '#c4ccd4'],
    grid: 'rgba(228, 232, 236, 0.16)',
    label: 'rgba(228, 232, 236, 0.9)',
    gauge: { track: 'rgba(15, 23, 42, 0.7)', pending: '#cbd5e1', active: '#f87171' },
    miniBoard: 'rgba(15, 23, 42, 0.7)',
    opacity: 0.55,
  },
  chocolate: {
    levelTints: [
      [38, 22, 14],
      [42, 24, 15],
      [46, 26, 16],
      [50, 27, 18],
      [46, 22, 22],
      [42, 20, 26],
      [36, 24, 22],
      [42, 28, 16],
      [48, 30, 14],
      [40, 26, 18],
    ],
    levelNeon: ['#d8a574', '#e6bf94', '#c48a58', '#f0d6b5', '#b97a4b', '#e0b48a', '#cf9466', '#f2d2ad', '#c48552', '#e6bf94'],
    grid: 'rgba(230, 191, 148, 0.08)',
    label: 'rgba(245, 230, 211, 0.9)',
    gauge: { track: 'rgba(38, 22, 14, 0.9)', pending: '#8a6a55', active: '#ef4444' },
    miniBoard: 'rgba(38, 22, 14, 0.95)',
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
  // 서리 낀 유리 — 무색 사선 반사 + 어두운 무채색 바탕(밝게 하면 투명 블록·판이 묻힌다)
  clear: {
    background: 'linear-gradient(155deg, rgba(255, 255, 255, 0.1) 0%, transparent 35%, rgba(255, 255, 255, 0.05) 60%, transparent 75%), radial-gradient(circle at 50% 20%, #24272a 0%, #111315 60%, #060708 100%)',
  },
  chocolate: { background: 'radial-gradient(circle at 50% 0%, #5a3220 0%, #2b170e 55%, #160b06 100%)' },
};

/** 배경 레벨 레이어의 강조색(보조 광원·움직이는 빛) — 배경 테마마다 */
const BACKGROUND_ACCENTS: Record<string, Rgb> = {
  default: [56, 189, 248],
  gameboy: [155, 188, 15],
  neon: [213, 0, 249],
  'high-contrast': [255, 255, 255],
  clear: [240, 243, 246],
  chocolate: [216, 165, 116],
};

// ==================== 조회 ====================

const lookup = <T>(registry: Record<string, T>, id: string | null | undefined): T =>
  (id && Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : undefined) ?? registry[DEFAULT_SKIN_ID];

export const blockSkin = (id?: string | null): BlockSkin => lookup(BLOCK_SKINS, id);
export const effectSkin = (id?: string | null): EffectSkin => lookup(EFFECT_SKINS, id);
export const boardSkin = (id?: string | null): BoardSkin => lookup(BOARD_SKINS, id);
export const backgroundSkin = (id?: string | null): BackgroundSkin => lookup(BACKGROUND_SKINS, id);
export const backgroundAccent = (id?: string | null): Rgb => lookup(BACKGROUND_ACCENTS, id);

/** 이 프론트가 그릴 줄 아는 아이템 id(슬롯별) — 카탈로그에 있지만 여기 없으면 default로 그린다 */
export const KNOWN_SKIN_IDS: Record<SkinSlot, readonly string[]> = {
  block: Object.keys(BLOCK_SKINS),
  effect: Object.keys(EFFECT_SKINS),
  board: Object.keys(BOARD_SKINS),
  background: Object.keys(BACKGROUND_SKINS),
};

/**
 * 배경 레벨 레이어(CSS background) — 테마 바탕 위에 Lv2 비네트 · Lv3 강조색 보조 광원(아래) · Lv4 사선 결 무늬를 얹는다
 * Lv5의 움직이는 빛은 DOM 레이어(TetrisGameSurface — 연출 줄이기면 멈춘다). Lv1은 테마 바탕 그대로
 */
export function backgroundStyle(id: string | null | undefined, level: number): string {
  const base = backgroundSkin(id).background;
  if (level < 2) return base;
  const [r, g, b] = backgroundAccent(id);
  const layers = ['radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.5) 100%)'];
  if (level >= 3) layers.push(`radial-gradient(ellipse at 50% 100%, rgba(${r}, ${g}, ${b}, 0.22), transparent 60%)`);
  if (level >= 4) layers.push(`repeating-linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.05) 0 2px, transparent 2px 16px)`);
  return [...layers, base].join(', ');
}

/** 서버 레벨 값 → 1~5 정수. 없음·범위 밖·정수 아님은 1(레벨 이전 기록·배포 순서) */
export function toSkinLevel(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SKIN_LEVEL ? value : 1;
}

/** 블록 스프라이트 캐시 키용 번호 — 모르는 id는 default(0)와 같은 그림이라 같은 번호 */
export function blockSkinIndex(id: string): number {
  const index = KNOWN_SKIN_IDS.block.indexOf(id);
  return index < 0 ? 0 : index;
}

export const BLOCK_SKIN_COUNT = KNOWN_SKIN_IDS.block.length;

const asRecord = (value: unknown) => (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
const pickId = (raw: Record<string, unknown>, slot: SkinSlot) => (typeof raw[slot] === 'string' && raw[slot] ? (raw[slot] as string) : DEFAULT_SKIN_ID);

/** 서버 응답의 skins 객체 → 보드 슬롯·레벨. 없거나 문자열이 아닌 칸은 default, 레벨이 없거나 이상하면 1 (배포 순서·익명·레벨 이전 기록) */
export function toBoardSkins(value: unknown): BoardSkins {
  const raw = asRecord(value);
  return { block: pickId(raw, 'block'), effect: pickId(raw, 'effect'), board: pickId(raw, 'board'), levels: toBoardSkinLevels(raw.levels) };
}

export function toBoardSkinLevels(value: unknown): BoardSkinLevels {
  const raw = asRecord(value);
  return { block: toSkinLevel(raw.block), effect: toSkinLevel(raw.effect), board: toSkinLevel(raw.board) };
}

export function toEquippedSkins(value: unknown): EquippedSkins {
  const raw = asRecord(value);
  return { block: pickId(raw, 'block'), effect: pickId(raw, 'effect'), board: pickId(raw, 'board'), background: pickId(raw, 'background') };
}

export function toEquippedSkinLevels(value: unknown): EquippedSkinLevels {
  return { ...toBoardSkinLevels(value), background: toSkinLevel(asRecord(value).background) };
}

/** 내 장착(아이템·레벨) → 내 판을 그릴 보드 슬롯 */
export function boardSkinsOf(equipped: EquippedSkins, levels: EquippedSkinLevels): BoardSkins {
  return { block: equipped.block, effect: equipped.effect, board: equipped.board, levels: { block: levels.block, effect: levels.effect, board: levels.board } };
}
