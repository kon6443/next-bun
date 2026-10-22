"use client";

import { useState } from "react";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import { useMatchPublished } from "../hooks/useMatchPublished";
import { battleMatchPath, buildBattleShareContent } from "../lib/battleShare";

const linkStyles =
  "flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/15 px-3 text-sm font-semibold text-slate-200 hover:border-white/30";

/**
 * 결과 화면의 "기록 보기·공유" (DESIGN §18 진입점) — 경기가 저장(공개)되면 활성
 * 기록 보기는 새 탭으로 연다 — 이 화면을 떠나면 방 소켓이 끊겨 방에서 나가게 되므로
 */
export function MatchRecordLinks({ matchId }: { matchId: string }) {
  const published = useMatchPublished(matchId, true);
  const [shareOpen, setShareOpen] = useState(false);
  const { kakaoReady, kakaoScript } = useKakaoReady();

  if (published.status === "unavailable") {
    return <p className="mt-2 text-center text-xs text-slate-500">이 경기는 기록 보기를 열 수 없어요.</p>;
  }

  if (published.status !== "ready") {
    return (
      <div className="mt-2 flex gap-2" role="status">
        <span aria-disabled="true" className={`${linkStyles} cursor-default opacity-50`}>
          경기 저장 중…
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <a href={battleMatchPath(matchId)} target="_blank" rel="noopener noreferrer" className={linkStyles}>
        기록 보기
        <span className="sr-only"> (새 탭)</span>
      </a>
      <button type="button" onClick={() => setShareOpen(true)} aria-haspopup="dialog" className={linkStyles}>
        공유
      </button>
      {kakaoScript}
      {shareOpen && (
        <ShareMenu content={buildBattleShareContent(published.match)} kakaoReady={kakaoReady} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
