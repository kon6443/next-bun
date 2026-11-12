/**
 * 온라인 경기 피드 (F5, DESIGN §11) — 서버가 확정한 행동을 순서대로 모은다. 화면은 이 목록을 엔진에 차례로 적용해 연출한다
 * - 서버 권위: actions[i] = 서버 seq i의 행동. 화면은 같은 엔진에 같은 순서로 넣고 hashes[i]와 대조한다(다르면 resync)
 * - 다른 경기(matchId)의 이벤트는 버린다(시작 롤백 실패로 남은 경기의 방송 대비)
 * - seq가 건너뛰면(놓친 방송) needsResync — 화면을 맞추려면 스냅샷이 필요하다
 * - 스냅샷(resync ack·재접속 rejoin.match)은 통째로 바꾸고 epoch를 올린다 — 화면은 연출 없이 다시 만든다
 * 순수 함수 — 시각(now)은 밖에서 넣는다
 */

import type { Action, MatchConfig } from "../../engine";
import type { MatchEndedPayload, MatchSlot, MatchSnapshot, MatchStartingPayload, TurnInfo, TurnResolvedPayload } from "@/types/fortressSocket";

export type MatchFeed = {
  matchId: string;
  engineVersion: number;
  config: MatchConfig;
  slots: MatchSlot[];
  actions: Action[];
  /** actions[i]를 적용한 뒤의 서버 해시 — 스냅샷으로 받은 앞부분은 마지막 것만 안다 */
  hashes: (string | undefined)[];
  /** 진행 중인 턴(서버 기준) — null이면 경기 끝 */
  turn: TurnInfo | null;
  /** turn을 받은 시각(ms) — 남은 시간 = turnAt + remainingMs − 지금 */
  turnAt: number;
  /** 첫 입력을 받기 시작하는 시각(ms) — matchStarting 수신 + startInMs(시작 연출 동안 잠금), 스냅샷은 snapshotStartAt */
  startAt: number;
  ended: MatchEndedPayload | null;
  /** 스냅샷으로 통째로 바뀐 횟수 — 화면은 바뀌면 처음부터 다시 만든다 */
  epoch: number;
  /** 행동을 놓쳤다(seq 건너뜀) — resync가 필요하다 */
  needsResync: boolean;
};

export type FeedEvent =
  | { type: "starting"; payload: MatchStartingPayload; now: number }
  | { type: "resolved"; payload: TurnResolvedPayload; now: number }
  | { type: "ended"; payload: MatchEndedPayload }
  | { type: "snapshot"; snapshot: MatchSnapshot; now: number }
  | { type: "clear" };

export function reduceFeed(feed: MatchFeed | null, event: FeedEvent): MatchFeed | null {
  switch (event.type) {
    case "clear":
      return null;
    case "starting": {
      const p = event.payload;
      // 같은 경기의 시작이 다시 오면(재전송) 이미 쌓은 행동을 지우지 않는다
      if (feed && feed.matchId === p.matchId) return feed;
      return {
        matchId: p.matchId,
        engineVersion: p.engineVersion,
        config: p.config,
        slots: p.slots,
        actions: [],
        hashes: [],
        turn: p.turn,
        turnAt: event.now,
        startAt: event.now + Math.max(0, p.startInMs),
        ended: null,
        epoch: (feed?.epoch ?? 0) + 1,
        needsResync: false,
      };
    }
    case "resolved": {
      const p = event.payload;
      if (!feed || feed.matchId !== p.matchId) return feed;
      const turn = p.next;
      if (p.seq < feed.actions.length) return feed; // 이미 받은 행동(재전송)
      if (p.seq > feed.actions.length) return { ...feed, needsResync: true };
      return {
        ...feed,
        actions: [...feed.actions, p.action],
        hashes: [...feed.hashes, p.stateHash],
        turn,
        turnAt: event.now,
      };
    }
    case "ended": {
      if (!feed || feed.matchId !== event.payload.matchId) return feed;
      return { ...feed, ended: event.payload };
    }
    case "snapshot": {
      const s = event.snapshot;
      // 늦게 온(이미 받은 것보다 짧은) 같은 경기의 스냅샷은 버린다 — 화면이 뒤로 갔다 오지 않게
      if (feed && feed.matchId === s.matchId && s.actions.length < feed.actions.length) return feed;
      const hashes: (string | undefined)[] = s.actions.map(() => undefined);
      if (hashes.length > 0) hashes[hashes.length - 1] = s.stateHash;
      return {
        matchId: s.matchId,
        engineVersion: s.engineVersion,
        config: s.config,
        slots: s.slots,
        actions: s.actions,
        hashes,
        turn: s.turn,
        turnAt: event.now,
        startAt: snapshotStartAt(s.turn, event.now),
        ended: feed && feed.matchId === s.matchId ? feed.ended : null,
        epoch: (feed?.epoch ?? 0) + 1,
        needsResync: false,
      };
    }
  }
}

/**
 * 스냅샷의 입력 시작 시각 — 스냅샷에는 시작 시각이 없어 첫 턴(seq 0) 마감으로 거꾸로 센다
 * 서버 첫 턴 마감 = 시작 + 시작 연출 + 턴 길이 → 시작 연출이 남았으면 remainingMs − turnMs만큼 뒤(서버는 그 전 제출을 MATCH_NOT_STARTED로 거절)
 * 다음 턴부터는 마감에 연출 시간이 섞일 수 있어 쓰지 않는다 — 받은 즉시
 */
function snapshotStartAt(turn: TurnInfo | null, now: number): number {
  if (!turn || turn.seq !== 0) return now;
  return now + Math.max(0, turn.remainingMs - turn.turnMs);
}

/** 남은 시간(ms) — 서버가 보낸 remainingMs를 받은 시각부터 센다(기기 시계 차이와 무관) */
export function remainingMs(feed: Pick<MatchFeed, "turn" | "turnAt">, now: number): number {
  if (!feed.turn) return 0;
  return Math.max(0, feed.turn.remainingMs - (now - feed.turnAt));
}

/**
 * TURN_MISMATCH 뒤 판단(D-015) — 보냈을 때의 턴과 지금 아는 최신 턴을 비교
 * - retry: 같은 사람·같은 턴인데 seq만 늘었다(남의 기권) → 같은 입력을 최신 seq로 한 번 다시
 * - drop: 턴 주인·턴 번호가 바뀌었다(이미 지나감) → 입력을 버린다
 * - wait: 아직 새 소식이 없다 → 잠깐 기다렸다 다시 보고, 그래도 없으면 resync
 */
export function mismatchDecision(sent: TurnInfo, latest: TurnInfo | null): "retry" | "drop" | "wait" {
  if (!latest) return "drop";
  if (latest.slot !== sent.slot || latest.turnNo !== sent.turnNo) return "drop";
  if (latest.seq > sent.seq) return "retry";
  return "wait";
}
