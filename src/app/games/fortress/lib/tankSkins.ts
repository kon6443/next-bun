/**
 * 탱크 스킨 (F7, DESIGN §13) — 서버 카탈로그는 id·잠금·레벨만 준다. 이름·그림은 여기서 정한다
 * - 몸통 색은 늘 slot·팀 색(누구 탱크인지 알아보는 표시) — 스킨은 무늬·궤도·포신·장식을 바꾼다
 * - 레벨은 장식을 더한다(Lv2 안테나 · Lv3 깃발 · Lv4 차체 줄무늬 · Lv5 포탑 별). 기본 색을 밝히지 않는다
 * - 모르는 id·잘못된 레벨은 기본·Lv1로 그린다(계약 FortressTankSkin)
 * 이름·시각은 사용자 확정(기본 · 모래폭풍 · 눈보라 · 네온 라인) — id는 서버 카탈로그 그대로
 */

export const TANK_SKIN_IDS = ["default", "desert", "arctic", "neon"] as const;
export type TankSkinId = (typeof TANK_SKIN_IDS)[number];

/** 탱크 스킨 화면(F7) — 홈·대기실이 링크한다 */
export const FORTRESS_SKINS_HREF = "/games/fortress/skins";

export const DEFAULT_TANK_SKIN_ID: TankSkinId = "default";
export const MAX_TANK_SKIN_LEVEL = 5;

export type TankSkin = { id: TankSkinId; level: number };
export const DEFAULT_TANK_SKIN: TankSkin = { id: DEFAULT_TANK_SKIN_ID, level: 1 };

export const TANK_SKIN_LABELS: Record<TankSkinId, string> = {
  default: "기본",
  desert: "모래폭풍",
  arctic: "눈보라",
  neon: "네온 라인",
};

export const TANK_SKIN_DESCRIPTIONS: Record<TankSkinId, string> = {
  default: "매끈한 기본 도색",
  desert: "모래빛 얼룩과 갈색 궤도",
  arctic: "눈 얼룩과 은빛 포신",
  neon: "어두운 차체에 빛나는 테두리",
};

/** 레벨마다 더해지는 장식 — 강화 화면 안내 */
export const TANK_SKIN_LEVEL_FEATURES: readonly string[] = ["", "안테나", "깃발", "차체 줄무늬", "포탑 별"];

export function isTankSkinId(id: unknown): id is TankSkinId {
  return typeof id === "string" && (TANK_SKIN_IDS as readonly string[]).includes(id);
}

/** 서버·소켓 값 → 그릴 스킨(모르는 id는 기본, 레벨은 1~5로) */
export function toTankSkin(skin: { id?: unknown; level?: unknown } | null | undefined): TankSkin {
  if (!skin || !isTankSkinId(skin.id)) return DEFAULT_TANK_SKIN;
  const level = typeof skin.level === "number" && Number.isFinite(skin.level) ? Math.min(MAX_TANK_SKIN_LEVEL, Math.max(1, Math.floor(skin.level))) : 1;
  return { id: skin.id, level };
}
