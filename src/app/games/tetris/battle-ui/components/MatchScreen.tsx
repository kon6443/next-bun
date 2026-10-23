"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { Button } from "@/app/teams/components";
import { type MatchResultEntry, type RoomPlayer, type RoomStatus, TetrisBattleErrorCodes } from "@/types/tetrisBattleSocket";
import { type ConnectionStatus, useBattleSocket } from "../contexts/BattleSocketContext";
import type { MatchPhase, OpponentState, ReplaySubmitState } from "../hooks/useBattleMatch";
import type { ReplaySubmitStatus } from "../lib/replaySubmit";
import type { useBattlePlay } from "../hooks/useBattlePlay";
import { battleErrorMessage } from "../lib/battleErrors";
import { BattleView } from "./BattleView";
import { useReducedEffects } from "../../hooks/useReducedEffects";
import fx from "./battleFx.module.css";
import { getSoundPlayer } from "../../lib/sound/soundPlayer";
import { MatchRecordLinks } from "./MatchRecordLinks";
import { ChatPanel } from "./ChatPanel";
import { ChatTicker } from "./ChatTicker";
import { ConnectionBadge } from "./ConnectionBadge";

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
  /** 지금 방 참가자 — 상대 접속 표시·결과 화면 내보내기 대상 */
  roomPlayers: RoomPlayer[];
  roomStatus: RoomStatus;
  /** 대전 서버 연결 — 경기 중 끊기면 판 위에 알리고, 자동 재시도가 끝나면 다시 연결 버튼을 준다 (games-polish FE-01) */
  connection: ConnectionStatus;
  onReconnect: () => void;
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
  roomPlayers,
  roomStatus,
  connection,
  onReconnect,
  onExit,
}: MatchScreenProps) {
  const reduced = useReducedEffects();
  const { emotes, sendEmote, rematch, kickPlayer, chat, sendChat } = useBattleSocket();
  // 경기 중 채팅(D-016) — 탈락·관전 중에는 입력까지, 살아 있는 동안은 판을 가리지 않는 자막만
  const spectating = phase.kind === "out" || phase.kind === "unavailable";
  const inPlay = phase.kind === "countdown" || phase.kind === "playing";

  // 결과 화면에서 방장이 내보낼 수 있는 사람 — 지금 방에 있는 다른 참가자 (D-011, 경기 중에는 안 된다)
  const kickable = isHost && roomStatus !== "PLAYING" ? new Set(roomPlayers.filter((p) => p.playerId !== myPlayerId).map((p) => p.playerId)) : null;
  const [confirmExit, setConfirmExit] = useState(false);
  // 경기 중 나가기는 기권(되돌릴 수 없음) — 확인을 받는다
  const inGame = phase.kind === "countdown" || phase.kind === "playing";
  const requestExit = () => (inGame ? setConfirmExit(true) : onExit());
  // 대상은 lock 응답(targetId)으로 정해진다 — 그 전이라도 살아 있는 상대가 한 명뿐이면 그 사람이 대상이다
  const alive = opponents.filter((o) => o.place === null && !o.out);
  const target = targetId ?? (alive.length === 1 ? alive[0].playerId : null);
  // 미니보드 props — 채팅·이모트 등 다른 변경에는 같은 객체를 넘겨 memo된 판이 다시 그려지지 않게 (FE-19)
  // 방에 없으면(나갔거나 정리됨) 오프라인으로 보인다
  const opponentViews = useMemo(() => {
    const online = new Map(roomPlayers.map((p) => [p.playerId, p.connected]));
    return opponents.map((o) => ({ ...o, isTarget: o.playerId === target, online: online.get(o.playerId) ?? false }));
  }, [opponents, target, roomPlayers]);

  const overlay =
    phase.kind === "countdown" ? (
      <Countdown startsAt={phase.startsAt} />
    ) : phase.kind === "out" ? (
      <>
        {/* 내 판 KO 폭발 — 탈락 순간 한 번 (연출 줄이기면 없음) */}
        {!reduced && <span className={fx.koBurst} aria-hidden="true" />}
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center" role="status">
          <p className="rounded-2xl border border-white/10 bg-slate-950/85 px-5 py-3 text-center text-sm text-slate-200">
            <strong className="block text-2xl font-black text-white">{phase.place ? `${phase.place}위` : "탈락"}</strong>
            남은 경기를 보고 있어요
          </p>
        </div>
      </>
    ) : phase.kind === "ended" ? (
      <MatchResults
        matchId={phase.matchId}
        results={phase.results}
        myPlayerId={myPlayerId}
        isHost={isHost}
        submitStatus={replaySubmit && replaySubmit.matchId === phase.matchId ? replaySubmit.status : null}
        onRematch={rematch}
        kickable={kickable}
        onKick={kickPlayer}
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
      opponents={opponentViews}
      emotes={emotes}
      trailsRootRef={trailsRootRef}
      onEmote={(id) => void sendEmote(id)}
      onExit={requestExit}
      // 내 판이 끝나 관전 중일 때만 상대 판을 크게 볼 수 있다 (FE-28)
      canEnlarge={spectating}
      footer={
        spectating ? (
          <ChatPanel
            compact
            messages={chat}
            myPlayerId={myPlayerId}
            enabled
            onSend={async (text) => {
              const result = await sendChat(text);
              if (result.ok) return null;
              // 탈락 직후 내 topOut이 서버에 닿기 전이면 아직 살아 있는 것으로 거절된다 — 잠깐 뒤 다시
              return result.code === TetrisBattleErrorCodes.MATCH_ALREADY_STARTED
                ? "탈락이 아직 반영되지 않았어요. 잠시 후 다시 보내 주세요."
                : battleErrorMessage(result.code);
            }}
          />
        ) : null
      }
      overlay={
        <>
          {inPlay && <ChatTicker messages={chat} />}
          {/* 끊긴 동안 판은 이 기기에서만 진행되고 보고는 쌓인다 — 모르고 두지 않게 알린다(결과 화면 위에도) */}
          {connection !== "connected" && (
            <div className="absolute inset-x-0 top-2 z-30 flex justify-center">
              <ConnectionBadge status={connection} onReconnect={onReconnect} />
            </div>
          )}
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
  const reduced = useReducedEffects();
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(1, Math.ceil((startsAt - now) / 1000));
  // 초가 바뀔 때마다 비프 (GO는 실제로 경기가 시작될 때 useBattleMatch가 낸다)
  useEffect(() => {
    getSoundPlayer().play({ kind: "countdown", value: seconds });
  }, [seconds]);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50" role="status" aria-label={`${seconds}초 뒤 시작`}>
      {/* key로 초마다 다시 튀어나오게 — 연출 줄이기면 정적 */}
      <span key={seconds} className={`text-7xl font-black text-white ${reduced ? "" : fx.countdown}`}>
        {seconds}
      </span>
    </div>
  );
}

/** 기록 제출 상태 — 경기 결과보다 눈에 띄지 않게 한 줄로 (DESIGN §17-1) */
const SUBMIT_LABELS: Record<ReplaySubmitStatus, { text: string; tone: string }> = {
  submitting: { text: "기록 저장 중…", tone: "text-slate-500" },
  saved: { text: "기록 저장됨", tone: "text-emerald-300/80" },
  invalid: { text: "기록 검증 실패 · 내 기록은 다시보기에서 빠져요", tone: "text-amber-300/80" },
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
  /** 방장이 내보낼 수 있는 참가자 — 방장이 아니거나 경기 중이면 null */
  kickable: Set<string> | null;
  onKick: (playerId: string) => Promise<{ ok: true } | { ok: false; code: string }>;
  onExit: () => void;
};

/** 결과 — 순위·KO·보낸/받은 줄·블록·최대 콤보, 방장은 재대결 */
function MatchResults({ matchId, results, myPlayerId, isHost, submitStatus, onRematch, kickable, onKick, onExit }: MatchResultsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ playerId: string; name: string } | null>(null);
  const [kicking, setKicking] = useState(false);

  const confirmKick = async () => {
    if (!kickTarget) return;
    setKicking(true);
    const result = await onKick(kickTarget.playerId);
    setKicking(false);
    setKickTarget(null);
    setError(result.ok ? null : battleErrorMessage(result.code));
  };
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
        <h2 id="battle-result-title" className="mt-1 text-center text-3xl font-black text-white [text-shadow:0_0_14px_rgba(56,189,248,0.7),0_0_32px_rgba(56,189,248,0.35)]">
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
        {kickable && kickable.size > 0 && (
          // 표에 열을 더하면 좁은 화면에서 넘친다 — 표 아래 줄로 (방장만)
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="참가자 내보내기">
            {results
              .filter((r) => kickable.has(r.playerId))
              .map((r) => (
                <button
                  key={r.playerId}
                  type="button"
                  onClick={() => setKickTarget({ playerId: r.playerId, name: r.name })}
                  className="flex min-h-11 min-w-0 max-w-full items-center rounded-full border border-rose-400/40 px-3 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0">&nbsp;내보내기</span>
                </button>
              ))}
          </div>
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
        {/* 내 기록을 냈을 때만(검증 실패여도 경기는 공개된다 — D-008) — 경기 전체가 저장(공개)될 때까지 기다린 뒤 연다 */}
        {(submitStatus === "saved" || submitStatus === "invalid") && matchId && <MatchRecordLinks matchId={matchId} />}
        {error && (
          <p role="alert" className="mt-2 text-center text-sm text-rose-300">
            {error}
          </p>
        )}
      </section>
      <ConfirmModal
        isOpen={kickTarget !== null}
        onClose={() => setKickTarget(null)}
        onConfirm={confirmKick}
        title="플레이어를 내보낼까요?"
        message={`${kickTarget?.name ?? ""}님을 방에서 내보내요. 다시 들어오면 새로 입장해요.`}
        confirmLabel="내보내기"
        isLoading={kicking}
        variant="danger"
      />
    </div>
  );
}
