/**
 * 배경 그리기 공통 타입 — 배경(하늘·산·구름·바람)은 renderer/vividWorld의 drawWorldBackdrop이 그린다
 * (예전 기본 그림(classic) 배경은 D-027 보충 1에서 지웠다)
 */

export type Quality = "high" | "low";

export type BackdropOptions = {
  /** 경과 시간(ms) — 구름·바람 줄기·별 반짝임 */
  time: number;
  wind: number;
  quality: Quality;
  reducedMotion: boolean;
};
