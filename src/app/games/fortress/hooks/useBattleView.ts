"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceClock, createClock, resetClock } from "@/app/games/_shared/lib/fixedStep";
import { type MapId, type MatchEvent, type MatchState, TANKS, TICKS_PER_SECOND, type Tank, type Terrain, WORLD_WIDTH, carveCircle, groundAt } from "../engine";
import type { Quality } from "../renderer/backdrop";
import { type Camera, type ViewSize, approachLimited, clampCamera, panBy, screenToWorld, worldToScreen, zoomAt } from "../renderer/camera";
import { type FlightPlan, IMPACT_HOLD_MS, TURN_MOTION, TURN_ZOOM, flightBegin, flightStep, flightTarget, followPlan, planFlight, readyToFly } from "../renderer/follow";
import { type Aim, SLOT_COLORS, TEAM_COLORS, blastDrawRadius, drawScene } from "../renderer/drawScene";
import { type BlastStyle, createEffects, hitJolt, spawnExplosion, spawnExplosionVivid, spawnMuzzleBlast, spawnTrailSmoke, spawnWreckSmoke, updateEffects } from "../renderer/effects";
import { type TankView, blastsAt, explosionsUntil, firstShotIn, playbackEnd, popupsAt, shellsAt, tanksAt } from "../renderer/playback";
import { type TerrainLayer, createTerrainLayer, paintAll, paintColumns, scorch } from "../renderer/terrainLayer";
import { DEFAULT_LOOK, type Look, usesVivid } from "../lib/look";
import { createJankJudge } from "../renderer/jankJudge";
import { type WeaponFx, weaponFx } from "../renderer/vivid";
import type { FortressCue } from "../lib/sound/recipes";
import { worldTheme } from "../renderer/vividWorld";
import { type TankAnim, createTankAnim, stepTankAnim } from "../renderer/tankArt";
import { recordFrame, trimPerf } from "../lib/perfProbe";
import type { TankSkin } from "../lib/tankSkins";
import { useFortressCanvas } from "./useFortressCanvas";

const FRAME_MS = 1000 / TICKS_PER_SECOND;
const MAX_CATCH_UP_MS = 250;
/** 화면 위 HUD(바람 게이지)에 가리는 높이(px) */
const HUD_TOP = 84;
/** 그리기 시간(ms, 지수 평균)이 이보다 긴 프레임이 이어지면 품질을 낮춘다 — 한 번 낮추면 그 화면 동안 유지 */
const SLOW_DRAW_MS = 8;
const SLOW_FRAMES_TO_DROP = 90;
/** 맵 밖으로 나간 탄의 OUT 표시 시간(ms) */
const OUT_SHOW_MS = 1200;

/** 쏜 탄의 첫 두 표본으로 포신 각도(도, 0 = 오른쪽, 90 = 위) */
export function barrelAngleFromShot(events: readonly MatchEvent[]): number | null {
  const shot = events.find((e) => e.type === "shot");
  if (!shot || shot.type !== "shot" || shot.samples.length < 4) return null;
  const [x0, y0, x1, y1] = shot.samples;
  const deg = (Math.atan2(y0 - y1, x1 - x0) * 180) / Math.PI;
  return Math.max(0, Math.min(180, Math.round(deg)));
}

/** terrain = 연출 중 "그 순간의 지형"(턴 시작 지형에 지난 폭발을 차례로 적용), blastsApplied = 적용한 폭발 수 */
/** shooter — 이 행동을 한 차례 탱크(발사 반동 연출) · weaponId — 쏜 무기(시안의 무기별 탄·폭발, 없으면 기본 포탄 모양) */
type Playback = { before: (Tank | null)[]; events: MatchEvent[]; next: MatchState; tick: number; end: number; terrain: Terrain; blastsApplied: number; shooter: number; weaponId?: number };

/** play의 연출 재료 — 엔진 결과에는 없는 값(행동에서 온다) */
export type PlayMeta = { weaponId?: number };

/** 팀전은 팀 색, 개인전은 slot 색 */
export function slotColor(state: MatchState, slot: number): string {
  const t = state.tanks[slot];
  return state.mode === "team" && t ? TEAM_COLORS[t.team] : SLOT_COLORS[slot];
}

/** 캔버스 끌기 조준 — start가 true를 돌려주면 그 손가락은 카메라 대신 조준을 움직인다(월드 좌표) */
export type AimDrag = { start: (x: number, y: number, zoom: number) => boolean; move: (x: number, y: number, zoom: number) => void; end: () => void };

/** 이 탱크의 적 중 가장 가까운 살아 있는 탱크 — 팀전은 다른 팀, 개인전은 남 전부 */
export function nearestEnemy(state: MatchState, tanks: readonly { slot: number; x: number; y: number; alive: boolean }[], slot: number, from: { x: number; y: number }) {
  const me = state.tanks[slot];
  let best: { slot: number; x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const t of tanks) {
    if (!t.alive || t.slot === slot) continue;
    const other = state.tanks[t.slot];
    if (state.mode === "team" && me && other && other.team === me.team) continue;
    const d = Math.abs(t.x - from.x);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/**
 * 전장 캔버스 — 보이는 state 1개 + 턴 연출 1개를 30틱/초 고정 스텝으로 그린다 (경기·리플레이 공용)
 * - play(before, events, next, meta?): 턴 연출 시작(meta.weaponId — 시안의 무기별 연출). 끝나면 보이는 state = next, onPlaybackEnd(next)
 * - show(state): 연출을 버리고 그 state로 바로(지형 전체 다시 칠함) — 리플레이 턴 이동
 * - setPaused: 연출 틱을 멈춘다(카메라 조작은 그대로)
 * 카메라: 한 손가락 끌기 = 팬, 두 손가락 = 핀치, 휠 = 줌. 만지면 그 턴 자동 추적을 멈춘다
 */
/** 시안 폭발 재료 — 파편·먼지는 맵 지면 색, 불은 무기 색 */
function blastStyle(mapId: MapId, w: WeaponFx): BlastStyle {
  const g = worldTheme(mapId).ground;
  return { kind: w.kind, fire: w.fire, debris: [g.cap, g.capDark, g.bands[0], g.bands[2], g.pebble], dust: g.pebble };
}

/** 한 프레임 — onFrame이 받는다. 폭발은 화면 px(가운데·반지름)·진행(0~1) */
export type BattleFrame = {
  source: HTMLCanvasElement;
  width: number;
  height: number;
  time: number;
  reducedMotion: boolean;
  flash: number;
  blasts: { x: number; y: number; r: number; progress: number }[];
  /** 자동 품질 — low면 후처리도 끈다 */
  quality: Quality;
  /** 프레임 간격이 밀린다(후처리가 켜진 동안) — 후처리가 원인일 수 있어 전장 품질보다 먼저 후처리를 끈다 */
  slow: boolean;
};

export function useBattleView({
  initial,
  getAim,
  labelOf,
  skinOf,
  aimDrag,
  getInsets,
  onPlaybackEnd,
  look = DEFAULT_LOOK,
  onFrame,
  origin,
  onCues,
}: {
  initial: MatchState;
  getAim?: () => Aim | null;
  /** 탱크 이름표 글자 */
  labelOf?: (slot: number) => string;
  /** 탱크 스킨(F7) — 없으면 기본 */
  skinOf?: (slot: number) => TankSkin;
  aimDrag?: AimDrag;
  /** 전장 위에 겹친 조작부가 가리는 아래 높이·양옆 폭(px) — 카메라가 그 안쪽에 담는다 */
  getInsets?: () => { bottom: number; side?: number };
  onPlaybackEnd: (next: MatchState) => void;
  /** 시안(D-025 B) — 그리기만 바뀐다(엔진·카메라 규칙 그대로) */
  look?: Look;
  /** 한 프레임을 그린 뒤 — 시안 glow의 WebGL 후처리가 이 캔버스를 원본으로 쓴다(폭발 자리는 화면 px) */
  onFrame?: (frame: BattleFrame) => void;
  /** 연출 사건의 소리 신호(D-025 보충 6) — 프레임마다 그 사이에 지난 발사(행동당 첫 탄)·착탄·피격·격파를 한 번에. 그림과 무관(classic도) */
  onCues?: (cues: FortressCue[]) => void;
  /** 경기 시작 때 지형 — vivid가 "원래 지표면"(풀)과 "파인 면"(그을린 흙)을 가르는 기준. 없으면 initial의 지형(중간에 들어온 온라인 경기는 넘겨야 한다) */
  origin?: Terrain;
}) {
  const shownRef = useRef(initial);
  const originRef = useRef(origin);
  const onCuesRef = useRef(onCues);
  onCuesRef.current = onCues;
  originRef.current = origin;
  const lookRef = useRef(look);
  lookRef.current = look;
  /** 시안 탱크 애니메이션 상태(slot별) — 반동·번쩍임·궤도·포신·잔해 */
  const animsRef = useRef(new Map<number, TankAnim>());
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const playbackRef = useRef<Playback | null>(null);
  const pausedRef = useRef(false);
  const layerRef = useRef<TerrainLayer | null>(null);
  const cameraRef = useRef<Camera>({ cx: 1024, cy: 600, zoom: TURN_ZOOM });
  const followRef = useRef(true);
  /** 자동 추적 중인가 — "내 탱크로" 버튼 표시용(바뀔 때만 다시 그린다) */
  const [following, setFollowing] = useState(true);
  const setFollow = useCallback((v: boolean) => {
    if (followRef.current === v) return;
    followRef.current = v;
    setFollowing(v);
  }, []);
  /** 조준을 끌고 있는 손가락 — 이 손가락은 카메라를 움직이지 않고, 끄는 동안 자동 추적도 멈춘다 */
  const aimPointerRef = useRef<number | null>(null);
  /** 전장을 끌거나 집고 있는 손가락(둘러보기) */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  /** 비행 중 "내 탱크로" — 다음 프레임에 비행 계획을 지금 틱부터 다시 세운다 */
  const resumeFlightRef = useRef(false);
  const aimDragRef = useRef(aimDrag);
  aimDragRef.current = aimDrag;
  const getInsetsRef = useRef(getInsets);
  getInsetsRef.current = getInsets;
  const getAimRef = useRef(getAim);
  getAimRef.current = getAim;
  const labelOfRef = useRef(labelOf);
  labelOfRef.current = labelOf;
  const skinOfRef = useRef(skinOf);
  skinOfRef.current = skinOf;
  /** 마지막으로 쏜 포신 각도 — 처음엔 맵 가운데를 향한다 */
  const barrelsRef = useRef(new Map<number, number>());
  const fxRef = useRef(createEffects());
  const onEndRef = useRef(onPlaybackEnd);
  onEndRef.current = onPlaybackEnd;

  /** 사용자 조작·리사이즈에서도 자동 추적과 같은 아래쪽 여백(데스크톱 조작부) */
  // 하늘 높이 뜬 탄을 보고 있을 때 손대도 지금 위치에서 뚝 떨어지지 않게 — 지금 화면 위쪽까지는 범위로 둔다
  const userBounds = () => {
    const c = cameraRef.current;
    const view = viewRef.current;
    const insets = getInsetsRef.current?.();
    return { bottomPx: insets?.bottom ?? 0, sidePx: insets?.side ?? 0, skyTop: view.height > 0 ? c.cy - view.height / 2 / c.zoom : undefined };
  };
  const { containerRef, canvasRef, ctxRef, viewRef } = useFortressCanvas((view) => {
    cameraRef.current = clampCamera(cameraRef.current, view, userBounds());
  });
  /** show()로 턴을 건너뛰면 늘린다 — 루프가 지난 착탄·OUT·입자를 버린다 */
  const resetGenRef = useRef(0);

  const focusTurn = useCallback(
    (s: MatchState) => {
      const t = s.tanks[s.turn.slot];
      if (t) cameraRef.current = clampCamera({ cx: t.x, cy: t.y - 120, zoom: TURN_ZOOM }, viewRef.current, { bottomPx: getInsetsRef.current?.().bottom ?? 0, sidePx: getInsetsRef.current?.().side ?? 0 });
      setFollow(true);
    },
    [viewRef, setFollow],
  );

  // 지형 레이어 — 처음 보이는 state로 전체를 한 번 칠한다
  useEffect(() => {
    layerRef.current = createTerrainLayer({ vivid: usesVivid(lookRef.current), mapId: shownRef.current.mapId });
    if (layerRef.current) paintAll(layerRef.current, shownRef.current.terrain, originRef.current);
    focusTurn(shownRef.current);
  }, [focusTurn]);

  const play = useCallback((before: MatchState, events: MatchEvent[], next: MatchState, meta?: PlayMeta) => {
    shownRef.current = before;
    const angle = barrelAngleFromShot(events);
    if (angle !== null) barrelsRef.current.set(before.turn.slot, angle);
    // 포신을 끄던 손가락은 여기서 놓는다 — 쥔 채로 두면 탄 추적이 멈춘다
    aimPointerRef.current = null;
    playbackRef.current = { before: before.tanks, events, next, tick: 0, end: playbackEnd(events), terrain: before.terrain, blastsApplied: 0, shooter: before.turn.slot, weaponId: meta?.weaponId };
    // 둘러보는 손가락이 전장에 있으면 추적을 켜지 않는다 — 켜면 손가락과 자동 추적이 프레임마다 서로 당긴다("내 탱크로"로 다시 켤 수 있다)
    if (pointersRef.current.size === 0) setFollow(true);
    trimPerf();
  }, [setFollow]);

  const show = useCallback(
    (s: MatchState) => {
      playbackRef.current = null;
      shownRef.current = s;
      resetGenRef.current++;
      fxRef.current.particles = [];
      fxRef.current.shake = 0;
      fxRef.current.flash = 0;
      // 메가탄 붉은 틴트도 버린다(리플레이 턴 이동·재동기화 뒤 화면이 붉게 남지 않게)
      fxRef.current.tint = 0;
      animsRef.current.clear();
      if (layerRef.current) paintAll(layerRef.current, s.terrain, originRef.current);
      focusTurn(s);
    },
    [focusTurn],
  );

  const setPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused;
  }, []);

  // 게임 루프 — 연출 틱을 진행하고 매 프레임 그린다
  useEffect(() => {
    const clock = createClock();
    let raf = 0;
    let lastFrame = 0;
    let drawAvg = 0;
    let slowFrames = 0;
    let quality: Quality = "high";
    // 시안 — 프레임 간격으로도 느린 기기를 본다(그리기는 짧은데 래스터·합성이 느린 기기). classic은 그리기 시간만(지금 그대로)
    let jank = createJankJudge();
    /** 후처리가 켜진 동안 프레임이 밀렸다 — 다음 프레임에 후처리에 알린다 */
    let glowSlow = false;
    const fx = fxRef.current;
    const motion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const colorOf = (slot: number) => slotColor(shownRef.current, slot);
    const maxHpOf = (slot: number) => {
      const t = shownRef.current.tanks[slot];
      return t ? TANKS[t.tankId].hp : 0;
    };
    const barrelOf = (slot: number) => {
      const saved = barrelsRef.current.get(slot);
      if (saved !== undefined) return saved;
      const t = shownRef.current.tanks[slot];
      return t && t.x > WORLD_WIDTH / 2 ? 120 : 60;
    };
    /** 시안 탱크 연출 — 이 프레임까지 지난 이벤트(발사·피격·격파)를 반영하고, 궤도·포신·반동을 진행한다. 그리기 전용 */
    const stepTankAnims = (tanks: readonly TankView[], aim: Aim | null, dt: number, paused: boolean) => {
      const anims = animsRef.current;
      const pb = playbackRef.current;
      if (pb !== animPb) {
        animPb = pb;
        animTick = -1;
        animFired = false;
      }
      if (pb) {
        // 발사 연출(반동·포구 연기·흔들림)은 행동마다 처음 탄 한 번 — 분열탄 자식탄·폭격 폭탄도 shot이라 공중에서 다시 나지 않게
        const e0 = firstShotIn(pb.events, animTick, pb.tick, animFired);
        if (e0) {
          animFired = true;
          const a = anims.get(pb.shooter);
          if (a) {
            // 반동 — 움직임 줄이기면 밀리지 않는다(포구 연기는 그대로)
            if (!fx.reducedMotion) a.recoil = 1;
            // 포구 연기·바닥 먼지 — 방향은 탄의 첫 두 표본
            const n = e0.samples.length;
            const dx = n >= 4 ? e0.samples[2] - e0.samples[0] : 1;
            const dy = n >= 4 ? e0.samples[3] - e0.samples[1] : 0;
            const len = Math.hypot(dx, dy) || 1;
            const shooter = tanks.find((x) => x.slot === pb.shooter);
            spawnMuzzleBlast(fx, e0.samples[0], e0.samples[1], dx / len, dy / len, shooter?.x ?? e0.samples[0], shooter?.y ?? e0.samples[1]);
            if (!fx.reducedMotion) fx.shake = Math.max(fx.shake, 2.5);
          }
        }
        for (const e of pb.events) {
          if (e.t <= animTick || e.t > pb.tick) continue;
          if (e.type === "damage") {
            const a = anims.get(e.slot);
            // 피격 — 흰 번쩍임 + 피해에 비례한 흔들림(움직임 줄이기면 둘 다 없다)
            if (a && !fx.reducedMotion) {
              a.flash = 1;
              a.jolt = Math.max(a.jolt, hitJolt(e.amount));
            }
          } else if (e.type === "death") {
            const t = tanks.find((x) => x.slot === e.slot);
            // 격파 폭발 — 이 함수는 시안에서만 돈다(classic엔 원래 없다)
            if (t) spawnExplosionVivid(fx, t.x, t.y - 10, 44, blastStyle(shownRef.current.mapId, weaponFx(2)));
          }
        }
        animTick = pb.tick;
      }
      for (const t of tanks) {
        let a = anims.get(t.slot);
        const target = aim && aim.slot === t.slot ? aim.angle : barrelOf(t.slot);
        if (!a) {
          a = createTankAnim(t.x, target);
          if (!t.alive) a.wreck = 1;
          anims.set(t.slot, a);
        }
        stepTankAnim(a, t.x, target, t.alive, dt, fx.reducedMotion);
        // 충전 중 — 파워가 오를수록 조금씩 더 움찔(움직임 줄이기면 없다)
        if (aim?.charging && aim.slot === t.slot && !fx.reducedMotion) a.jolt = Math.max(a.jolt, 0.5 + aim.power * 0.014);
        // 많이 다친 탱크 — 검은 연기가 피어오른다
        const max = maxHpOf(t.slot);
        // 일시정지 중에는 연기를 만들지 않는다 — 입자가 멈춰 있어 같은 자리에 쌓인다
        if (!paused && t.alive && max > 0 && t.hp / max < 0.35 && Math.random() < dt * 0.006) spawnTrailSmoke(fx, t.x + (Math.random() - 0.5) * 10, t.y - 18);
        // 격파된 잔해 — 툰 연기가 계속 피어오른다(초당 약 1.5덩이, 품질 low면 줄인다)
        if (!paused && !t.alive && Math.random() < dt * (fx.quality === "low" ? 0.0006 : 0.0015)) spawnWreckSmoke(fx, t.x, t.y - 6);
      }
    };
    /** 마지막 착탄(또는 맵 밖으로 나간 탄) 뒤 카메라가 머무는 시각까지 */
    let holdUntil = 0;
    /** 맵 밖으로 나간 탄 표시 — 화면 가장자리 OUT */
    let outs: { x: number; y: number; until: number }[] = [];
    let outSeen = new Set<number>();
    let seenPlayback: Playback | null = null;
    /** 탱크 연출이 이벤트를 어디까지 반영했나 — 같은 행동 안에서 틱이 지날 때만 */
    /** 차례 탱크와 그 차례를 받은 시각(차례 시작 고리) */
    let lastActive: number | null = null;
    let activeSince = 0;
    /** 소리 신호를 어디까지 냈나(연출마다 처음부터) */
    let cueTick = -1;
    let cueFired = false;
    let animPb: Playback | null = null;
    let animTick = -1;
    /** 이 행동의 발사 연출을 이미 했나(행동마다 한 번) */
    let animFired = false;
    /** 이번 연출의 비행 계획(발사 순간 한 번) · 지난 목표(따라갈 때 되돌아가지 않게) */
    let flight: FlightPlan | null = null;
    let flightPrev = { cx: 0, cy: 0 };
    /** 계획을 세운 화면 크기·아래 가림 — 비행 중 회전·리사이즈·조작부 높이가 바뀌면 다시 세운다 */
    let flightView = { width: 0, height: 0, bottomPx: 0, sidePx: 0 };
    /** 계획을 세우고 시작 — 차분한 추종으로 탄을 놓치는 발이면 처음에 한 번 컷. resume이면(회전·리사이즈) 지난 목표에서 이어 간다 */
    const replan = (pb: Playback, view: ViewSize, resume: boolean) => {
      const reducedMotion = motion?.matches ?? false;
      const prevFlight = flight;
      const bottomPx = getInsetsRef.current?.().bottom ?? 0;
      const sidePx = getInsetsRef.current?.().side ?? 0;
      flight = planFlight(pb.events, view, { hudTop: HUD_TOP, bottomPx, sidePx }, reducedMotion);
      flightView = { width: view.width, height: view.height, bottomPx, sidePx };
      if (!flight) return;
      const begin = flightBegin(flight, pb.events, cameraRef.current, view, { reducedMotion, resume: resume && prevFlight ? flightPrev : undefined, fromTick: pb.tick });
      if (begin.cut && followRef.current) cameraRef.current = begin.cut;
      flightPrev = begin.prev;
    };
    let seenGen = resetGenRef.current;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const ctx = ctxRef.current;
      const view: ViewSize = viewRef.current;
      if (!ctx || view.width === 0) return;
      const dt = lastFrame > 0 ? Math.min(now - lastFrame, 200) : 16;
      fx.quality = quality;
      fx.rich = usesVivid(lookRef.current);
      // 시안 파편이 떨어질 땅 — 연출 중엔 패인 지형, 아니면 보이는 state
      const groundTerrain = playbackRef.current?.terrain ?? shownRef.current.terrain;
      fx.ground = (x, y) => {
        const col = groundTerrain.cols[Math.round(x)];
        return col ? groundAt(col, y) : -1;
      };
      fx.reducedMotion = motion?.matches ?? false;
      if (seenGen !== resetGenRef.current) {
        seenGen = resetGenRef.current;
        holdUntil = 0;
        outs = [];
      }
      const pb = playbackRef.current;
      if (pb !== seenPlayback) {
        seenPlayback = pb;
        cueTick = -1;
        cueFired = false;
        outSeen = new Set();
        flight = null;
        resumeFlightRef.current = false;
        if (pb) replan(pb, view, false);
      }
      let advanced = 0;
      const paused = pb !== null && pausedRef.current;
      if (pb && !paused) {
        advanceClock(clock, now, MAX_CATCH_UP_MS);
        while (clock.acc >= FRAME_MS && pb.tick < pb.end) {
          pb.tick++;
          advanced++;
          clock.acc -= FRAME_MS;
        }
        const passed = explosionsUntil(pb.events, pb.tick, pb.blastsApplied);
        // 소리 신호 — 이 프레임에 지난 사건(일시정지면 진행이 없어 울리지 않는다)
        const cues: FortressCue[] = [];
        const weapon = weaponFx(pb.weaponId).kind;
        const shot = firstShotIn(pb.events, cueTick, pb.tick, cueFired);
        if (shot) {
          cueFired = true;
          cues.push({ kind: "fire", weapon });
        }
        for (const b of passed.blasts) cues.push({ kind: "explode", weapon, radius: b.r });
        for (const e of pb.events) {
          if (e.t <= cueTick || e.t > pb.tick) continue;
          if (e.type === "damage") cues.push({ kind: "hit", amount: e.amount });
          else if (e.type === "death") cues.push({ kind: "death" });
        }
        cueTick = pb.tick;
        if (cues.length > 0) onCuesRef.current?.(cues);
        for (const b of passed.blasts) {
          if (usesVivid(lookRef.current)) spawnExplosionVivid(fx, b.x, b.y, b.r, blastStyle(shownRef.current.mapId, weaponFx(pb.weaponId)));
          else spawnExplosion(fx, b.x, b.y, b.r);
          holdUntil = now + IMPACT_HOLD_MS;
          const carve = carveCircle(pb.terrain, b.x, b.y, b.r);
          if (!carve) continue;
          pb.terrain = carve.terrain;
          if (layerRef.current) {
            paintColumns(layerRef.current, pb.terrain, carve.x0, carve.x1);
            scorch(layerRef.current, b.x, b.y, b.r);
          }
        }
        pb.blastsApplied = passed.applied;
        // 맵 밖으로 나간 탄 — 마지막 표본이 지난 틱에 OUT 표시
        for (const e of pb.events) {
          if (e.type !== "shot" || e.end !== "out" || outSeen.has(e.projectileId)) continue;
          const last = e.samples.length / 2 - 1;
          if (pb.tick < e.t + last) continue;
          outSeen.add(e.projectileId);
          const x = e.samples[last * 2];
          const y = e.samples[last * 2 + 1];
          outs.push({ x, y, until: now + OUT_SHOW_MS });
          holdUntil = now + IMPACT_HOLD_MS;
        }
        if (pb.tick >= pb.end) {
          playbackRef.current = null;
          resetClock(clock);
          shownRef.current = pb.next;
          onEndRef.current(pb.next);
        }
      } else resetClock(clock);
      outs = outs.filter((o) => o.until > now);

      const s = shownRef.current;
      const playing = playbackRef.current;
      const aim = playing ? null : (getAimRef.current?.() ?? null);
      const tanks = playing ? tanksAt(playing.before, playing.events, playing.tick) : tanksAt(s.tanks, [], 0);
      const shells = playing ? shellsAt(playing.events, playing.tick) : [];
      if (usesVivid(lookRef.current)) stepTankAnims(tanks, aim, dt, paused);
      // 연기 꼬리는 연출 틱이 진행한 만큼만(일시정지·고주사율 화면에서 쌓이지 않게), 입자도 일시정지 중엔 멈춘다
      for (let k = Math.min(advanced, 3); k > 0; k--) for (const sh of shells) spawnTrailSmoke(fx, sh.x, sh.y);
      if (!paused) updateEffects(fx, dt, s.wind);
      // 카메라 — 규칙은 renderer/follow. 포신을 끄는 동안은 멈춘다(움직이는 카메라 기준으로 끈 각도가 흔들리지 않게)
      // 연출 중: 탄이 날면 비행 계획대로, 탄이 없으면(낙하·여운) 머문다. 연출 뒤: 착탄 직후 잠깐 머물렀다가 다음 차례로 천천히 한 번
      const bottomPx = getInsetsRef.current?.().bottom ?? 0;
      const sidePx = getInsetsRef.current?.().side ?? 0;
      if (followRef.current && aimPointerRef.current === null) {
        if (playing) {
          // 회전·리사이즈·조작부 높이 변화, 또는 비행 중 "내 탱크로"로 추적을 다시 켰으면 지금 틱부터 다시 계획
          if (flightView.width !== view.width || flightView.height !== view.height || flightView.bottomPx !== bottomPx || flightView.sidePx !== sidePx || resumeFlightRef.current) replan(playing, view, true);
          resumeFlightRef.current = false;
          if (flight && shells.length > 0) {
            const target = flightTarget(flight, shells, flightPrev);
            flightPrev = target;
            cameraRef.current = flightStep(flight, cameraRef.current, view, target, dt);
          }
        } else if (holdUntil <= now) {
          const active = tanks.find((t) => t.slot === s.turn.slot) ?? null;
          const me = aim ? { x: aim.x, y: aim.y } : active;
          const plan = followPlan({ view, me, enemy: me && active && s.result.kind === "ongoing" ? nearestEnemy(s, tanks, active.slot, me) : null, hudTop: HUD_TOP, bottomPx, sidePx });
          if (plan) cameraRef.current = approachLimited(cameraRef.current, view, plan.target, TURN_MOTION, dt, plan.bounds);
        }
      }
      const t0 = performance.now();
      const blasts = playing ? blastsAt(playing.events, playing.tick) : [];
      // 차례를 받은 시각 — 시안의 차례 시작 고리(차례 탱크가 바뀌거나 연출이 끝나 다시 조준할 때)
      const activeSlot = playing || s.result.kind !== "ongoing" ? null : s.turn.slot;
      if (activeSlot !== lastActive) {
        lastActive = activeSlot;
        activeSince = now;
      }
      drawScene(ctx, {
        camera: cameraRef.current,
        view,
        layer: layerRef.current,
        tanks,
        colorOf,
        labelOf: labelOfRef.current,
        skinOf: skinOfRef.current,
        maxHpOf,
        barrelOf,
        activeSlot,
        activeSince: activeSlot === null ? undefined : activeSince,
        aim,
        shells,
        blasts,
        popups: playing ? popupsAt(playing.events, playing.tick) : [],
        outs,
        insetBottom: bottomPx,
        insetSide: sidePx,
        tankAnimOf: (slot) => animsRef.current.get(slot),
        mapId: s.mapId,
        weaponId: playing?.weaponId,
        time: now,
        wind: s.wind,
        quality,
        look: lookRef.current,
        reducedMotion: fx.reducedMotion,
        fx,
      });
      // 그리기 시간은 후처리(onFrame) 전에 잰다 — glow 비용은 GlowLayer가 따로 재서 스스로 끈다(전장 품질 판정에 섞지 않게)
      const drawMs = performance.now() - t0;
      if (onFrameRef.current && ctx.canvas) {
        const cam = cameraRef.current;
        onFrameRef.current({
          source: ctx.canvas,
          width: view.width,
          height: view.height,
          time: now,
          reducedMotion: fx.reducedMotion,
          // 시안 폭발은 화면 섬광 대신 메가탄 붉은 틴트를 쓴다 — 후처리 섬광도 그 세기로
          flash: Math.max(fx.flash, fx.tint ?? 0),
          quality,
          slow: glowSlow,
          blasts: blasts.map((b) => {
            const [x, y] = worldToScreen(cam, view, b.x, b.y);
            // 화면에 그린 불덩이와 같은 크기(멀리 볼 때 최소 크기 보정 포함)
            return { x, y, r: blastDrawRadius(b.r, cam.zoom) * cam.zoom, progress: b.progress };
          }),
        });
      }
      // 품질 자동 하향 — 그리기 시간(지수 평균)으로 판단한다(저전력 모드처럼 프레임만 30Hz로 묶인 기기를 느린 기기로 오인하지 않게)
      drawAvg = drawAvg * 0.95 + drawMs * 0.05;
      slowFrames = drawAvg > SLOW_DRAW_MS ? slowFrames + 1 : 0;
      if (slowFrames > SLOW_FRAMES_TO_DROP) quality = "low";
      if (lastFrame > 0 && usesVivid(lookRef.current) && !document.hidden && jank.push(now - lastFrame)) {
        // 후처리(glow)가 켜져 있으면 그것부터 끄고 판정을 새로 시작한다 — glow가 꺼진 뒤에도 밀리면 그때 전장 품질을 낮춘다
        if (onFrameRef.current) {
          glowSlow = true;
          jank = createJankJudge();
        } else quality = "low";
      }
      if (!onFrameRef.current) glowSlow = false;
      if (playing && lastFrame > 0) recordFrame(now - lastFrame, drawMs);
      lastFrame = now;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ctxRef, viewRef]);

  // ===== 카메라 입력 =====
  const pinchRef = useRef<number | null>(null);
  const toWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToWorld(cameraRef.current, viewRef.current, e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 0 && aimPointerRef.current === null && aimDragRef.current) {
      const [wx, wy] = toWorld(e);
      if (aimDragRef.current.start(wx, wy, cameraRef.current.zoom)) {
        aimPointerRef.current = e.pointerId;
        return;
      }
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setFollow(false);
    pinchRef.current = null;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (aimPointerRef.current === e.pointerId) {
      const [wx, wy] = toWorld(e);
      aimDragRef.current?.move(wx, wy, cameraRef.current.zoom);
      return;
    }
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const view = viewRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    if (pointers.size === 1) {
      cameraRef.current = panBy(cameraRef.current, view, e.clientX - prev.x, e.clientY - prev.y, userBounds());
    } else if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const dist = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        const mid = { x: (e.clientX + other.x) / 2 - rect.left, y: (e.clientY + other.y) / 2 - rect.top };
        if (pinchRef.current) cameraRef.current = zoomAt(cameraRef.current, view, mid.x, mid.y, dist / pinchRef.current, userBounds());
        pinchRef.current = dist;
      }
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (aimPointerRef.current === e.pointerId) {
      aimPointerRef.current = null;
      aimDragRef.current?.end();
      return;
    }
    pointersRef.current.delete(e.pointerId);
    pinchRef.current = null;
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // React onWheel은 passive라 preventDefault가 안 된다 — 직접 붙인다
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setFollow(false);
      cameraRef.current = zoomAt(cameraRef.current, viewRef.current, e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12, { bottomPx: getInsetsRef.current?.().bottom ?? 0, sidePx: getInsetsRef.current?.().side ?? 0 });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, viewRef, setFollow]);

  /**
   * 다음 발(events)을 지금 카메라에서 컷 없이 따라갈 수 있나 — AI 발사·리플레이 자동 재생이 쏘기 전에 기다릴지 정한다(lib/cameraWait)
   * 움직임 줄이기(늘 컷)·추적 꺼짐(사용자가 둘러보는 중)·캔버스가 아직 없음·탄이 없는 행동이면 기다릴 것이 없다
   */
  const cameraReadyFor = useCallback(
    (events: readonly MatchEvent[]) => {
      const view = viewRef.current;
      if (view.width === 0 || !followRef.current) return true;
      if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
      const insets = getInsetsRef.current?.();
      const plan = planFlight(events, view, { hudTop: HUD_TOP, bottomPx: insets?.bottom ?? 0, sidePx: insets?.side ?? 0 }, false);
      return !plan || readyToFly(plan, events, cameraRef.current, view);
    },
    [viewRef],
  );

  /** "내 탱크로" — 추적을 다시 켠다. 비행 중이면 지금 틱부터 다시 계획(멀리 둘러보던 자리에서 천천히 따라가다 탄을 놓치지 않게, 필요하면 컷) */
  const recenter = useCallback(() => {
    resumeFlightRef.current = true;
    setFollow(true);
  }, [setFollow]);

  const canvasHandlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp };
  return { containerRef, canvasRef, canvasHandlers, play, show, setPaused, following, recenter, cameraReadyFor };
}
