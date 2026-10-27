"use client";

import { GameSurface } from "@/app/games/_shared/components/GameSurface";
import { useMySkins } from "../hooks/useMySkins";
import { useReducedEffects } from "../hooks/useReducedEffects";
import { DEFAULT_SKIN_ID, KNOWN_SKIN_IDS, backgroundAccent, backgroundStyle } from "../lib/skins";

/**
 * 테트리스 전체화면 표면 — 화면 바탕은 늘 보는 사람 자신의 배경 스킨과 그 레벨(D-003·skin-levels D-002, 상대·리플레이 화면도)
 * 기본 Lv1·모르는 id면 스타일을 넣지 않아 기존 bg-slate-950 그대로
 */
export function TetrisGameSurface({ children }: { children: React.ReactNode }) {
  const { equipped, levels } = useMySkins();
  const reduced = useReducedEffects();
  const known = KNOWN_SKIN_IDS.background.includes(equipped.background);
  const id = known ? equipped.background : DEFAULT_SKIN_ID;
  const level = levels.background;
  const background = id !== DEFAULT_SKIN_ID || level >= 2 ? backgroundStyle(id, level) : undefined;
  return (
    <GameSurface background={background}>
      {level >= 5 && <BackgroundDrift id={id} still={reduced} />}
      {children}
    </GameSurface>
  );
}

/** 배경 Lv5 — 강조색 빛 두 개가 천천히 떠다닌다. 표면의 쌓임 맥락 안 맨 아래(-z-10)라 화면 내용을 덮지 않는다. 연출 줄이기(저장값이 없으면 기기 prefers-reduced-motion)면 멈춘다 */
function BackgroundDrift({ id, still }: { id: string; still: boolean }) {
  const [r, g, b] = backgroundAccent(id);
  return (
    <div
      aria-hidden="true"
      data-testid="skin-background-drift"
      className="pointer-events-none absolute -inset-[10%] -z-10"
      style={{
        background: `radial-gradient(circle at 30% 35%, rgba(${r}, ${g}, ${b}, 0.16), transparent 40%), radial-gradient(circle at 70% 70%, rgba(${r}, ${g}, ${b}, 0.12), transparent 45%)`,
        animation: still ? undefined : "skinDrift 30s ease-in-out infinite alternate",
      }}
    />
  );
}
