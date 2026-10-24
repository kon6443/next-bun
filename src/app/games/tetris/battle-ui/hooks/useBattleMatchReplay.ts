"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sleep } from "@/app/games/_shared/lib/sleep";
import type { Highlight } from "@/app/games/_shared/lib/highlights";
import { ApiError } from "@/types/api";
import { type BattleMatch, type BattleMatchPlayer, isBattleMatchId } from "@/services/tetrisBattleService";
import { BATTLE_ENGINE_VERSION } from "../../battle-engine";
import type { GameState } from "../../engine";
import { FRAMES_PER_SECOND } from "../../engine";
import type { GarbageGauge } from "../../lib/renderer";
import {
  type BattleHighlightKind,
  type BattleReplayRunner,
  type BattleReplaySnapshot,
  createReplayRunner,
  garbageGaugeOf,
  prepareBattleTrack,
  seekRunner,
} from "../lib/battleReplayRunner";
import { loadBattleMatch, loadBattleReplay } from "../lib/battleMatchLoader";

/** 뒤로 탐색할 때 처음부터가 아니라 가장 가까운 스냅샷부터 다시 진행한다 (기존 재생기와 같은 방식) */
const SNAPSHOT_INTERVAL = 10 * FRAMES_PER_SECOND;
/** 리플레이 GET 사이 간격 — 조회 스로틀(IP당 초당 3) 안에 들도록 순차로 받는다 */
const REPLAY_FETCH_GAP_MS = 400;

export type MatchLoad =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | { status: "ready"; match: BattleMatch };

/** 판 하나의 기록 상태 — missing = 미제출(MISSING)·리플레이 없음, invalid = 검증 실패(INVALID — 받지 않는다), unsupported = 다른 대전 엔진 버전 */
export type TrackStatus = "loading" | "ready" | "missing" | "invalid" | "unsupported" | "error";

/** 판 하나 — 캔버스가 그릴 때 읽는 ref와 재생 상태 */
export type ReplayTrack = {
  player: BattleMatchPlayer;
  status: TrackStatus;
  runner: BattleReplayRunner | null;
  snapshots: Map<number, BattleReplaySnapshot>;
  buffer: number[];
  stateRef: { current: GameState | null };
  drawRef: { current: (() => void) | null };
  garbageRef: { current: GarbageGauge | null };
  /** 이 판의 하이라이트(사전 패스) — 받기 전·기록 없음이면 빈 배열 */
  highlights: Highlight<BattleHighlightKind>[];
};

function createTrack(player: BattleMatchPlayer): ReplayTrack {
  return {
    player,
    status: player.verdict === "VERIFIED" ? "loading" : player.verdict === "INVALID" ? "invalid" : "missing",
    runner: null,
    snapshots: new Map(),
    buffer: [],
    stateRef: { current: null },
    drawRef: { current: null },
    garbageRef: { current: null },
    highlights: [],
  };
}


/** 판 하나를 target 프레임까지 진행한다 — target이 지금보다 앞이면 가장 가까운 스냅샷부터 다시 */
function seekTrack(track: ReplayTrack, target: number): void {
  const runner = track.runner;
  if (!runner) return;
  seekRunner(runner, track.snapshots, target, SNAPSHOT_INTERVAL, track.buffer);
  track.stateRef.current = runner.bs.game;
  track.garbageRef.current = garbageGaugeOf(runner.bs);
}

/** 판 하나의 리플레이를 받아 지금 프레임까지 맞춘다 — 화면을 떠났으면(isLive false) 아무것도 바꾸지 않고 false */
async function fetchTrack(matchId: string, track: ReplayTrack, frame: () => number, isLive: () => boolean): Promise<boolean> {
  try {
    // StrictMode 재마운트로 두 번 불려도 같은 요청을 함께 쓴다(battleMatchLoader)
    const replay = await loadBattleReplay(matchId, track.player.playerId);
    if (!isLive()) return false;
    if (replay.battleEngineVersion !== BATTLE_ENGINE_VERSION) {
      track.status = "unsupported";
    } else {
      // 사전 패스 — 전 구간 스냅샷(탐색은 최대 10초만 다시 돈다, FE-13)·하이라이트. 1분 분량마다 쉰다
      const marks = await prepareBattleTrack(replay, track.snapshots, SNAPSHOT_INTERVAL, () => !isLive());
      if (!marks || !isLive()) return false;
      track.highlights = marks;
      track.runner = createReplayRunner(replay);
      track.status = "ready";
      seekTrack(track, frame());
      track.drawRef.current?.();
    }
  } catch (err) {
    if (!isLive()) return false;
    track.status = err instanceof ApiError && err.status === 404 ? "missing" : "error";
  }
  return true;
}

/**
 * 저장된 경기 조회 + 2~4판 동시 재생 (DESIGN §18)
 * 공통 프레임 축 하나로 모든 판을 진행한다 — 각 리플레이의 frame 0은 각자 카운트다운 종료라 근사 동기
 */
export function useBattleMatchReplay(matchId: string) {
  const [load, setLoad] = useState<MatchLoad>(() => (isBattleMatchId(matchId) ? { status: "loading" } : { status: "notFound" }));
  const [tracks, setTracks] = useState<ReplayTrack[]>([]);
  /** 트랙 상태가 바뀔 때(리플레이 도착) 다시 그리기 위한 버전 */
  const [, setTrackVersion] = useState(0);
  /** "다시 시도" — 일시 실패(스로틀·네트워크)로 경기를 못 받았을 때 */
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef(0);
  const tracksRef = useRef<ReplayTrack[]>([]);
  tracksRef.current = tracks;
  /** 지금 경기 조회가 살아 있나 — 판 하나 다시 받기가 화면을 떠난 뒤·다시 시도 뒤에 늦게 끝나면 버린다 */
  const liveRef = useRef<() => boolean>(() => false);

  useEffect(() => {
    if (!isBattleMatchId(matchId)) return;
    let cancelled = false;
    const isLive = () => !cancelled;
    liveRef.current = isLive;
    setLoad({ status: "loading" });
    (async () => {
      let match: BattleMatch;
      try {
        match = await loadBattleMatch(matchId);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setLoad({ status: "notFound" });
        else setLoad({ status: "error", message: "경기 기록을 불러오지 못했어요." });
        return;
      }
      if (cancelled) return;
      const next = match.players.map(createTrack);
      frameRef.current = 0;
      setTracks(next);
      setLoad({ status: "ready", match });

      // 리플레이는 순서대로 하나씩 — 도착하는 대로 그 판을 지금 프레임까지 맞춘다
      for (const track of next) {
        if (track.status !== "loading") continue;
        await sleep(REPLAY_FETCH_GAP_MS);
        if (cancelled) return;
        if (!(await fetchTrack(matchId, track, () => frameRef.current, isLive))) return;
        setTrackVersion((v) => v + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, attempt]);

  /**
   * 공통 프레임 축의 끝 — 가장 오래 진행한 판. 서버 요약 frames(서버 기준 탈락·종료 시점)와 리플레이 frames(클라이언트 진행)가
   * 몇 프레임 다를 수 있어(운영 예: 147 vs 154) 받은 리플레이가 있으면 둘 중 긴 쪽 — 리플레이 끝이 잘리지 않게
   */
  // 판은 최대 4개라 렌더마다 계산한다 — 리플레이 도착(트랙 객체 안의 runner 변경)은 trackVersion이 다시 렌더한다
  const totalFrames = tracks.reduce((max, t) => Math.max(max, t.player.frames, t.runner?.replay.frames ?? 0), 0);

  /** 모든 판을 target 프레임으로 */
  const seekAll = useCallback((target: number) => {
    frameRef.current = target;
    for (const track of tracksRef.current) {
      seekTrack(track, target);
      track.drawRef.current?.();
    }
  }, []);

  /**
   * 경기 하이라이트 — 판마다의 큰 공격·KO를 한 축에(설명 앞에 이름). 기록이 없는 판(미제출·검증 실패)도 서버 요약의 KO는 찍는다
   * 판은 최대 4개·점은 수십 개라 렌더마다 계산한다(트랙 객체 안의 변경은 trackVersion이 다시 렌더한다)
   */
  const highlights = tracks
    .flatMap((t): Highlight<BattleHighlightKind>[] => {
      const name = t.player.name;
      if (t.status === "ready") return t.highlights.map((h) => ({ ...h, detail: [name, h.detail].filter(Boolean).join(" · ") }));
      return t.player.koReason !== null && t.player.frames > 0 ? [{ at: t.player.frames, kind: "ko", detail: name }] : [];
    })
    .sort((a, b) => a.at - b.at);

  /** 리플레이를 다 받았거나(실패 포함) 받을 게 없다 — 재생은 이때 시작한다(빈 판 위로 시간만 흐르지 않게) */
  const settled = tracks.every((t) => t.status !== "loading");

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /** 판 하나만 다시 받는다 — 그 판이 일시 실패(error)였을 때 (games-polish FE-23). 경기 전체를 다시 받지 않는다 */
  const retryTrack = useCallback(
    async (playerId: string) => {
      const track = tracksRef.current.find((t) => t.player.playerId === playerId);
      if (!track || track.status !== "error") return;
      const isLive = liveRef.current;
      track.status = "loading";
      setTrackVersion((v) => v + 1);
      if (await fetchTrack(matchId, track, () => frameRef.current, isLive)) setTrackVersion((v) => v + 1);
    },
    [matchId],
  );

  return { load, tracks, totalFrames, settled, frameRef, seekAll, retry, retryTrack, highlights };
}
