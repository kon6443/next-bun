"use client";

import { useState } from "react";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import { type ShareSubject, buildShareContent } from "@/app/games/_shared/lib/shareSpec";
import type { GenericScoreDetail } from "@/types/game";
import { DEFENSE_SHARE } from "../lib/defenseShare";

/**
 * 디펜스 기록 공유 (defense DESIGN §F11) — 공용 공유 메뉴(카톡·기본 공유·링크 복사)
 * 진입점: 서버 기록 재생기 · 등록 직후 결과 화면. 카카오 SDK는 이 버튼이 있는 화면에서만 늦게 로드
 */
type Props = {
  subject: ShareSubject<GenericScoreDetail>;
  /** 결과 화면처럼 넓은 버튼("이 기록 공유하기")인가 — 기본은 머리줄 아이콘 */
  wide?: boolean;
};

export function DefenseShareButton({ subject, wide = false }: Props) {
  const [open, setOpen] = useState(false);
  const { kakaoReady, kakaoScript } = useKakaoReady();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={wide ? undefined : "리플레이 공유"}
        aria-haspopup="dialog"
        data-testid="defense-share"
        className={
          wide
            ? "min-h-11 w-full rounded-full border border-white/20 text-sm font-semibold text-slate-100"
            : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-slate-300 hover:text-white"
        }
      >
        {wide ? (
          "이 기록 공유하기"
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
        )}
      </button>
      {kakaoScript}
      {open && <ShareMenu content={buildShareContent(DEFENSE_SHARE, subject)} kakaoReady={kakaoReady} onClose={() => setOpen(false)} />}
    </>
  );
}
