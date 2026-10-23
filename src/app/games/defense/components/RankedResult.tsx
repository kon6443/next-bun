"use client";

import { ScoreSubmitPanel } from "@/app/games/_shared/components/ScoreSubmitPanel";
import type { RankingPeriod } from "@/types/game";
import { ENGINE_VERSION, TICKS_PER_SECOND } from "../engine";
import type { PlayResult } from "../hooks/useDefensePlay";
import { DEFENSE_GAME, REPLAY_PLAYER_READY } from "../lib/defenseGame";
import { ENEMY_NAMES } from "../lib/labels";

/**
 * 무한·주간 게임 오버 (defense DESIGN §F7) — 공용 등록 패널(점수·예상 순위·이름·등록·대기 제출 보관) + 디펜스 요약
 * 요약: 도달 웨이브·처치·시간 · 실패 원인(가장 많이 샌 적·웨이브, §F0-3)
 */
type Props = {
  title: string;
  result: PlayResult;
  /** 엔진 scoreOf — 점수·클리어한 웨이브 */
  score: number;
  wave: number;
  kills: number;
  boardKey: string;
  weekly: boolean;
  isNewBest: boolean;
  /** 등록할 세션 — 없으면(발급 실패·만료·로컬 판) sessionError를 안내 */
  sessionId: string | null;
  sessionError: string | null;
  accessToken?: string;
  defaultName: string;
  onRetry: () => void;
};

/** 주간 보드는 보드 자체가 1주 — 순위는 보드 전체 하나(daily·weekly·all이 같은 값) */
const WEEKLY_PERIODS: readonly { key: RankingPeriod; label: string }[] = [{ key: "all", label: "이번 주 순위" }];

function formatTicks(ticks: number): string {
  const total = Math.floor(ticks / TICKS_PER_SECOND);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function RankedResult({ title, result, score, wave, kills, boardKey, weekly, isNewBest, sessionId, sessionError, accessToken, defaultName, onRetry }: Props) {
  let worstEnemy = -1;
  result.leakedLivesByEnemy.forEach((lives, kind) => {
    if ((lives ?? 0) > (result.leakedLivesByEnemy[worstEnemy] ?? 0)) worstEnemy = kind;
  });
  const stats = (
    <div className="mt-3">
      <p className="text-xs text-slate-400">{title}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-slate-800/60 p-2">
          <dt className="text-xs text-slate-400">웨이브</dt>
          <dd className="font-semibold tabular-nums text-white" data-testid="defense-result-wave">
            {wave}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-2">
          <dt className="text-xs text-slate-400">처치</dt>
          <dd className="font-semibold tabular-nums text-white">{kills}</dd>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-2">
          <dt className="text-xs text-slate-400">시간</dt>
          <dd className="font-semibold tabular-nums text-white">{formatTicks(result.endTick)}</dd>
        </div>
      </dl>
      {!result.victory && worstEnemy >= 0 && (
        <p className="mt-2 text-sm text-slate-300" data-testid="defense-result-cause">
          가장 많이 샌 적은 {ENEMY_NAMES[worstEnemy]}
          {result.worstWave > 0 && <>, 웨이브 {result.worstWave}에서 가장 많이 샜어요</>}
        </p>
      )}
    </div>
  );
  return (
    <div className="absolute inset-0 z-20 flex overflow-y-auto bg-slate-950/85 p-4" data-testid="defense-ranked-result" data-wave={wave}>
      <div className="m-auto w-full max-w-sm" role="dialog" aria-modal="true" aria-label={`${title} 결과`}>
        <ScoreSubmitPanel
          game={DEFENSE_GAME}
          score={score}
          isNewBest={isNewBest}
          stats={stats}
          // 제출 리플레이 = 엔진 buildReplay와 같은 값(frames = 끝난 틱)
          replay={{ engineVersion: ENGINE_VERSION, frames: result.endTick, inputs: result.inputs }}
          board={boardKey}
          periods={weekly ? WEEKLY_PERIODS : undefined}
          // 진행 중인 주간 보드는 서버가 리플레이를 주가 끝날 때까지 막는다(D-027)
          showReplay={REPLAY_PLAYER_READY && !weekly}
          sessionId={sessionId}
          sessionError={sessionError}
          accessToken={accessToken}
          defaultName={defaultName}
          onRestart={onRetry}
        />
      </div>
    </div>
  );
}
