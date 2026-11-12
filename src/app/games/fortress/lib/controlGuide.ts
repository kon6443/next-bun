/**
 * 조작 안내 표 — 경기 안 안내(FortressGuide)와 포트리스 홈(FortressHome)이 같이 쓴다
 * ("use client" 파일에서 배열을 내보내면 서버 컴포넌트에서는 값이 아니라 참조가 되므로 일반 모듈에 둔다)
 */
export type GuideRow = { keys: string; label: string };

export const KEY_GUIDE: readonly GuideRow[] = [
  { keys: "← → · A D", label: "이동 — 연료만큼, 발사할 때 움직여요. 반대쪽을 처음 누르면 돌아서기만 해요" },
  { keys: "↑ ↓ · W S", label: "포신 올리기·내리기 — 각도는 바라보는 쪽(◀ ▶)과 높이(0~90°)로 보여요" },
  { keys: "Q E · 파워 막대", label: "파워 −1 · +1" },
  { keys: "Space", label: "짧게 = 맞춘 파워로 발사 · 길게 = 누른 만큼 충전해 발사" },
  { keys: "끌기 · 휠", label: "전장 둘러보기 · 확대" },
];

export const TOUCH_GUIDE: readonly GuideRow[] = [
  { keys: "십자 ◀ ▶", label: "이동 — 연료만큼, 발사할 때 움직여요. 반대쪽을 처음 누르면 돌아서기만 해요" },
  { keys: "십자 ▲ ▼ · 포신 끌기", label: "포신 올리기·내리기(포신을 끌면 파워도) — 각도는 바라보는 쪽(◀ ▶)과 높이(0~90°)" },
  { keys: "파워 막대", label: "파워 · 옆의 넘기기는 이번 차례를 쏘지 않고 넘겨요" },
  { keys: "발사 버튼", label: "탭 = 맞춘 파워로 발사 · 길게 = 누른 만큼 충전해 발사" },
  { keys: "무기 버튼", label: "누를 때마다 다음 무기 — 숫자는 필살기를 다시 쓸 때까지 남은 턴" },
  { keys: "끌기 · 두 손가락", label: "전장 둘러보기 · 확대" },
];
