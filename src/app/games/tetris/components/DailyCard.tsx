"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SettingsSheet } from "@/app/components/SettingsSheet";
import { getGameBoards } from "@/services/gameService";
import { formatScore } from "@/app/games/_shared/lib/format";
import { DAILY_PLAY_PATH, type DailyFirstRun, dailyBoards, dailyDateLabel, loadDailyFirstRun } from "../lib/daily";
import { DailyShareButton } from "./DailyShareButton";

/**
 * "오늘의 테트리스" (games-growth B1) — 테트리스 홈 첫 줄, 게임 시작 옆의 보조 타일(tetris-home D-003: 시작·데일리 나란히)
 * 오늘 데일리 보드가 있을 때만(서버 비밀값이 없으면 숨김 — 그러면 게임 시작이 줄을 다 쓴다)
 * - 첫 판 전: 타일 = 도전하기 링크
 * - 첫 판 뒤: 타일에 요약("오늘 N위 · 다시 ›"), 누르면 시트에서 다시 도전·오늘 순위·결과 공유 — 세 동작이 타일 한 칸에 들어가지 않아서
 * 테두리형 보조 톤 — 채움 버튼은 게임 시작 하나
 */
export function DailyCard({ className = "" }: { className?: string }) {
  const [boardKey, setBoardKey] = useState<string | null>(null);
  /** 보드를 받는 중 — 그동안 타일 자리를 잡아 둔다(늦게 나타나 게임 시작 타일이 줄어드는 가로 밀림이 없게). 보드가 없거나 실패면 자리를 뺀다 */
  const [loading, setLoading] = useState(true);
  const [first, setFirst] = useState<DailyFirstRun | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const tileRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let cancelled = false;
    getGameBoards("tetris")
      .then(({ data }) => {
        if (cancelled) return;
        const today = dailyBoards(data.items).find((board) => board.current);
        if (today) {
          setBoardKey(today.boardKey);
          setFirst(loadDailyFirstRun(today.boardKey));
        }
        setLoading(false);
      })
      // 보드 목록을 못 받으면 타일을 숨긴다 — 홈의 다른 영역은 그대로
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const tileClass = `flex min-h-20 flex-col justify-center rounded-3xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-left leading-tight hover:bg-emerald-500/15 ${className}`;
  if (!boardKey) return loading ? <div aria-hidden="true" className={`${tileClass} opacity-40`} data-testid="tetris-daily-placeholder" /> : null;
  const date = dailyDateLabel(boardKey);

  if (!first) {
    return (
      <Link href={DAILY_PLAY_PATH} className={tileClass} data-testid="tetris-daily" aria-label={`오늘의 테트리스 ${date} 도전하기`}>
        <span className="text-sm font-bold text-white">오늘의 테트리스</span>
        <span className="mt-1 text-xs text-emerald-200">
          {date} · 도전<span aria-hidden="true">&nbsp;›</span>
        </span>
      </Link>
    );
  }

  const summary = first.rank ? `오늘 ${first.rank}위` : `${formatScore(first.score)}점`;
  // 마우스·터치로 연 시트는 버튼에 포커스가 없을 수 있다 — 닫을 때 포커스가 body로 빠지면 타일로(대화상자 복원 보완)
  const close = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) tileRef.current?.focus();
    });
  };
  return (
    <>
      <button
        ref={tileRef}
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-label={`오늘의 테트리스 ${summary} — 다시 도전·오늘 순위·공유`}
        className={tileClass}
        data-testid="tetris-daily"
      >
        <span className="text-sm font-bold text-white">오늘의 테트리스</span>
        <span className="mt-1 text-xs text-emerald-200" data-testid="tetris-daily-summary">
          {summary} · 다시<span aria-hidden="true">&nbsp;›</span>
        </span>
      </button>
      {menuOpen && (
        <SettingsSheet title={`오늘의 테트리스 · ${date}`} onClose={close} testId="tetris-daily-menu">
          <p className="text-sm text-slate-300" data-testid="tetris-daily-first">
            오늘 첫 판 <span className="font-bold text-white">{formatScore(first.score)}점</span>
            {first.rank ? ` · ${first.rank}위` : ""}
          </p>
          <div className="mt-3 grid gap-2">
            <Link href={DAILY_PLAY_PATH} className={MENU_PRIMARY}>
              다시 도전
            </Link>
            <Link href={`/games/tetris/rankings?board=${boardKey}`} className={MENU_SECONDARY}>
              오늘 순위
            </Link>
            <DailyShareButton boardKey={boardKey} compact />
          </div>
        </SettingsSheet>
      )}
    </>
  );
}

const MENU_PRIMARY = "flex min-h-11 items-center justify-center rounded-full border border-emerald-300/50 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/10";
const MENU_SECONDARY = "flex min-h-11 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-slate-200 hover:border-white/40";
