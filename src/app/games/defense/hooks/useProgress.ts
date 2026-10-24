"use client";

import { useMemo, useSyncExternalStore } from "react";
import { PROGRESS_KEY, type Progress, loadProgress } from "../lib/progress";

function subscribe(onChange: () => void): () => void {
  // 다른 탭에서 깬 스테이지도 반영한다 — clear()는 key가 null
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === PROGRESS_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** 저장된 원문 — 같으면 같은 진행(파싱 결과를 렌더마다 새로 만들지 않게). 없으면 "", 막혔으면 "" */
function rawSnapshot(): string {
  try {
    return window.localStorage.getItem(PROGRESS_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * 캠페인 진행(기기 저장) — 서버 렌더·하이드레이션 전에는 null(불러오는 중) (games-polish FE-44)
 * 전에는 화면마다 빈 진행(S1만 열림)으로 먼저 그려 "전부 잠김"이 깜빡였고, 다른 탭의 변경도 보지 않았다
 */
export function useProgress(): Progress | null {
  const raw = useSyncExternalStore(subscribe, rawSnapshot, () => null);
  // raw가 바뀔 때만 다시 읽는다 — loadProgress가 검증·이전 형식 변환을 맡는다
  return useMemo(() => (raw === null ? null : loadProgress()), [raw]);
}
