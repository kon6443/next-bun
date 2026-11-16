"use client";

import { type ReactNode, useState } from "react";
import { useKakaoReady } from "../hooks/useKakaoReady";
import type { ShareContent } from "../lib/shareSpec";
import { ShareMenu } from "./ShareMenu";

type Props = {
  /** 공유할 내용 — 메뉴를 열 때 쓴다 */
  content: ShareContent;
  /** 메뉴 제목·복사 안내에 쓰는 이름(기본 "리플레이") */
  subject?: string;
  className: string;
  testId?: string;
  children: ReactNode;
};

/**
 * 공유 버튼 + 공용 공유 메뉴(카톡·기본 공유·링크 복사) — 버튼이 있는 화면에서만 카카오 SDK를 늦게 불러온다
 * 화면마다 같은 조립(열림 상태·useKakaoReady·kakaoScript·ShareMenu)을 반복하지 않게 모았다
 */
export function ShareMenuButton({ content, subject, className, testId, children }: Props) {
  const [open, setOpen] = useState(false);
  const { kakao, kakaoScript } = useKakaoReady();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className} data-testid={testId}>
        {children}
      </button>
      {kakaoScript}
      {open ? <ShareMenu content={content} kakao={kakao} subject={subject} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
