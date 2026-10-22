"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { Button } from "@/app/teams/components";
import type { MatchResultEntry } from "@/types/tetrisBattleSocket";
import { useBattleSocket } from "../contexts/BattleSocketContext";
import type { MatchPhase, OpponentState, ReplaySubmitState } from "../hooks/useBattleMatch";
import type { ReplaySubmitStatus } from "../lib/replaySubmit";
import type { useBattlePlay } from "../hooks/useBattlePlay";
import { battleErrorMessage } from "../lib/battleErrors";
import { BattleView } from "./BattleView";
import { MatchRecordLinks } from "./MatchRecordLinks";

type MatchScreenProps = {
  phase: MatchPhase;
  play: ReturnType<typeof useBattlePlay>;
  myPlayerId: string;
  isHost: boolean;
  opponents: OpponentState[];
  targetId: string | null;
  myKos: number;
  replaySubmit: ReplaySubmitState | null;
  trailsRootRef: React.RefObject<HTMLDivElement | null>;
  onExit: () => void;
};

/**
 * 대전 화면 — 카운트다운 · 플레이 · 탈락 후 관전 · 결과(방장 재대결)
 */
export function MatchScreen({
  phase,
  play,
  myPlayerId,
  isHost,
  opponents,
  targetId,
  myKos,
  replaySubmit,
  trailsRootRef,
  onExit,
}: MatchScreenProps) {
  const { emotes, sendEmote, rematch } = useBattleSocket();
  const [confirmExit, setConfirmExit] = useState(false);
  // 경기 중 나가기는 기권(되돌릴 수 없음) — 확인을 받는다
  const inGame = phase.kind === "countdown" || phase.kind === "playing";
  const requestExit = () => (inGame ? setConfirmExit(true) : onExit());
  // 대상은 lock 응답(targetId)으로 정해진다 — 그 전이라도 살아 있는 상대가 한 명뿐이면 그 사람이 대상이다
  const alive = opponents.filter((o) => o.place === null);
  const target = targetId ?? (alive.length === 1 ? alive[0].playerId : null);

  const overlay =
    phase.kind === "countdown" ? (
      <Countdown startsAt={phase.startsAt} />
    ) : phase.kind === "out" ? (
      <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center" role="status">
        <p className="rounded-2xl border border-white/10 bg-slate-950/85 px-5 py-3 text-center text-sm text-slate-200">
          <strong className="block text-2xl font-black text-white">{phase.place ? `${phase.place}위` : "탈락"}</strong>
          남은 경기를 보고 있어요
        </p>
      </div>
    ) : phase.kind === "ended" ? (
      <MatchResults
        matchId={phase.matchId}
        results={phase.results}
        myPlayerId={myPlayerId}
        isHost={isHost}
        submitStatus={replaySubmit && replaySubmit.matchId === phase.matchId ? replaySubmit.status : null}
        onRematch={rematch}
        onExit={onExit}
      />
    ) : phase.kind === "unavailable" ? (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 p-4" role="status">
        <p className="max-w-xs text-center text-sm text-slate-200">
          {phase.forfeited ? "새로고침으로 이번 판은 기권했어요. " : "진행 중인 게임이에요. "}
          이 판이 끝나면 다음 판에 함께할 수 있어요.
        </p>
      </div>
    ) : null;

  return (
    <>
    <BattleView
      play={play}
      meId={myPlayerId}
      opponents={opponents.map((o) => ({ ...o, isTarget: o.playerId === target }))}
      emotes={emotes}
      trailsRootRef={trailsRootRef}
      onEmote={(id) => void sendEmote(id)}
      onExit={requestExit}
      overlay={
        <>
          {myKos > 0 && (
            <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-amber-500/20 px-2 py-1 text-xs font-bold text-amber-200">
              KO {myKos}
            </span>
          )}
          {overlay}
        </>
      }
    />
    <ConfirmModal
      isOpen={confirmExit}
      onClose={() => setConfirmExit(false)}
      onConfirm={() => {
        setConfirmExit(false);
        onExit();
      }}
      title="경기를 나갈까요?"
      message="지금 나가면 이번 판은 기권으로 처리돼요."
      confirmLabel="기권하고 나가기"
      cancelLabel="계속하기"
      variant="danger"
    />
    </>
  );
}

/** 시작까지 남은 초 — 수신 시각 + startInMs 기준(performance.now) */
function Countdown({ startsAt }: { startsAt: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(1, Math.ceil((startsAt - now) / 1000));
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50" role="status" aria-label={`${seconds}초 뒤 시작`}>
      <span className="text-6xl font-black text-white">{seconds}</span>
    </div>
  );
}

/** 기록 제출 상태 — 경기 결과보다 눈에 띄지 않게 한 줄로 (DESIGN §17-1) */
const SUBMIT_LABELS: Record<ReplaySubmitStatus, { text: string; tone: string }> = {
  submitting: { text: "기록 저장 중…", tone: "text-slate-500" },
  saved: { text: "기록 저장됨", tone: "text-emerald-300/80" },
  invalid: { text: "기록 검증 실패", tone: "text-amber-300/80" },
  expired: { text: "기록 저장 시간이 지났어요", tone: "text-slate-500" },
  failed: { text: "기록을 저장하지 못했어요", tone: "text-slate-500" },
};

type MatchResultsProps = {
  matchId: string | null;
  results: MatchResultEntry[];
  myPlayerId: string;
  isHost: boolean;
  /** 이 기기에서 이 경기 기록을 제출했을 때만 */
  submitStatus: ReplaySubmitStatus | null;
  onRematch: () => Promise<{ ok: true } | { ok: false; code: string }>;
  onExit: () => void;
};

/** 결과 — 순위·KO·보낸/받은 줄·블록·최대 콤보, 방장은 재대결 */
function MatchResults({ matchId, results, myPlayerId, isHost, submitStatus, onRematch, onExit }: MatchResultsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mine = results.find((r) => r.playerId === myPlayerId);

  const rematch = async () => {
    setPending(true);
    const result = await onRematch();
    setPending(false);
    setError(result.ok ? null : battleErrorMessage(result.code));
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4" style={{ touchAction: "auto" }}>
      <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-5" aria-labelledby="battle-result-title">
        <p className="text-center text-xs font-semibold tracking-[0.3em] text-slate-400">RESULT</p>
        <h2 id="battle-result-title" className="mt-1 text-center text-3xl font-black text-white">
          {mine ? (mine.place === 1 ? "1위!" : `${mine.place}위`) : "경기 종료"}
        </h2>
        {results.length === 0 && (
          <p className="mt-3 text-center text-sm text-slate-400">연결이 끊긴 사이 경기가 끝나 결과를 받지 못했어요.</p>
        )}
        {results.length > 0 && (
        <table className="mt-4 w-full text-left text-xs tabular-nums text-slate-300">
          <thead className="text-slate-500">
            <tr>
              <th scope="col" className="py-1 font-normal">순위</th>
              <th scope="col" className="py-1 font-normal">이름</th>
              <th scope="col" className="py-1 text-right font-normal">KO</th>
              <th scope="col" className="py-1 text-right font-normal">보낸 줄</th>
              <th scope="col" className="py-1 text-right font-normal">최대 콤보</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.playerId} className={r.playerId === myPlayerId ? "text-sky-200" : ""}>
                <td className="py-1">{r.place}</td>
                <td className="max-w-[7rem] truncate py-1">{r.name}</td>
                <td className="py-1 text-right">{r.kos}</td>
                <td className="py-1 text-right">{r.sent}</td>
                <td className="py-1 text-right">{r.maxCombo}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
        {isHost ? (
          <Button type="button" size="md" fullWidth className="mt-5 min-h-11" onClick={rematch} disabled={pending}>
            재대결
          </Button>
        ) : (
          <p className="mt-5 text-center text-xs text-slate-400">방장이 재대결을 누르면 대기실로 돌아가요.</p>
        )}
        <Button type="button" variant="secondary" size="md" fullWidth className="mt-2 min-h-11" onClick={onExit}>
          나가기
        </Button>
        {submitStatus && (
          <p className={`mt-3 text-center text-xs ${SUBMIT_LABELS[submitStatus].tone}`} role="status">
            {SUBMIT_LABELS[submitStatus].text}
          </p>
        )}
        {/* 내 기록이 저장됐을 때만 — 경기 전체가 저장(공개)될 때까지 기다린 뒤 연다 */}
        {submitStatus === "saved" && matchId && <MatchRecordLinks matchId={matchId} />}
        {error && (
          <p role="alert" className="mt-2 text-center text-sm text-rose-300">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
