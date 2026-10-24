/**
 * 십자 패드 방향 판정 (games-polish P9) — 한 터치 영역에서 손가락 위치의 각도로 4방향(대각 없음)
 * dx·dy: 패드 중심에서의 거리를 반지름으로 나눈 값(-1~1, y는 아래가 +)
 * - ←→는 넓게(±55°), ↑ 하드 드롭은 좁게(±30° — 잘못 들어가면 되돌릴 수 없다), ↓는 나머지(±35°). ↑와 ←→ 사이의 틈은 방향 없음
 * - 데드존: 중심 반경 20% 안은 방향 없음(누르고 있는 중이면 15% — 경계에서 떨지 않게)
 * - 히스테리시스: 지금 방향은 경계를 12° 넘어야 바뀐다(손가락 흔들림에 이동이 끊기지 않게)
 */
export type PadDirection = "left" | "right" | "up" | "down";

export const PAD_DEADZONE = 0.2;
export const PAD_DEADZONE_HELD = 0.15;
export const PAD_HYSTERESIS_DEG = 12;

const CENTER_DEG: Record<PadDirection, number> = { right: 0, up: 90, left: 180, down: -90 };
const HALF_DEG: Record<PadDirection, number> = { right: 55, left: 55, up: 30, down: 35 };
const ORDER: readonly PadDirection[] = ["left", "right", "down", "up"];

/** 두 각도의 차(0~180) */
function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function padDirection(dx: number, dy: number, current: PadDirection | null): PadDirection | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) < (current ? PAD_DEADZONE_HELD : PAD_DEADZONE)) return null;
  const deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (current && angleBetween(deg, CENTER_DEG[current]) <= HALF_DEG[current] + PAD_HYSTERESIS_DEG) return current;
  for (const dir of ORDER) if (angleBetween(deg, CENTER_DEG[dir]) <= HALF_DEG[dir]) return dir;
  return null;
}
