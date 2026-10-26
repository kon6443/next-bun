import type { GamePadLayout } from "@/app/games/_shared/components/GamePad";
import { ACTION } from "../engine";

function RotateLabel({ arrow, letter }: { arrow: string; letter: string }) {
  return (
    <span aria-hidden="true" className="relative flex h-full w-full items-center justify-center">
      <span className="text-2xl leading-none">{arrow}</span>
      <span className="absolute bottom-1.5 text-[10px] font-semibold text-slate-300">{letter}</span>
    </span>
  );
}

/**
 * 테트리스 모바일 패드 배치 (games-polish P9) — 공통 GamePad에 넘긴다
 * - 십자: ←→ 이동(키보드와 같은 DAS/ARR 경로) · ↓ 누르는 동안 소프트 드롭 · ↑ 없음(T자 — 그 높이를 판에 돌려준다, D-004 C3)
 *   키보드 가이드라인은 ↑=시계 회전이지만, 터치에서는 ←→·↓를 문지르다 ↑로 미끄러지기 쉬워 오회전·오드롭이 난다 — 아무 입력도 두지 않는다
 *   (↑에 HOLD를 두는 안은 PC의 ↑=회전과 어긋나 기각 — 위로 미끄러져도 무동작)
 * - 오른쪽 위: 하드 드롭 전용 — A·B와 다른 모양(넓은 둥근 사각)·강조색, ⤓ "드롭". A·B와 12px 띄운다(엄지를 위로 뻗어 닿는 곳)
 * - 오른쪽 아래: A ⟳ 시계(위·오른쪽) · B ⟲ 반시계(왼쪽 아래) — 가이드라인 패드의 "오른쪽=시계·왼쪽=반시계"
 * - 왼쪽 위: HOLD 어깨 버튼(L) — 하드 드롭과 반대 손·다른 모양·중립색이라 헷갈리지 않게
 */
export const TETRIS_PAD_LAYOUT: GamePadLayout = {
  dpad: {
    left: { action: { kind: "hold", press: ACTION.LEFT_PRESS, release: ACTION.LEFT_RELEASE }, aria: "왼쪽 이동", label: "◀" },
    right: { action: { kind: "hold", press: ACTION.RIGHT_PRESS, release: ACTION.RIGHT_RELEASE }, aria: "오른쪽 이동", label: "▶" },
    down: { action: { kind: "hold", press: ACTION.SOFT_DROP_PRESS, release: ACTION.SOFT_DROP_RELEASE }, aria: "소프트 드롭", label: "▼" },
  },
  buttons: [
    {
      id: "hard-drop",
      slot: "top",
      action: { kind: "instant", action: ACTION.HARD_DROP },
      aria: "하드 드롭",
      tone: "accent",
      content: (
        <span aria-hidden="true" className="flex items-center gap-1.5">
          <span className="text-2xl leading-none">⤓</span>
          <span>드롭</span>
        </span>
      ),
    },
    { id: "rotate-cw", slot: "a", action: { kind: "instant", action: ACTION.ROTATE_CW }, aria: "시계 방향 회전 (A)", tone: "primary", content: <RotateLabel arrow="↻" letter="A" /> },
    { id: "rotate-ccw", slot: "b", action: { kind: "instant", action: ACTION.ROTATE_CCW }, aria: "반시계 방향 회전 (B)", content: <RotateLabel arrow="↺" letter="B" /> },
    { id: "hold", slot: "shoulder", action: { kind: "instant", action: ACTION.HOLD }, aria: "홀드", content: "HOLD" },
  ],
};
