import { type Action, type MatchConfig, type MatchState, type Tank, applyAction, createMatch } from "../engine";
import { type LastShot, lastShotOf } from "./aimAssist";

/** aim 내 입력 · think AI 계산 · wait 다른 기기 차례 · submit 제출 응답·확정 대기 · play 연출 · over 끝 */
export type Phase = "aim" | "think" | "wait" | "submit" | "play" | "over";

/** 지금 차례 탱크 — 엔진은 진행 중 경기의 차례 slot에 늘 탱크를 둔다(엔진 밖 화면 코드용, 엔진 사본은 그대로) */
export function currentTank(state: MatchState): Tank {
  return state.tanks[state.turn.slot] as Tank;
}

/** 경기 첫 state — 설정이 잘못되면 던진다(화면이 만든 설정이라 생기면 버그) */
export function startMatch(config: MatchConfig): MatchState {
  const r = createMatch(config);
  if (!r.ok) throw new Error(`경기 설정 오류: ${r.reason}`);
  return r.state;
}

/** 첫 state에 행동을 차례로 적용 — 엔진이 거부하면(서버와 어긋남) ok false. slot별 지난 발도 다시 만든다(재접속·스냅샷 뒤 조준 보조) */
export function replayActions(config: MatchConfig, actions: readonly Action[]): { state: MatchState; ok: boolean; lastShots: (LastShot | null)[] } {
  let state = startMatch(config);
  const lastShots: (LastShot | null)[] = [null, null, null, null];
  for (const action of actions) {
    const r = applyAction(state, action);
    if (!r.ok) return { state, ok: false, lastShots };
    if (action.kind === "fire" && action.power > 0) lastShots[state.turn.slot] = lastShotOf(action, r.events);
    state = r.state;
  }
  return { state, ok: true, lastShots };
}
