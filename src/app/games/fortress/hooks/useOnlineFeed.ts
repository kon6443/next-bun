import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef } from "react";
import type { Action, MatchState } from "../engine";
import type { OnlineLink } from "../components/FortressMatch";
import type { LastShot } from "../lib/aimAssist";
import { type Phase, replayActions } from "../lib/matchFlow";
import { type ReplayData, newReplayData } from "../lib/replay";
import type { useOnlineDesync } from "./useOnlineDesync";

type Options = {
  online: OnlineLink | undefined;
  onlineRef: MutableRefObject<OnlineLink | undefined>;
  phase: Phase;
  phaseRef: MutableRefObject<Phase>;
  setPhase: (p: Phase) => void;
  /** 턴이 그대로인 행동(남의 기권) 연출 뒤 돌아갈 phase */
  resumePhaseRef: MutableRefObject<Phase | null>;
  /** 피드에서 적용한 행동 수(= 연출을 시작한 수) · 마지막으로 맞춘 스냅샷 세대 */
  appliedRef: MutableRefObject<number>;
  epochRef: MutableRefObject<number>;
  stateRef: MutableRefObject<MatchState>;
  setState: Dispatch<SetStateAction<MatchState>>;
  replayRef: MutableRefObject<ReplayData>;
  lastShotRef: MutableRefObject<(LastShot | null)[]>;
  /** 연출 없이 그 state를 바로 보인다(스냅샷) */
  show: (s: MatchState) => void;
  /** 행동 적용 → 기록 → 연출 시작(엔진이 거부하면 false) */
  playAction: (action: Action) => boolean;
  beginTurn: (s: MatchState) => void;
  desync: Pick<ReturnType<typeof useOnlineDesync>, "desyncFatal" | "verifyHash" | "requestResync" | "resetDesyncCount">;
};

/**
 * 온라인 — 서버 피드의 다음 행동을 연출한다(연출이 끝나면 phase가 바뀌어 다음 것). 스냅샷(세대)이 바뀌면 처음부터 다시 만든다
 * 서버가 확정한 행동을 내 엔진이 거부하면 그 세대는 스냅샷이 올 때까지 멈추고 resync를 요청한다
 */
export function useOnlineFeed(o: Options): void {
  /** 서버 행동을 내 엔진이 거부한 피드 세대 — 스냅샷(다음 세대)이 올 때까지 멈춘다 */
  const rejectedEpochRef = useRef<number | null>(null);
  const rejectedLengthRef = useRef(0);
  // 렌더마다 새로 만들어지는 함수는 최신 것만 본다(effect를 다시 걸지 않게 — 예전 한 컴포넌트 안 effect와 같은 시점)
  const setPhaseRef = useRef(o.setPhase);
  setPhaseRef.current = o.setPhase;
  const { onlineRef, phaseRef, resumePhaseRef, appliedRef, epochRef, stateRef, setState, replayRef, lastShotRef, show, playAction, beginTurn, phase } = o;
  const { desyncFatal, verifyHash, requestResync, resetDesyncCount } = o.desync;
  const feedLength = o.online?.feed.actions.length ?? 0;
  const feedEpoch = o.online?.feed.epoch ?? 0;
  useEffect(() => {
    const link = onlineRef.current;
    if (!link) return;
    const setPhaseBoth = setPhaseRef.current;
    const { feed } = link;
    if (feed.epoch !== epochRef.current) {
      epochRef.current = feed.epoch;
      const built = replayActions(feed.config, feed.actions);
      lastShotRef.current = built.lastShots;
      appliedRef.current = feed.actions.length;
      replayRef.current = { ...newReplayData(feed.config), actions: [...feed.actions] };
      stateRef.current = built.state;
      setState(built.state);
      show(built.state);
      // 제출 응답을 기다리는 중(기권 연출 뒤 돌아갈 곳 포함)이면 그대로 둔다 — 새 턴으로 치면 조작부가 다시 열려 두 번 제출된다
      const awaitingSubmit = phaseRef.current === "submit" || resumePhaseRef.current === "submit";
      resumePhaseRef.current = null;
      rejectedEpochRef.current = null;
      if (!built.ok) requestResync();
      // 스냅샷으로 맞았다 — 그동안의 어긋남은 풀렸으니 다시 센다
      else if (verifyHash(appliedRef.current, built.state)) resetDesyncCount();
      if (awaitingSubmit && built.state.result.kind === "ongoing" && built.state.turn.slot === link.mySlot) {
        setPhaseBoth("submit");
        return;
      }
      beginTurn(built.state);
      return;
    }
    // 이 세대에서 이미 거부된 행동이 있으면 스냅샷이 올 때까지 다시 적용하지 않는다.
    // 그사이 새 행동이 오면 resync만 다시 요청한다(앞 요청이 실패했을 수 있다 — 횟수 상한에 걸리면 새로고침 안내)
    if (!desyncFatal && rejectedEpochRef.current === feed.epoch) {
      if (feed.actions.length > rejectedLengthRef.current) {
        rejectedLengthRef.current = feed.actions.length;
        requestResync();
      }
      return;
    }
    if (desyncFatal || phase === "play" || appliedRef.current >= feed.actions.length) return;
    const action = feed.actions[appliedRef.current];
    const before = stateRef.current;
    // 턴 주인이 아닌 사람의 기권은 턴을 바꾸지 않는다 — 연출 뒤 지금 phase로 돌아간다
    const keepsTurn = action.kind === "resign" && before.result.kind === "ongoing" && action.slot !== before.turn.slot;
    const resumeTo = keepsTurn ? phaseRef.current : null;
    if (!playAction(action)) {
      // 서버가 확정한 행동을 내 엔진이 거부 — 어긋났다
      console.warn("[fortress] 서버 행동 적용 실패 — resync", action);
      rejectedEpochRef.current = feed.epoch;
      rejectedLengthRef.current = feed.actions.length;
      requestResync();
      return;
    }
    resumePhaseRef.current = resumeTo;
    appliedRef.current += 1;
    // ref·setState는 바뀌지 않는다 — 예전과 같은 의존성(피드 길이·세대·phase·콜백)으로만 다시 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedLength, feedEpoch, phase, playAction, beginTurn, show, verifyHash, requestResync, resetDesyncCount, desyncFatal]);
}
