"use client";

import { useEffect, useState } from "react";
import { createNavAutoHide } from "./navAutoHide";

/** 크기가 바뀐 뒤 이 시간 동안의 스크롤은 사용자가 움직인 것이 아니라고 본다(키보드가 열리며 입력칸을 보이게 밀어 올리는 스크롤 등) */
const RESIZE_SETTLE_MS = 300;

/**
 * 창 스크롤 방향으로 하단 내비를 숨긴다 — 숨기면 true(판정은 navAutoHide)
 * - 스크롤은 프레임당 한 번만 읽는다(rAF), passive 리스너
 * - 창 크기(키보드·주소창·회전) 바뀜: 기준점만 옮기고 잠시 스크롤을 세지 않는다 — 가짜 이동량으로 숨거나 튀어나오지 않게(끝에 닿으면 보인다)
 * - resetKey(경로)가 바뀌면 새로 시작 — 새 화면은 보이는 상태로. 뒤로 가기의 스크롤 복원 점프도 같은 방식으로 세지 않는다
 * - 창이 아니라 안쪽 상자가 스크롤되는 화면은 창 스크롤이 없어 늘 보인다(지금과 같다)
 */
export function useNavAutoHide(resetKey: string): boolean {
  const [hidden, setHidden] = useState(false);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    // 새 화면의 첫 그림부터 보이게 — effect(페인트 뒤)까지 이전 화면의 숨김이 한 프레임 남지 않게
    setKey(resetKey);
    setHidden(false);
  }

  useEffect(() => {
    const auto = createNavAutoHide();
    let frame = 0;
    let settleUntil = 0;
    const read = () => ({ y: window.scrollY, viewport: window.innerHeight, document: document.documentElement.scrollHeight });

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const sample = read();
        setHidden(performance.now() < settleUntil ? auto.settle(sample) : auto.update(sample));
      });
    };
    const onResize = () => {
      settleUntil = performance.now() + RESIZE_SETTLE_MS;
      setHidden(auto.settle(read()));
    };

    setHidden(false);
    // 새 화면 — 뒤로 가기 스크롤 복원처럼 곧바로 오는 점프는 세지 않는다
    settleUntil = performance.now() + RESIZE_SETTLE_MS;
    auto.settle(read());
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [resetKey]);

  return hidden;
}
