"use client";

import { GameSurface } from "@/app/games/_shared/components/GameSurface";
import { useMySkins } from "../hooks/useMySkins";
import { DEFAULT_SKIN_ID, KNOWN_SKIN_IDS, backgroundSkin } from "../lib/skins";

/**
 * 테트리스 전체화면 표면 — 화면 바탕은 늘 보는 사람 자신의 배경 스킨(D-003, 상대·리플레이 화면도)
 * 기본·모르는 id면 스타일을 넣지 않아 기존 bg-slate-950 그대로
 */
export function TetrisGameSurface({ children }: { children: React.ReactNode }) {
  const { equipped } = useMySkins();
  const id = equipped.background;
  const background = id !== DEFAULT_SKIN_ID && KNOWN_SKIN_IDS.background.includes(id) ? backgroundSkin(id).background : undefined;
  return <GameSurface background={background}>{children}</GameSurface>;
}
