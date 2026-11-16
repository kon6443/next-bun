/** #rrggbb 색 다루기 — 렌더러 전용(탱크 음영·연기·칩 색) */

/** 툰 잉크(외곽선·아래 두께) — 탱크·탄·연기·칩·무기 아이콘, fortressVivid.module.css의 --ink와 같은 색 */
export const INK = "#160b1c";
export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** hex에서 to 쪽으로 t만큼(0이면 그대로, 1이면 to) — 채널마다 반올림 */
export function mixRgb(hex: string, to: Rgb, t: number): string {
  const from = hexToRgb(hex);
  const ch = (i: number) => Math.round(from[i] * (1 - t) + to[i] * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

export function rgbaOf(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
