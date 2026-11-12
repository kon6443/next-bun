/**
 * 턴 연출 타임라인 — applyAction의 events(틱 표시)를 연출 틱마다 "지금 보이는 것"으로 바꾼다 (순수 함수)
 * 탄 위치는 shot.samples[틱 − 시작 틱], 이동은 path를 MOVE_PX_PER_TICK 걸음씩, 낙하는 FALL_TICKS에 걸쳐 보간
 */

import { MOVE_PX_PER_TICK, type MatchEvent, type Tank, eventsEndTick } from "../engine";

export const EXPLOSION_TICKS = 14;
export const FALL_TICKS = 12;
export const POPUP_TICKS = 36;
/** 마지막 이벤트 뒤 여운 */
export const TAIL_TICKS = 18;

/** 연출이 끝나는 틱 — 엔진 마지막 틱(eventsEndTick, 서버 마감도 같은 값) 뒤에 폭발·낙하 보간 꼬리 + 여운 */
export function playbackEnd(events: readonly MatchEvent[]): number {
  let end = eventsEndTick(events);
  for (const e of events) {
    if (e.type === "explode") end = Math.max(end, e.t + EXPLOSION_TICKS);
    else if (e.type === "fall") end = Math.max(end, e.t + FALL_TICKS);
  }
  return end + TAIL_TICKS;
}

export type ShellView = { id: number; x: number; y: number; trail: number[] };

/** 이 틱에 날고 있는 탄 — trail은 최근 위치 몇 개(꼬리) */
export function shellsAt(events: readonly MatchEvent[], tick: number, trailLength = 8): ShellView[] {
  const out: ShellView[] = [];
  for (const e of events) {
    if (e.type !== "shot") continue;
    const i = tick - e.t;
    const n = e.samples.length / 2;
    if (i < 0 || i >= n) continue;
    const from = Math.max(0, i - trailLength);
    out.push({ id: e.projectileId, x: e.samples[i * 2], y: e.samples[i * 2 + 1], trail: e.samples.slice(from * 2, i * 2 + 2) });
  }
  return out;
}

export type BlastView = { x: number; y: number; r: number; progress: number };

export function blastsAt(events: readonly MatchEvent[], tick: number): BlastView[] {
  const out: BlastView[] = [];
  for (const e of events) {
    if (e.type === "explode" && tick >= e.t && tick < e.t + EXPLOSION_TICKS) out.push({ x: e.x, y: e.y, r: e.r, progress: (tick - e.t) / EXPLOSION_TICKS });
  }
  return out;
}

export type PopupView = { slot: number; amount: number; progress: number };

export function popupsAt(events: readonly MatchEvent[], tick: number): PopupView[] {
  const out: PopupView[] = [];
  for (const e of events) {
    if (e.type === "damage" && tick >= e.t && tick < e.t + POPUP_TICKS) out.push({ slot: e.slot, amount: e.amount, progress: (tick - e.t) / POPUP_TICKS });
  }
  return out;
}

export type TankView = { slot: number; x: number; y: number; hp: number; alive: boolean };

/** 턴 시작 state의 탱크에 이 틱까지의 이동·낙하·피해·사망을 반영한 모습 */
export function tanksAt(before: readonly (Tank | null)[], events: readonly MatchEvent[], tick: number): TankView[] {
  const views: TankView[] = [];
  for (const t of before) {
    if (!t) continue;
    let x = t.x;
    let y = t.y;
    let hp = t.hp;
    let alive = t.alive;
    for (const e of events) {
      if (!("slot" in e) || e.slot !== t.slot) continue;
      if (e.type === "move") {
        const steps = e.path.length / 2 - 1;
        const step = Math.min(steps, Math.max(0, tick * MOVE_PX_PER_TICK));
        x = e.path[step * 2];
        y = e.path[step * 2 + 1];
      } else if (e.type === "fall" && tick >= e.t) {
        const k = Math.min(1, (tick - e.t) / FALL_TICKS);
        x = e.path[2];
        y = e.path[1] + (e.path[3] - e.path[1]) * k * k;
      } else if (e.type === "damage" && tick >= e.t) hp = Math.max(0, hp - e.amount);
      else if (e.type === "death" && tick >= e.t) alive = false;
    }
    views.push({ slot: t.slot, x, y, hp, alive });
  }
  return views;
}

/**
 * 이 틱까지 새로 지난 폭발 — 연출은 턴 시작 지형에 이 폭발들을 순서대로 carveCircle해 "그 순간의 지형"을 칠한다
 * (엔진도 explode 이벤트 순서대로 같은 carveCircle을 적용하므로 연출 끝 지형 = 엔진 결과)
 */
export function explosionsUntil(events: readonly MatchEvent[], tick: number, applied: number): { blasts: { x: number; y: number; r: number }[]; applied: number } {
  const blasts: { x: number; y: number; r: number }[] = [];
  let seen = 0;
  for (const e of events) {
    if (e.type !== "explode") continue;
    if (e.t > tick) break;
    if (seen >= applied) blasts.push({ x: e.x, y: e.y, r: e.r });
    seen++;
  }
  return { blasts, applied: Math.max(applied, seen) };
}

/**
 * 행동의 발사 연출(반동·포구 연기)을 걸 탄 — (afterTick, uptoTick] 사이에 시작한 shot 중 첫 것, 이미 했으면(fired) 없음
 * 분열탄 자식탄·폭격 폭탄도 shot 이벤트라, 행동마다 한 번만 걸도록 호출부가 fired를 기억한다
 */
export function firstShotIn(events: readonly MatchEvent[], afterTick: number, uptoTick: number, fired: boolean): Extract<MatchEvent, { type: "shot" }> | null {
  if (fired) return null;
  for (const e of events) {
    if (e.type === "shot" && e.t > afterTick && e.t <= uptoTick && e.samples.length >= 2) return e;
  }
  return null;
}
