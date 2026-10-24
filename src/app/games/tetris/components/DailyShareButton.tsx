"use client";

import toast from "react-hot-toast";
import { absoluteUrl } from "@/app/games/_shared/lib/shareSpec";
import { canWebShare, copyText, webShare } from "@/app/games/_shared/lib/share";
import { DAILY_PLAY_PATH, dailyShareText, loadDailyFirstRun } from "../lib/daily";

/**
 * 오늘의 테트리스 결과 공유 — Wordle처럼 짧은 결과 문구 + 오늘의 테트리스 링크(리플레이는 다음 날 공개라 플레이 링크)
 * 문구는 이 기기의 오늘 첫 판 기준. 복사가 안 되는 환경이면 기기 공유 시트로
 */
export function DailyShareButton({ boardKey, className = "" }: { boardKey: string; className?: string }) {
  const share = async () => {
    const first = loadDailyFirstRun(boardKey);
    if (!first) {
      toast.error("공유할 오늘 첫 판 기록이 없어요.");
      return;
    }
    const text = dailyShareText(first, absoluteUrl(DAILY_PLAY_PATH));
    if ((await copyText(text)) === "copied") {
      toast.success("오늘 결과를 복사했어요. 친구에게 붙여넣어 보세요!");
      return;
    }
    if (canWebShare() && (await webShare({ text })) !== "failed") return;
    toast.error("복사하지 못했어요.");
  };
  return (
    <button
      type="button"
      onClick={share}
      data-testid="daily-share"
      className={`min-h-11 w-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:brightness-110 ${className}`}
    >
      🟩 오늘 결과 공유하기
    </button>
  );
}
