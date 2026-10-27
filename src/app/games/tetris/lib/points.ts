/** 스킨 포인트 표기 — 정수·천 단위 쉼표·" P"(음수는 0) */
export const formatPoints = (points: number) => `${Math.max(0, Math.floor(points)).toLocaleString("ko-KR")} P`;
