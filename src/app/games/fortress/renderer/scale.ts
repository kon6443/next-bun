import { TANK_RADIUS } from "../engine";

/** 그리는 크기 규칙 — 전장·미리보기·화면 밖 칩이 함께 쓴다 */

/** 폭발 연출 반지름(월드 px) — 화면에서 최소 BLAST_MIN_PX(작은 무기는 그만큼, 큰 무기는 비례해서 더 크게) */
export const BLAST_MIN_PX = 34;
export function blastDrawRadius(r: number, zoom: number): number {
  return Math.max(r, ((BLAST_MIN_PX / zoom) * r) / 36);
}

/** 보이는 탱크 크기 — 판정 원보다 크게, 디테일 있는 탱크라 화면에서 반지름 약 20px(조준 화면(0.9배)에서 폭 약 58px), 멀리 볼 때 최대 4.2배 */
export function tankDrawScale(zoom: number): number {
  return Math.max(1.6, Math.min(4.2, 20 / (TANK_RADIUS * zoom)));
}
