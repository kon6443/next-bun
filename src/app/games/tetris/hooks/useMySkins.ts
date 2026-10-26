"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import type { SkinSlotName } from "@/services/userService";
import {
  type MySkinsState,
  equipMySkin,
  getMySkinsState,
  getServerMySkinsState,
  loadMySkins,
  resetMySkins,
  retryMySkins,
  subscribeMySkins,
} from "../lib/mySkins";

/**
 * 내 스킨 장착(D-003) — 로그인하면 계정 장착을 불러오고, 로그아웃이면 기본으로 돌린다
 * 세션 확인 중(loading)에는 이전 상태를 그대로 둔다(화면이 기본 ↔ 내 스킨으로 깜빡이지 않게)
 */
export function useMySkins(): MySkinsState & {
  loggedIn: boolean;
  /** 장착 — 로그인 상태에서만. 실패하면 되돌리고 에러를 던진다 */
  equip: (slot: SkinSlotName, id: string) => Promise<void>;
  /** 불러오기 일시 실패(error) 뒤 다시 불러오기 */
  retry: () => void;
} {
  const { data: session, status } = useSession();
  const accessToken = session?.user?.accessToken ?? null;
  const skins = useSyncExternalStore(subscribeMySkins, getMySkinsState, getServerMySkinsState);

  useEffect(() => {
    if (status === "loading") return;
    if (accessToken) void loadMySkins(accessToken);
    else resetMySkins();
  }, [status, accessToken]);

  const equip = useCallback(
    async (slot: SkinSlotName, id: string) => {
      if (!accessToken) return;
      await equipMySkin(slot, id, accessToken);
    },
    [accessToken],
  );

  const retry = useCallback(() => {
    if (accessToken) void retryMySkins(accessToken);
  }, [accessToken]);

  return { ...skins, loggedIn: Boolean(accessToken), equip, retry };
}
