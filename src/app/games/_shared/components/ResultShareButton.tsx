"use client";

import { useState } from "react";
import { ShareMenu } from "./ShareMenu";
import { useKakaoReady } from "../hooks/useKakaoReady";
import { type ReplayShareSpec, type ShareSubject, buildShareContent } from "../lib/shareSpec";

type Props<D> = {
  spec: ReplayShareSpec<D>;
  subject: ShareSubject<D>;
  /** 자랑 문구(bragLabel) — 있으면 버튼을 강조하고 이 문구로, 없으면 평소 버튼 */
  brag: string | null;
};

/**
 * 등록 직후 결과 화면의 기록 공유 — 공용 공유 메뉴(카톡·기본 공유·링크 복사)
 * 상위권·개인 최고면 눈에 띄는 버튼과 자랑 문구로 공유를 권한다 (games-growth B3)
 */
export function ResultShareButton<D>({ spec, subject, brag }: Props<D>) {
  const [open, setOpen] = useState(false);
  const { kakao, kakaoScript } = useKakaoReady();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-testid="result-share"
        data-brag={brag ? "true" : undefined}
        className={
          brag
            ? "min-h-11 w-full rounded-full bg-gradient-to-r from-amber-400 to-pink-500 text-sm font-bold text-white shadow-lg shadow-amber-500/30 hover:brightness-110"
            : "min-h-11 w-full rounded-full border border-white/20 text-sm font-semibold text-slate-100"
        }
      >
        {brag ?? "이 기록 공유하기"}
      </button>
      {kakaoScript}
      {open && <ShareMenu content={buildShareContent(spec, subject)} kakao={kakao} onClose={() => setOpen(false)} />}
    </>
  );
}
