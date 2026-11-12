"use client";

import { useEffect } from "react";
import { getFortressSound } from "./player";

/** 결과 화면 배경음(D-025 보충 6) — 화면에 있는 동안만. 설정의 배경음이 꺼져 있으면 울리지 않는다 */
export function useResultMusic(): void {
  useEffect(() => {
    const sound = getFortressSound();
    sound.setMusic("result");
    return () => sound.setMusic(null);
  }, []);
}
