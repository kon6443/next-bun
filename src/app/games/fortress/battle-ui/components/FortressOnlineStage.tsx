"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import type { RoomStageProps } from "@/app/games/_shared/battle-room/components/BattleRoomView";
import { Button } from "@/app/teams/components/Button";
import { ENGINE_VERSION } from "../../engine";
import { type Controller, FortressMatch, type OnlineLink } from "../../components/FortressMatch";
import { FortressReplay } from "../../components/FortressReplay";
import { CARD, EYEBROW } from "../../components/fortressUi";
import vividStyles from "../../components/fortressVivid.module.css";
import { lookFromUrl, usesVivid } from "../../lib/look";
import { useResultMusic } from "../../lib/sound/useResultMusic";
import { Confetti, HeroTanks, winnerTanks } from "../../components/resultFlair";
import type { ReplayData } from "../../lib/replay";
import type { MatchEndedPayload, RoomState } from "@/types/fortressSocket";
import { useFortressSocket } from "../contexts/FortressSocketContext";
import { battleErrorMessage } from "../lib/battleErrors";
import { FortressResultTable, type ResultRow } from "./FortressResultTable";
import { FortressResultPoints } from "./FortressResultPoints";
import { replayView } from "./FortressMatchViewer";
import { type MatchPublished, useFortressMatchPublished } from "../hooks/useFortressMatchPublished";
import { buildFortressShareContent, fortressMatchPath } from "../lib/fortressShare";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import { getFortressReplay } from "@/services/fortressService";
import type { MatchFeed } from "../lib/matchFeed";
import { DEFAULT_TANK_SKIN, type TankSkin, toTankSkin } from "../../lib/tankSkins";
import { pointsEligibility } from "../../lib/points";

const RECORD_LINK = "flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/15 px-3 text-sm font-semibold text-slate-200 hover:border-white/30";

/** 방은 끝났는데(RESULT) 경기 소식이 끊긴 채 이만큼 지나면 경기 화면 대신 결과로 — resync가 실패한 경우(컨텍스트 대기 1.5초 + 응답) */
const ORPHANED_FEED_MS = 4000;
/** 결과 화면에서 순위(matchEnded)를 이만큼 기다려도 안 오면(끊긴 사이 놓침) 기다리기를 멈춘다 */
const MISSING_RESULT_MS = 3000;

/** 서버 리플레이(F6)로 재생할 때 — 마지막 해시 대조·저장된 스킨. 없으면 이 경기에서 쌓은 로컬 기록 */
type ServerReplay = { data: ReplayData; expectedHash: string; skins: TankSkin[] };
/** 결과·다시 보기는 그 경기(matchId) 것 — 다른 경기가 오면 그 렌더부터 경기 화면으로 본다(이전 경기 상태로 새 경기를 조회하지 않게) */
type View =
  | { kind: "match" }
  | { kind: "result"; matchId: string; replay: ReplayData }
  | { kind: "replay"; matchId: string; replay: ReplayData; server: ServerReplay | null };

/**
 * 경기·결과(F5·F6) — 서버 피드로 경기 화면(FortressMatch online)을 돌리고, 마지막 연출이 끝나면 결과(matchEnded.players).
 * "다시 보기"는 저장됐으면 서버 리플레이(해시 대조), 아니면 이 경기에서 쌓은 로컬 기록
 * 저장 대기(published)는 여기서 한 번 — 결과 ↔ 다시 보기를 오가도 폴링을 처음부터 다시 하지 않는다
 */
export function FortressOnlineStage({ room, onExit }: RoomStageProps<RoomState>) {
  const { feed, myPlayerId, submitTurn, resync, rematch } = useFortressSocket();
  const [viewState, setView] = useState<View>({ kind: "match" });
  const view: View = viewState.kind !== "match" && viewState.matchId !== feed?.matchId ? { kind: "match" } : viewState;
  const published = useFortressMatchPublished(view.kind === "match" || !feed ? null : feed.matchId);
  const isHost = myPlayerId === room.hostId;

  // 진행 중 경기를 나가면 기권 — 경기 화면 밖(불러오는 중·버전 다름)에서도 확인을 받는다
  const [exitAsk, setExitAsk] = useState(false);
  const requestExit = room.status === "PLAYING" ? () => setExitAsk(true) : onExit;
  const exitConfirm = (
    <ConfirmModal
      isOpen={exitAsk}
      onClose={() => setExitAsk(false)}
      onConfirm={() => {
        setExitAsk(false);
        onExit();
      }}
      title="경기를 나갈까요?"
      message="지금 나가면 기권으로 처리돼요. 경기는 남은 사람끼리 이어져요."
      confirmLabel="나가기"
      cancelLabel="계속하기"
      variant="danger"
    />
  );

  // 끊긴 사이 경기가 끝났고 resync로도 마지막 소식을 못 받았다 — 멈춘 경기 화면 대신 결과로(순위는 저장된 경기 GET matches/:id로 채운다)
  // 다시 보기는 저장됐으면 서버 리플레이, 아니면 받은 데까지의 행동 기록
  const stale = room.status === "RESULT" && feed !== null && feed.ended === null && feed.turn !== null;
  const feedRef = useRef(feed);
  feedRef.current = feed;
  useEffect(() => {
    if (!stale) return;
    const id = setTimeout(() => {
      const current = feedRef.current;
      if (!current) return;
      const replay: ReplayData = { engineVersion: current.engineVersion, config: current.config, actions: [...current.actions] };
      // 이미 결과·다시 보기에 있으면 그대로
      setView((prev) => (prev.kind === "match" || prev.matchId !== current.matchId ? { kind: "result", matchId: current.matchId, replay } : prev));
    }, ORPHANED_FEED_MS);
    return () => clearTimeout(id);
  }, [stale]);

  // 새 경기(재대결 등)가 오면 경기 화면으로 — 표시는 렌더 중 view 유도로 이미 바뀐다. 여기서 저장된 상태를 비워 A→B→A로 돌아와도 옛 결과가 되살아나지 않게
  const matchId = feed?.matchId ?? null;
  const lastMatchRef = useRef(matchId);
  useEffect(() => {
    if (lastMatchRef.current === matchId) return;
    lastMatchRef.current = matchId;
    setView({ kind: "match" });
  }, [matchId]);

  if (!feed) {
    return (
      <Centered>
        <p className="text-sm text-slate-300" role="status">
          {room.status === "RESULT" ? "경기가 끝났어요." : "경기를 불러오는 중…"}
        </p>
        <ResultActions isHost={isHost && room.status === "RESULT"} onRematch={() => void runRematch(rematch)} onExit={requestExit} />
        {exitConfirm}
      </Centered>
    );
  }

  if (feed.engineVersion !== ENGINE_VERSION) {
    return (
      <Centered>
        <p className="text-sm text-slate-200" role="alert">
          게임이 새 버전으로 바뀌었어요. 새로고침해 주세요.
        </p>
        <Button type="button" size="md" className="min-h-11" onClick={() => window.location.reload()}>
          새로고침
        </Button>
        <button type="button" onClick={requestExit} className="min-h-11 rounded-full px-2 text-sm text-sky-300">
          방 나가기
        </button>
        {exitConfirm}
      </Centered>
    );
  }

  const mySlot = feed.slots.find((s) => s.playerId === myPlayerId)?.slot ?? -1;
  const names = slotNames(feed);
  const skins = slotSkins(feed, room.players);
  const controllers: Controller[] = names.map((_, slot) => (slot === mySlot ? "human" : "remote"));

  if (view.kind === "replay") {
    const { server } = view;
    return (
      <FortressReplay
        data={server?.data ?? view.replay}
        controllers={controllers}
        names={names}
        skins={server?.skins ?? skins}
        expectedHash={server?.expectedHash}
        onClose={() => setView({ kind: "result", matchId: view.matchId, replay: view.replay })}
      />
    );
  }
  if (view.kind === "result") {
    const local = view.replay;
    return (
      <OnlineResult
        matchId={feed.matchId}
        replay={local}
        published={published}
        ended={feed.ended}
        myPlayerId={myPlayerId}
        isHost={isHost}
        roomStatus={room.status}
        skins={skins}
        onReplay={async (published) => {
          // 저장됐으면 서버 리플레이로(해시 대조) — 못 받으면 이 경기에서 쌓은 로컬 기록으로
          const server = published ? await loadServerReplay(feed.matchId) : null;
          setView({ kind: "replay", matchId: feed.matchId, replay: local, server });
        }}
        onRematch={() => void runRematch(rematch)}
        onExit={onExit}
      />
    );
  }

  const link: OnlineLink = {
    mySlot,
    names,
    skins,
    feed,
    submit: submitTurn,
    resync: (report) => void resync(report),
    errorMessage: battleErrorMessage,
  };
  return <FortressMatch key={feed.matchId} config={feed.config} controllers={controllers} online={link} onExit={onExit} onFinish={(replay) => setView({ kind: "result", matchId: feed.matchId, replay })} />;
}

/**
 * slot별 스킨 — 경기 시작 때 서버가 고정한 matchStarting·스냅샷 slots[].skin으로 그린다(경기 중 바뀌지 않는다)
 * 경기 중 방을 나가 roomState에서 빠진 참가자도, 결과 단계에서 다시 들어와 장착을 바꾼 참가자도 시작 때 스킨 그대로
 * slots에 skin이 없으면(계약 이전 서버) 방 플레이어 extra.skin으로, 그것도 없으면 기본
 */
export function slotSkins(feed: Pick<MatchFeed, "config" | "slots">, players: readonly RoomState["players"][number][]): TankSkin[] {
  const skins = feed.config.players.map(() => DEFAULT_TANK_SKIN);
  for (const s of feed.slots) {
    const fallback = s.skin ? undefined : players.find((p) => p.playerId === s.playerId)?.extra.skin;
    skins[s.slot] = toTankSkin(s.skin ?? fallback);
  }
  return skins;
}

async function loadServerReplay(matchId: string): Promise<ServerReplay | null> {
  try {
    const res = await getFortressReplay(matchId);
    const { data, skins } = replayView(res.data);
    return { data, expectedHash: res.data.stateHash, skins };
  } catch (err) {
    console.warn("[fortress] 서버 리플레이를 받지 못해 로컬 기록으로 재생", err);
    return null;
  }
}

function slotNames(feed: MatchFeed): string[] {
  const names = feed.config.players.map((p) => `P${p.slot + 1}`);
  for (const s of feed.slots) names[s.slot] = s.name;
  return names;
}

async function runRematch(rematch: () => Promise<{ ok: true } | { ok: false; code: string }>) {
  const result = await rematch();
  if (!result.ok) toast.error(battleErrorMessage(result.code), { id: "fortress-rematch" });
}

/** 결과 — 소켓 matchEnded 또는 저장된 경기(GET matches/:id)의 결과·순위 */
type ResultSource = { result: { kind: string }; players: readonly ResultRow[] };

/** 결과 제목 — 무승부(모두 1위 포함)·공동 1위·혼자 1위·n위를 가른다 */
export function resultHeadline(ended: ResultSource | null, myPlayerId: string | null): string {
  if (!ended) return "결과를 정리하는 중…";
  if (ended.result.kind === "draw") return "무승부";
  const me = ended.players.find((p) => p.playerId === myPlayerId);
  if (!me) return "경기 끝";
  if (me.place !== 1) return `${me.place}위`;
  // 팀전 승리는 이긴 팀 2명이 모두 1위 — 같은 팀이면 함께 이긴 것
  const firsts = ended.players.filter((p) => p.place === 1);
  const sharedWithOtherTeam = firsts.some((p) => p.playerId !== me.playerId && (p.team === null || p.team !== me.team));
  return sharedWithOtherTeam ? "공동 1위" : "이겼어요!";
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}

function ResultActions({ isHost, onRematch, onExit }: { isHost: boolean; onRematch: () => void; onExit: () => void }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {isHost ? (
        <Button type="button" size="md" fullWidth className="min-h-12 text-base" onClick={onRematch} data-testid="fortress-rematch-online">
          다시 한 판(대기실로)
        </Button>
      ) : null}
      <button type="button" onClick={onExit} className="min-h-11 rounded-full px-2 text-sm text-sky-300">
        방 나가기
      </button>
    </div>
  );
}

/**
 * 결과 — 서버 집계(순위·준 피해·KO). 결과가 아직 안 왔으면 기다린다(연출이 matchEnded보다 먼저 끝날 수 있다)
 * 경기가 저장되면(F6) 기록 보기·공유가 열리고, 끊긴 사이 놓친 순위는 저장된 결과(GET matches/:id)로 채운다
 */
export function OnlineResult({
  matchId,
  replay,
  published,
  ended,
  myPlayerId,
  isHost,
  roomStatus,
  skins,
  onReplay,
  onRematch,
  onExit,
}: {
  matchId: string;
  /** 이 경기에서 쌓은 행동 기록 — 게스트 "로그인했다면" 적립 조건 판정에 쓴다 */
  replay: ReplayData;
  /** 저장 대기 상태 — 부모(경기 화면 단위)가 한 번 폴링한다 */
  published: MatchPublished;
  ended: MatchEndedPayload | null;
  myPlayerId: string | null;
  isHost: boolean;
  roomStatus: RoomState["status"];
  /** 그 경기의 자리별 스킨 — 시안의 승자 탱크 그림(없으면 기본) */
  skins?: readonly TankSkin[];
  onReplay: (published: boolean) => Promise<void>;
  onRematch: () => void;
  onExit: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  useResultMusic();
  const saved = published.status === "ready" ? published.match : null;
  // 끊긴 사이 matchEnded를 놓쳤으면 다시 오지 않는다 — 저장된 결과로 채우고, 그것도 없으면 기다리기를 멈춘다
  const source: ResultSource | null = ended ?? saved;
  const [gaveUp, setGaveUp] = useState(false);
  const waiting = source === null && roomStatus === "RESULT";
  useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => setGaveUp(true), MISSING_RESULT_MS);
    return () => clearTimeout(id);
  }, [waiting]);
  const headline = !source && gaveUp ? "경기가 끝났어요" : resultHeadline(source, myPlayerId);
  const me = source?.players.find((p) => p.playerId === myPlayerId) ?? null;
  const mySlot = me?.slot ?? -1;
  const judgeEligibility = useCallback(() => pointsEligibility(replay.config, replay.actions, mySlot), [replay, mySlot]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { kakao, kakaoScript } = useKakaoReady();
  // 그림(보충 5) — 주소의 ?look(기본 vivid). vivid면 경기 화면과 같은 판·버튼 모양
  const [vivid] = useState(() => usesVivid(lookFromUrl()));

  return (
    <div className={`relative h-full overflow-y-auto overscroll-contain bg-gradient-to-b from-[#070b1d] via-[#141a3d] to-[#2a2350] ${vivid ? vividStyles.vivid : ""} px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]`} style={{ touchAction: "pan-y" }} data-testid="fortress-online-result" data-vivid={vivid || undefined}>
      {/* 시안 — 내가 이긴 판이면 꽃가루(움직임 줄이기면 없음) */}
      {vivid ? <Confetti active={me?.place === 1 && source?.result.kind === "win"} /> : null}
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header className={`${CARD} text-center`} data-hud="card">
          <p className={EYEBROW}>RESULT</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-3xl font-bold text-white outline-none" aria-live="polite">
            {headline}
          </h1>
        </header>
        {vivid && source && source.result.kind === "win" ? (
          <div className="overflow-hidden rounded-3xl" data-hud="card">
            <HeroTanks tanks={winnerTanks(source.players, skins)} mapId={replay.config.mapId} label={`승리한 탱크: ${winnerTanks(source.players, skins).map((t) => t.label).join(", ")}`} />
          </div>
        ) : null}
        {source ? (
          <FortressResultTable players={source.players} myPlayerId={myPlayerId} vivid={vivid} />
        ) : gaveUp ? (
          <p className="text-center text-sm text-slate-400">
            {published.status === "unavailable" ? "연결이 끊긴 사이 순위를 받지 못했어요. 다시 보기로 경기를 확인할 수 있어요." : "순위를 다시 받는 중이에요…"}
          </p>
        ) : null}
        {me ? <FortressResultPoints matchId={matchId} settled={published.status === "ready" || published.status === "unavailable"} won={source?.result.kind === "win" && me.place === 1} kos={me.kos} judgeEligibility={judgeEligibility} /> : null}
        <Button
          type="button"
          variant="secondary"
          size="md"
          fullWidth
          className="min-h-12 text-base"
          disabled={replayLoading}
          aria-busy={replayLoading}
          onClick={async () => {
            setReplayLoading(true);
            await onReplay(saved !== null);
            setReplayLoading(false);
          }}
          data-testid="fortress-replay-online"
        >
          {replayLoading ? "리플레이 불러오는 중…" : "다시 보기"}
        </Button>
        {/* 기록 보기·공유(F6) — 저장되면 열린다. 기록 보기는 새 탭(이 화면을 떠나면 방 소켓이 끊긴다) */}
        {published.status === "unavailable" ? (
          <p className="text-center text-xs text-slate-500">이 경기는 기록 보기를 열 수 없어요.</p>
        ) : saved ? (
          <div className="flex gap-2">
            <a href={fortressMatchPath(matchId)} target="_blank" rel="noopener noreferrer" className={RECORD_LINK} data-testid="fortress-record-link">
              기록 보기<span className="sr-only"> (새 탭)</span>
            </a>
            <button type="button" onClick={() => setShareOpen(true)} aria-haspopup="dialog" className={RECORD_LINK} data-testid="fortress-record-share">
              공유
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <span aria-disabled="true" className={`${RECORD_LINK} cursor-default opacity-50`}>
              경기 저장 중…
            </span>
          </div>
        )}
        {/* 저장 상태 안내 — 라이브 영역은 늘 마운트하고 내용만 바꾼다 */}
        <p className="sr-only" role="status">
          {published.status === "ready" ? "경기가 저장됐어요. 기록 보기와 공유를 쓸 수 있어요." : published.status === "unavailable" ? "이 경기는 기록 보기를 열 수 없어요." : "경기를 저장하는 중이에요."}
        </p>
        {kakaoScript}
        {shareOpen && saved ? <ShareMenu content={buildFortressShareContent(saved)} kakao={kakao} subject="경기 기록" onClose={() => setShareOpen(false)} /> : null}
        {roomStatus === "RESULT" && !isHost ? <p className="text-center text-xs text-slate-400">방장이 다시 한 판을 열면 대기실로 가요.</p> : null}
        <ResultActions isHost={isHost && roomStatus === "RESULT"} onRematch={onRematch} onExit={onExit} />
      </div>
    </div>
  );
}
