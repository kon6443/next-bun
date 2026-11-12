"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { getMyFortressSkins } from "@/services/fortressService";
import { DEFAULT_TANK_SKIN, type TankSkin, toTankSkin } from "../lib/tankSkins";

export type MyTankSkin = {
  /** 그릴 스킨 — 게스트·불러오는 중·실패면 기본 */
  skin: TankSkin;
  status: "guest" | "loading" | "ready" | "error";
};

const LOADING: MyTankSkin = { skin: DEFAULT_TANK_SKIN, status: "loading" };
const GUEST: MyTankSkin = { skin: DEFAULT_TANK_SKIN, status: "guest" };

/**
 * 내 장착 스킨(D-025) — 로그인하면 GET fortress/skins/me의 equipped(스킨·레벨), 게스트·실패면 기본
 * 혼자하기 경기·홈 "내 스킨" 버튼이 쓴다(온라인은 서버가 방·경기에 붙인 스킨을 쓴다). 스킨은 그리기에만 — 엔진·결과 해시와 무관
 */
export function useMyTankSkin(): MyTankSkin {
  const { data: session, status: authStatus } = useSession();
  const accessToken = session?.user?.accessToken;
  const [mine, setMine] = useState<MyTankSkin>(LOADING);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!accessToken) {
      setMine(GUEST);
      return;
    }
    // 토큰이 바뀌거나 화면을 떠나면 늦게 온 응답은 버린다
    let alive = true;
    setMine(LOADING);
    getMyFortressSkins(accessToken).then(
      // 응답 모양이 어긋나도(data 없음) 던지지 않고 기본으로
      (res) => alive && setMine({ skin: toTankSkin(res?.data?.equipped), status: "ready" }),
      () => alive && setMine({ skin: DEFAULT_TANK_SKIN, status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [authStatus, accessToken]);

  return mine;
}
