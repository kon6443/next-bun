/**
 * 경기 화면 그림(D-025 B → 보충 5 vivid 기본 → D-027 보충 1 classic 폐기) — 그림은 vivid 하나, ?look=glow면 vivid 위에 WebGL 후처리
 * 쿼리가 없거나 모르는 값(예전 ?look=classic 포함)이면 기본(vivid)
 * ?look=…은 그 탭에 기억한다(LOOK_STORAGE_KEY, sessionStorage) — 쿼리 없는 링크로 옮겨 가도(로비→방, 홈→플레이) 고른 그림이 이어진다
 */
import { useEffect, useState } from "react";
import { readStorage, writeStorage } from "@/app/games/_shared/lib/storage";

export type Look = "vivid" | "glow";

const LOOKS: readonly Look[] = ["vivid", "glow"];

/** 쿼리가 없을 때의 그림 */
export const DEFAULT_LOOK: Look = "vivid";

export function toLook(value: string | null | undefined): Look {
  return LOOKS.includes(value as Look) ? (value as Look) : DEFAULT_LOOK;
}

const LOOK_STORAGE_KEY = "fortress:look";

/**
 * 지금 주소의 ?look — 있으면 그 탭에 기억하고, 없으면 그 탭에 기억한 값, 그것도 없으면 기본값. 서버(창 없음)에서는 기본값
 * 저장소를 못 쓰면(사생활 보호 모드 등) 쿼리만 본다
 */
export function lookFromUrl(): Look {
  if (typeof window === "undefined") return DEFAULT_LOOK;
  const query = new URLSearchParams(window.location.search).get("look");
  if (query !== null) {
    const look = toLook(query);
    writeStorage("session", LOOK_STORAGE_KEY, look);
    return look;
  }
  return toLook(readStorage("session", LOOK_STORAGE_KEY));
}

/**
 * 경기 밖 진입 화면(홈·스킨·대기실 미리보기, 기록 보기)에서 주소의 ?look을 그 탭에 기억해 둔다 — 쿼리 없는 링크로 경기에 들어가도 고른 그림(glow)이 이어지게
 * (classic 폐기 전에는 이 화면들이 그림을 정하려고 lookFromUrl을 불러 저절로 기억됐다)
 */
export function useRememberLook(): void {
  useEffect(() => {
    lookFromUrl();
  }, []);
}

/** 경기 화면의 그림 — 마운트 때 한 번 정한다(지정이 없으면 주소·탭 기억). glow면 WebGL 후처리 층을 켠다 */
export function useLook(lookProp?: Look): { glow: boolean } {
  const [look] = useState<Look>(() => lookProp ?? lookFromUrl());
  return { glow: look === "glow" };
}
