"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ENGINE_VERSION } from "../engine/constants";
import { useDefenseSettings } from "../hooks/useDefenseSettings";
import { parseBoardKey, playPath } from "../lib/campaign";
import { DIFFICULTY_NAMES } from "../lib/labels";
import { boardTitle, modeOfBoardKey } from "../lib/rankedBoards";
import { type ResumeSlot, loadResume } from "../lib/resume";
import { PendingSubmitCard } from "./PendingSubmitCard";
import { SettingsPanel } from "./SettingsPanel";

/**
 * 허브 보조 동작 — 하던 판 이어하기(§F9b) · 도감 · 설정
 * 이어하기 카드는 저장본이 있고 엔진 버전이 같을 때만(다르면 다시 돌릴 수 없다) — 캠페인은 스테이지 판, 무한·주간은 그 모드 입구로
 */

/** 이어하기 저장본 → 갈 곳·표기 (해석할 수 없는 저장본은 null — 카드를 숨긴다) */
function resumeTarget(slot: ResumeSlot): { href: string; label: string } | null {
  if (slot.mode === "endless" || slot.mode === "weekly") {
    return modeOfBoardKey(slot.boardKey) === slot.mode ? { href: `/games/defense/play/${slot.mode}`, label: boardTitle(slot.boardKey) } : null;
  }
  const parsed = parseBoardKey(slot.boardKey);
  return parsed ? { href: playPath(parsed.stage.id, parsed.difficulty), label: `스테이지 ${parsed.stage.number} ${DIFFICULTY_NAMES[parsed.difficulty]}` } : null;
}
export function HubActions() {
  const [resume, setResume] = useState<ResumeSlot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, update } = useDefenseSettings();
  useEffect(() => {
    const slot = loadResume();
    setResume(slot && slot.engineVersion === ENGINE_VERSION && resumeTarget(slot) ? slot : null);
  }, []);
  const target = resume ? resumeTarget(resume) : null;
  return (
    <>
      <PendingSubmitCard />
      {target && (
        <Link
          href={target.href}
          data-testid="defense-hub-resume"
          className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 px-4 font-semibold text-white shadow-lg shadow-rose-500/30"
        >
          <span>하던 판 이어하기</span>
          <span className="text-sm opacity-90">{target.label}</span>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/games/defense/codex" data-testid="defense-codex-link" className="flex min-h-11 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-slate-200">
          도감
        </Link>
        <button
          type="button"
          data-testid="defense-settings-open"
          onClick={() => setSettingsOpen(true)}
          className="min-h-11 rounded-full border border-white/20 text-sm font-semibold text-slate-200"
        >
          설정
        </button>
      </div>
      <SettingsPanel open={settingsOpen} settings={settings} onChange={update} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
