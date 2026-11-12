"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMyTankSkin } from "../hooks/useMyTankSkin";
import { DEFAULT_TANK_SKIN_ID, FORTRESS_SKINS_HREF, TANK_SKIN_LABELS } from "../lib/tankSkins";

/** 탱크 그림(캔버스·지형 생성)은 홈 첫 번들에 넣지 않는다 — 자리만 먼저 */
const TankSkinPreview = dynamic(() => import("./TankSkinPreview").then((m) => m.TankSkinPreview), {
  ssr: false,
  loading: () => <span className="block h-full w-full" aria-hidden="true" />,
});

const PREVIEW_COLOR = "#38bdf8";

/**
 * 포트리스 홈 머리의 "내 스킨" 버튼(D-025) — 테트리스 홈 상단 바의 내 스킨 버튼(MySkinButton)과 같은 자리·모양·레벨 배지
 * 테트리스는 설정 시트를 열지만 포트리스는 스킨 화면으로 간다(장착·강화가 거기 있다). 안에 장착 스킨 탱크를 작게 그린다
 * 요약(스킨·레벨)은 접근 이름에. 게스트·불러오기 실패는 기본 탱크 — 스킨 화면이 로그인을 안내한다
 */
export function FortressMySkinButton() {
  const { skin, status } = useMyTankSkin();
  const name = skin.id === DEFAULT_TANK_SKIN_ID ? "기본" : TANK_SKIN_LABELS[skin.id];
  const label = status === "guest" ? "내 스킨 · 로그인하고 탱크 꾸미기" : status === "ready" ? `내 스킨 · ${name} Lv${skin.level}` : "내 스킨";
  return (
    <Link
      href={FORTRESS_SKINS_HREF}
      aria-label={label}
      data-testid="fortress-my-skin"
      className="relative flex h-11 w-14 shrink-0 items-center justify-center overflow-visible rounded-xl border border-slate-700/60 bg-slate-900/70 hover:border-slate-500"
    >
      <span className="block h-9 w-12 overflow-hidden rounded-lg" aria-hidden="true">
        <TankSkinPreview tanks={[{ skin, color: PREVIEW_COLOR }]} className="h-full w-full" label="" />
      </span>
      {status === "ready" && skin.level > 1 ? (
        <span aria-hidden="true" className="absolute -bottom-1 -right-1 rounded-full border border-slate-900 bg-amber-400 px-1 text-[9px] font-bold leading-[14px] text-slate-900">
          Lv{skin.level}
        </span>
      ) : null}
    </Link>
  );
}
