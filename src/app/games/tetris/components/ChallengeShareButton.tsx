"use client";

import { useState } from "react";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import type { ScoreSummary, TetrisScoreDetail } from "@/types/game";
import { buildChallengeShareContent } from "../lib/challenge";

type Props = {
  /** 도전장의 원본 기록 — 링크·문구가 원본 기준 */
  original: ScoreSummary<TetrisScoreDetail>;
  /** 도전한 뒤 다시 공유하면 내 점수도 문구에 */
  myScore?: number | null;
  /** 버튼 문구 — 리플레이 화면 "도전장 보내기", 결과 화면 "도전장 다시 보내기" */
  label: string;
  className?: string;
};

/** 테트리스 도전장 공유 (games-growth B2) — 공용 공유 메뉴(카톡·기본 공유·링크 복사)에 도전장 링크 */
export function ChallengeShareButton({ original, myScore = null, label, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const { kakao, kakaoScript } = useKakaoReady();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-testid="challenge-share"
        className={`min-h-11 rounded-full bg-gradient-to-r from-rose-500 to-amber-400 px-4 text-sm font-bold text-white shadow-lg shadow-rose-500/30 hover:brightness-110 ${className}`}
      >
        ⚔️ {label}
      </button>
      {kakaoScript}
      {open && <ShareMenu content={buildChallengeShareContent(original, myScore)} kakao={kakao} onClose={() => setOpen(false)} />}
    </>
  );
}
