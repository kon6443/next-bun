"use client";

import type { ReplayPayload } from "@/types/game";
import { ScoreSubmitPanel } from "@/app/games/_shared/components/ScoreSubmitPanel";
import { ResultShareButton } from "@/app/games/_shared/components/ResultShareButton";
import { formatFrames } from "@/app/games/_shared/lib/format";
import { TETRIS_GAME } from "../lib/game";
import { TETRIS_SHARE } from "../lib/share";

export type GameResult = {
  score: number;
  lines: number;
  level: number;
  frames: number;
  isNewBest: boolean;
};

type GameOverPanelProps = {
  result: GameResult;
  replay: ReplayPayload;
  /** 세션이 없으면(발급 실패) 등록할 수 없다 */
  sessionId: string | null;
  sessionError: string | null;
  accessToken?: string;
  defaultName: string;
  onRestart: () => void;
};

/** 테트리스 게임 오버 — 공용 등록 패널 + 줄·레벨·시간, 등록 뒤 기록 공유(상위권·개인 최고면 자랑 문구) */
export function GameOverPanel({ result, ...rest }: GameOverPanelProps) {
  return (
    <ScoreSubmitPanel
      game={TETRIS_GAME}
      score={result.score}
      isNewBest={result.isNewBest}
      stats={
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-slate-500">줄</dt>
            <dd className="font-semibold text-slate-200">{result.lines}</dd>
          </div>
          <div>
            <dt className="text-slate-500">레벨</dt>
            <dd className="font-semibold text-slate-200">{result.level}</dd>
          </div>
          <div>
            <dt className="text-slate-500">시간</dt>
            <dd className="font-semibold text-slate-200">{formatFrames(result.frames)}</dd>
          </div>
        </dl>
      }
      registeredActions={(registered, playerName, brag) => (
        <ResultShareButton spec={TETRIS_SHARE} subject={{ scoreId: registered.scoreId, playerName, score: registered.score, detail: registered.detail }} brag={brag} />
      )}
      {...rest}
    />
  );
}
