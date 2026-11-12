"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { GamePad } from "@/app/games/_shared/components/GamePad";
import { useMediaQuery } from "@/app/games/_shared/hooks/useMediaQuery";
import { type AiLevel, chooseTurn } from "../ai/chooseTurn";
import { ANGLE_MAX, type Action, type MatchConfig, type MatchEvent, type MatchState, POWER_MAX, TANKS, type Tank, WEAPONS, applyAction, createMatch, fnv1a, previewShot, stateHash } from "../engine";
import { type MatchFeed, remainingMs } from "../battle-ui/lib/matchFeed";
import { nearestEnemy, slotColor, useBattleView } from "../hooks/useBattleView";
import type { Aim } from "../renderer/drawScene";
import { type AngleView, type Facing, angleSpeech, angleView, defaultAngleToward, elevate, facingOf, turnAround } from "../lib/aimAngle";
import { aimKeyAction, focusKind } from "../lib/aimKeys";
import { CAMERA_WAIT_POLL_MS, cameraWaitDone } from "../lib/cameraWait";
import { type LastShot, aimPath, lastShotOf } from "../lib/aimAssist";
import { recordThink } from "../lib/perfProbe";
import { moveReach } from "../lib/moveReach";
import { type ReplayData, newReplayData } from "../lib/replay";
import { type TankSkin, toTankSkin } from "../lib/tankSkins";
import { type Look, lookFromUrl, usesVivid } from "../lib/look";
import { FortressGuide, markGuideSeen, readGuideSeen } from "./FortressGuide";
import { CHIP_BUTTON, Keycap, choiceClass, noMouseFocus } from "./fortressUi";
import vividStyles from "./fortressVivid.module.css";
import { useGlowLayer } from "./GlowLayer";
import { WeaponIcon } from "./WeaponIcon";
import { GameSettingsButton } from "@/app/games/_shared/components/GameSettingsButton";
import { FortressSettingsSheet } from "./FortressSettingsSheet";
import { getFortressSound } from "../lib/sound/player";
import type { FortressCue } from "../lib/sound/recipes";
import { fortressVibrate } from "../lib/fortressSettings";
import { WindGauge } from "./WindGauge";
import { PAD, fortressPadLayout, nextWeapon } from "./fortressPad";

/** slot별 조작 — 사람(이 기기) · 다른 기기(온라인, 서버가 행동을 알려 준다) · AI 레벨 */
export type Controller = "human" | "remote" | AiLevel;

/**
 * 온라인 경기(F5) — 서버 권위 턴. 행동은 서버 피드(feed.actions) 순서로만 적용하고, 내 차례 입력은 submit으로 보낸다
 * 행동마다 서버 해시와 대조해 다르면 resync, 스냅샷(epoch 변경)이면 처음부터 다시 만든다
 */
export type OnlineLink = {
  mySlot: number;
  /** slot별 표시 이름(서버 slots) */
  names: readonly string[];
  /** slot별 탱크 스킨(F7) — 없거나 모르는 id는 기본 */
  skins?: readonly TankSkin[];
  feed: MatchFeed;
  submit: (input: { move: number; angle: number; power: number; weaponId: number }) => Promise<{ ok: true } | { ok: false; code: string }>;
  resync: (report?: { seq: number; clientHash: string }) => void;
  errorMessage: (code: string) => string;
};

/** 제출이 거절됐지만 서버가 곧 그 턴을 정리하는 경우 — 입력으로 돌아가지 않고 피드를 기다린다 */
const SUBMIT_WAIT_CODES = new Set(["TURN_EXPIRED", "NOT_YOUR_TURN", "TURN_MISMATCH", "MATCH_NOT_FOUND"]);
/** 남은 시간 경고(초) — DESIGN §11 표시 */
const TIMER_WARN_MS = 5000;
/** 서버와 어긋나 resync한 횟수 상한 — 넘으면 멈추고 새로고침을 안내 */
const MAX_DESYNC_RESYNCS = 3;

/** 발사 버튼을 누르고 있으면 이 시간에 파워 0 → 100 */
const CHARGE_MS = 1600;
/**
 * 이보다 짧게 누르면 충전이 아니라 탭 — 맞춰 둔 파워(슬라이더)로 쏜다
 * (화면 낭독기 두 번 탭·실수 탭이 파워 1 발사가 되지 않게, 충전 표시도 이 뒤부터)
 */
const MIN_HOLD_MS = 250;
/** 포인터로 누른 뒤 이 안에 오는 click은 포인터가 이미 처리했다 */
const POINTER_CLICK_MS = 1000;
const AI_DELAY_MS = 450;
/** 포신 끌기 조준 — 포탑에서 이 거리(화면 px) 안을 눌러야 잡힌다, 이만큼 끌면 파워 최대 */
const AIM_GRAB_PX = 64;
const AIM_DRAG_FULL_PX = 170;
export const AI_LABELS = ["AI 하", "AI 중", "AI 상"];

/** 조작부가 전장 위 오버레이가 되는 화면 — 클래스의 lg(Tailwind 64rem~)·short-land(globals.css)와 같은 조건 */
const OVERLAY_PANEL_QUERY = "(min-width: 64rem), (orientation: landscape) and (max-height: 500px)";

/** aim 내 입력 · think AI 계산 · wait 다른 기기 차례 · submit 제출 응답·확정 대기 · play 연출 · over 끝 */
type Phase = "aim" | "think" | "wait" | "submit" | "play" | "over";

function start(config: MatchConfig): MatchState {
  const r = createMatch(config);
  if (!r.ok) throw new Error(`경기 설정 오류: ${r.reason}`);
  return r.state;
}

export function playerName(controllers: readonly Controller[], slot: number, names?: readonly string[]): string {
  const named = names?.[slot];
  if (named) return named;
  const c = controllers[slot];
  return `P${slot + 1}${c === "human" || c === "remote" ? "" : ` (${AI_LABELS[c]})`}`;
}

/** 첫 state에 행동을 차례로 적용 — 엔진이 거부하면(서버와 어긋남) ok false. slot별 지난 발도 다시 만든다(재접속·스냅샷 뒤 조준 보조) */
function replayActions(config: MatchConfig, actions: readonly Action[]): { state: MatchState; ok: boolean; lastShots: (LastShot | null)[] } {
  let state = start(config);
  const lastShots: (LastShot | null)[] = [null, null, null, null];
  for (const action of actions) {
    const r = applyAction(state, action);
    if (!r.ok) return { state, ok: false, lastShots };
    if (action.kind === "fire" && action.power > 0) lastShots[state.turn.slot] = lastShotOf(action, r.events);
    state = r.state;
  }
  return { state, ok: true, lastShots };
}

const clampPower = (p: number) => Math.max(1, Math.min(POWER_MAX, Math.round(p)));

/** 경기 1판 — 끝나면(마지막 연출까지) onFinish(리플레이 기록). online이면 서버 피드로 진행(controllers: 나 human · 남 remote) */
export function FortressMatch({
  config,
  controllers,
  onExit,
  onFinish,
  online,
  skins,
  look: lookProp,
}: {
  config: MatchConfig;
  controllers: Controller[];
  onExit: () => void;
  onFinish: (replay: ReplayData) => void;
  online?: OnlineLink;
  /** 혼자하기(AI·같은 기기)의 slot별 스킨(D-025) — 온라인은 online.skins. 없거나 모르는 id는 기본, 그리기에만 쓴다 */
  skins?: readonly TankSkin[];
  /** 경기 화면 그림(D-025 B·보충 5) — 그리기·장식만 바뀐다. 없으면 주소의 ?look(기본 vivid) — 온라인 경기도 이 규칙 */
  look?: Look;
}) {
  const [look] = useState<Look>(() => lookProp ?? lookFromUrl());
  // 경기 시작 때 지형 — 중간에 들어온 온라인 경기(재접속·늦은 입장)도 파인 면을 그을린 흙으로 칠하게
  const [origin] = useState(() => start(config).terrain);
  // 온라인은 이미 확정된 행동(재접속·늦은 입장)을 적용한 state에서 시작한다
  const [boot] = useState(() => (online ? replayActions(config, online.feed.actions) : { state: start(config), ok: true, lastShots: [null, null, null, null] }));
  const [state, setState] = useState<MatchState>(boot.state);
  const stateRef = useRef(state);
  const [phase, setPhase] = useState<Phase>("aim");
  const phaseRef = useRef<Phase>("aim");
  const replayRef = useRef<ReplayData>({ ...newReplayData(config), actions: online ? [...online.feed.actions] : [] });
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const skinsRef = useRef(skins);
  skinsRef.current = skins;
  /** 피드에서 적용한 행동 수(= 연출을 시작한 수) · 마지막으로 맞춘 스냅샷 세대 */
  const appliedRef = useRef(online ? online.feed.actions.length : 0);
  const epochRef = useRef(online?.feed.epoch ?? 0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** 제출 번호 — 늦게 온 이전 제출의 응답이 지금 제출 상태를 바꾸지 않게 */
  const submitIdRef = useRef(0);
  /** 턴이 그대로인 행동(남의 기권) 연출 뒤 돌아갈 phase — 조준값·제출 대기를 지킨다 */
  const resumePhaseRef = useRef<Phase | null>(null);
  /** 서버와 맞추지 못한 횟수 — 같은 경기에서 이만큼 넘으면 resync를 멈추고 새로고침을 안내(엔진 사본 어긋남 등) */
  const desyncCountRef = useRef(0);
  const [desyncFatal, setDesyncFatal] = useState(false);
  /** 서버 행동을 내 엔진이 거부한 피드 세대 — 스냅샷(다음 세대)이 올 때까지 멈춘다 */
  const rejectedEpochRef = useRef<number | null>(null);
  const rejectedLengthRef = useRef(0);
  const desyncReloadRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (desyncFatal) desyncReloadRef.current?.focus();
  }, [desyncFatal]);

  // 조준 입력 — slot마다 마지막 각도·파워·바라보는 쪽을 기억한다(다음 턴 시작값, 첫 턴은 가까운 적 쪽 60°)
  const lastAimRef = useRef<({ angle: number; power: number; facing: Facing } | null)[]>([null, null, null, null]);
  /** slot마다 지난 발(각도·파워·착탄점) — 조준 보조(지난 발 표시·파워 눈금) */
  const lastShotRef = useRef<(LastShot | null)[]>(boot.lastShots);
  /** 지금 바라보는 쪽 — 수직(90°)일 때 내리기가 어느 쪽으로 갈지. 핸들러는 ref로(같은 틱 연속 입력), 화면(버튼 이름·흐림)은 state로 — 90°에서 돌아서면 각도가 그대로라 state가 없으면 다시 그리지 않는다 */
  const facingRef = useRef<Facing>(1);
  const [facing, setFacingState] = useState<Facing>(1);
  const setFacing = (f: Facing) => {
    facingRef.current = f;
    setFacingState(f);
  };
  const [angle, setAngle] = useState(60);
  const [power, setPower] = useState(60);
  const [move, setMove] = useState(0);
  const [weaponId, setWeaponId] = useState(0);
  const [charge, setCharge] = useState<number | null>(null);
  const chargeStartRef = useRef(0);
  /** 충전 중(누른 채) — 상태보다 먼저 바뀐다. 패드를 키보드·보조기기로 누르면 누름·뗌이 같은 순간에 와서 상태(charge)로는 뗌을 못 알아본다 */
  const chargeActiveRef = useRef(false);
  /** 스페이스로 시작한 충전만 스페이스 keyup이 놓는다 */
  const keyChargeRef = useRef(false);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const current = state.tanks[state.turn.slot] as Tank;
  const controller = controllers[state.turn.slot];
  // beginTurn이 controllers 참조에 묶이면 부모가 새 배열로 다시 그릴 때 진행 중 턴이 초기화된다 — ref로 본다
  const controllersRef = useRef(controllers);
  controllersRef.current = controllers;

  // 길게 누르는 버튼(이동·각도·파워) 반복 — 턴이 바뀌거나 발사하면 반드시 멈춘다(누른 채 턴이 넘어가도 새지 않게)
  const repeatRef = useRef<number | null>(null);
  const repeatDelayRef = useRef<number | null>(null);
  const stopRepeat = useCallback(() => {
    if (repeatDelayRef.current !== null) window.clearTimeout(repeatDelayRef.current);
    if (repeatRef.current !== null) window.clearInterval(repeatRef.current);
    repeatDelayRef.current = null;
    repeatRef.current = null;
  }, []);
  /** 이동이 막혀 더 못 간 방향 — 안내 문구용(턴이 바뀌거나 반대로 움직이면 지운다) */
  const [moveBlocked, setMoveBlocked] = useState<"left" | "right" | null>(null);
  const moveRef = useRef(0);

  /** 새 턴 — 조준값을 그 slot의 마지막 값으로 */
  const beginTurn = useCallback(
    (s: MatchState) => {
      if (s.result.kind !== "ongoing") {
        setPhaseBoth("over");
        return;
      }
      const t = s.tanks[s.turn.slot] as Tank;
      const enemy = nearestEnemy(s, s.tanks.filter((x): x is Tank => x !== null), t.slot, t);
      const last = lastAimRef.current[t.slot] ?? { angle: defaultAngleToward(t.x, enemy ? enemy.x : null), power: 60, facing: enemy && enemy.x < t.x ? -1 : 1 };
      stopRepeat();
      keyChargeRef.current = false;
      chargeActiveRef.current = false;
      setCharge(null);
      const face = facingOf(last.angle, last.facing);
      facingRef.current = face;
      setFacingState(face);
      setAngle(last.angle);
      setPower(last.power);
      setMove(0);
      moveRef.current = 0;
      setMoveBlocked(null);
      const owned = TANKS[t.tankId].weapons;
      setWeaponId((w) => (owned.includes(w) && (WEAPONS[w].cooldown === 0 || t.cooldown === 0) ? w : owned[0]));
      const who = controllersRef.current[t.slot];
      // 차례 소리 — 이 기기의 사람 차례면 "내 차례", 아니면 짧은 턴 넘김
      getFortressSound().play({ kind: who === "human" ? "myTurn" : "turn" });
      // 지난 제출 오류는 내 다음 차례가 오면 지운다(남의 턴 동안은 남겨 둔다)
      if (who === "human") setSubmitError(null);
      setPhaseBoth(who === "human" ? "aim" : who === "remote" ? "wait" : "think");
    },
    [stopRepeat],
  );

  const controlsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  /** 데스크톱 조작부가 전장 아래를 가리는 높이(px) */
  const overlayInsetRef = useRef(0);
  /** 터치 가로 화면에서 전장 위에 겹친 패드가 가리는 양옆 폭(px) — 카메라가 그 안쪽에 담는다(D-025) */
  const overlaySideRef = useRef(0);
  /** 터치 기기 — 공용 패드(D-025 보충 2). 데스크톱(마우스)은 기존 조작부 */
  const touch = useMediaQuery("(pointer: coarse)");
  const landscape = useMediaQuery("(orientation: landscape)");
  /** 발사 버튼을 포인터로 누른 시각 — 뒤따르는 click을 두 번째 발사로 치지 않게 */
  const pointerFireAtRef = useRef(-Infinity);
  /** 캔버스 끌기 조준이 쓸 최신 값 — 훅에는 한 번 넘긴 객체가 ref로 본다 */
  const dragRef = useRef<{ canAim: boolean; setAim: (angle: number, power: number) => void }>({ canAim: false, setAim: () => {} });
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const fireButtonRef = useRef<HTMLButtonElement>(null);
  /** 포커스를 돌려줄 slot — null이면 돌려주지 않는다 */
  const restoreFocusRef = useRef<number | null>(null);
  const aimRef = useRef<Aim | null>(null);
  // 소리(D-025 보충 6) — 경기 배경음, 연출 사건의 효과음·진동(설정·움직임 줄이기에 따라)
  useEffect(() => {
    const sound = getFortressSound();
    sound.setMusic("match");
    return () => sound.setMusic(null);
  }, []);
  const onCues = useCallback((cues: FortressCue[]) => {
    getFortressSound().playCues(cues);
    // 진동 — 큰 사건 하나만(격파 > 가장 큰 폭발)
    if (cues.some((c) => c.kind === "death")) fortressVibrate([60, 40, 90]);
    else {
      const r = Math.max(0, ...cues.map((c) => (c.kind === "explode" ? c.radius : 0)));
      if (r > 0) fortressVibrate(Math.round(12 + r * 0.45));
    }
  }, []);
  // 시안 glow — WebGL 후처리 층(three는 켜질 때만 동적 import)
  const glow = useGlowLayer(look === "glow");
  const view = useBattleView({
    initial: state,
    getAim: () => aimRef.current,
    labelOf: (slot) => onlineRef.current?.names[slot] ?? `P${slot + 1}`,
    skinOf: (slot) => toTankSkin((onlineRef.current ? onlineRef.current.skins : skinsRef.current)?.[slot]),
    look,
    origin,
    onCues,
    onFrame: glow.onFrame,
    // 포신 근처를 누르고 끌면 끈 방향이 각도, 끈 거리가 파워(손을 떼도 쏘지 않는다 — 발사 버튼으로)
    aimDrag: {
      start: (x, y, zoom) => {
        const a = aimRef.current;
        if (!dragRef.current.canAim || !a) return false;
        const origin = { x: a.x, y: a.y - 14 };
        if (Math.hypot(x - origin.x, y - origin.y) * zoom > AIM_GRAB_PX) return false;
        dragOriginRef.current = origin;
        return true;
      },
      move: (x, y, zoom) => {
        const o = dragOriginRef.current;
        // 끄는 사이 발사·턴 전환이 되면 끊는다(다음 사람의 각도·파워를 덮어쓰지 않게)
        if (!o || !dragRef.current.canAim) {
          dragOriginRef.current = null;
          return;
        }
        const deg = Math.round((Math.atan2(o.y - y, x - o.x) * 180) / Math.PI);
        const dist = Math.hypot(x - o.x, y - o.y) * zoom;
        if (dist < 12) return;
        dragRef.current.setAim(Math.max(0, Math.min(ANGLE_MAX, deg < -90 ? 180 : deg < 0 ? 0 : deg)), clampPower((dist / AIM_DRAG_FULL_PX) * POWER_MAX));
      },
      end: () => {
        dragOriginRef.current = null;
      },
    },
    getInsets: () => ({ bottom: overlayInsetRef.current, side: overlaySideRef.current }),
    onPlaybackEnd: (next) => {
      stateRef.current = next;
      setState(next);
      verifyHash(appliedRef.current, next);
      const resume = resumePhaseRef.current;
      resumePhaseRef.current = null;
      // 남의 기권처럼 턴이 그대로면 새 턴으로 치지 않는다(조준값 유지, 제출 중이면 계속 대기)
      if (resume && next.result.kind === "ongoing") setPhaseBoth(resume);
      else beginTurn(next);
    },
  });
  const { play } = view;

  /** 서버와 어긋났다 — 몇 번까지만 resync하고, 그래도 안 맞으면 멈추고 새로고침 안내(끝없는 resync·재시뮬레이션 방지) */
  const requestResync = useCallback((report?: { seq: number; clientHash: string }) => {
    const link = onlineRef.current;
    if (!link) return;
    desyncCountRef.current += 1;
    if (desyncCountRef.current > MAX_DESYNC_RESYNCS) {
      setDesyncFatal(true);
      return;
    }
    link.resync(report);
  }, []);

  // 처음 받은 피드(재접속·늦은 입장)를 내 엔진이 끝까지 적용하지 못했다 — 재구성 경로와 같이 맞춘다(StrictMode 두 번 실행에도 한 번)
  const bootCheckedRef = useRef(false);
  useEffect(() => {
    if (bootCheckedRef.current) return;
    bootCheckedRef.current = true;
    if (!boot.ok) requestResync();
  }, [boot, requestResync]);

  /** 온라인 — 행동 count개를 적용한 state가 서버 해시와 다르면 resync(마지막 적용 수·내 해시를 싣는다) */
  const verifyHash = useCallback(
    (count: number, s: MatchState) => {
      const link = onlineRef.current;
      const expected = link?.feed.hashes[count - 1];
      if (!link || !expected) return true;
      const mine = stateHash(s);
      if (mine === expected) return true;
      console.warn(`[fortress] 해시 불일치 seq=${count} client=${mine} server=${expected} — resync`);
      requestResync({ seq: count, clientHash: mine });
      return false;
    },
    [requestResync],
  );

  /** 행동 적용 → 기록 → 연출 시작 */
  const playAction = useCallback(
    (action: Action) => {
      const s = stateRef.current;
      const r = applyAction(s, action);
      if (!r.ok) return false;
      replayRef.current.actions.push(action);
      if (action.kind === "fire" && action.power > 0) lastShotRef.current[s.turn.slot] = lastShotOf(action, r.events);
      // 키보드로 조작부 버튼을 쓰던 사람이면 그 사람의 다음 턴에 발사 버튼으로 포커스를 돌려준다 — 연출 중 조작부는 inert·언마운트
      // (조작부 버튼 포커스는 키보드로만 생긴다 — 아래 onMouseDown. 핫시트의 다른 사람에게 옮기면 그 사람의 스페이스가 발사 버튼을 누른다)
      const focused = document.activeElement;
      // 기억한 뒤 직접 놓는다 — inert의 포커스 해제에 기대지 않는다(핫시트 다음 사람에게 포커스가 남지 않게)
      if (focused instanceof HTMLButtonElement && controlsRef.current?.contains(focused)) {
        restoreFocusRef.current = s.turn.slot;
        focused.blur();
      }
      stopRepeat();
      // 스페이스를 누른 채 마우스로 쏘면 keyup이 리스너가 떨어진 뒤에 온다 — 키보드 충전 표시를 여기서 지운다
      keyChargeRef.current = false;
      chargeActiveRef.current = false;
      setCharge(null);
      play(s, r.events, r.state, { weaponId: action.kind === "fire" ? action.weaponId : undefined });
      setPhaseBoth("play");
      return true;
    },
    [stopRepeat, play],
  );

  /** 로컬 행동 확정 — 연출 중·경기 끝에는 받지 않는다(두 번 발사 방지) */
  const commit = useCallback(
    (action: Action) => {
      if (phaseRef.current === "play" || phaseRef.current === "over") return false;
      return playAction(action);
    },
    [playAction],
  );

  // 온라인 — 피드의 다음 행동을 연출한다(연출이 끝나면 phase가 바뀌어 다음 것). 스냅샷이 바뀌면 처음부터 다시 만든다
  const feedLength = online?.feed.actions.length ?? 0;
  const feedEpoch = online?.feed.epoch ?? 0;
  const { show } = view;
  useEffect(() => {
    const link = onlineRef.current;
    if (!link) return;
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
      else if (verifyHash(appliedRef.current, built.state)) desyncCountRef.current = 0;
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
  }, [feedLength, feedEpoch, phase, playAction, beginTurn, show, verifyHash, requestResync, desyncFatal]);

  useEffect(() => {
    beginTurn(stateRef.current);
  }, [beginTurn]);

  // 경기 끝(마지막 연출까지 본 뒤) → 결과 화면
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  useEffect(() => {
    if (phase !== "over") return;
    // 승패 소리 — 이 기기의 사람이 한 명(혼자하기·온라인)일 때만. 같은 기기 여럿이면 누구 편도 아니라 울리지 않는다
    const res = stateRef.current.result;
    const humans = controllersRef.current.map((c, slot) => (c === "human" ? slot : -1)).filter((x) => x >= 0);
    if (res.kind === "win" && humans.length === 1) getFortressSound().play({ kind: res.slots.includes(humans[0]) ? "win" : "lose" });
    onFinishRef.current(replayRef.current);
  }, [phase]);

  // 조작 안내 — 사람이 있는 경기의 첫 진입에 한 번(이후엔 ? 버튼). 열려 있는 동안은 조준·AI 차례를 멈춘다
  const [guideOpen, setGuideOpen] = useState(false);
  /** 진행 중 경기를 나가기 전 확인 — 열려 있는 동안도 조준·AI 차례를 멈춘다 */
  const [exitConfirm, setExitConfirm] = useState(false);
  /** 설정 시트(소리·진동)가 열려 있나 — 열려 있는 동안 조준·AI 차례를 멈춘다(공용 GameSettingsButton: "게임은 열릴 때 일시정지") */
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 새로고침 안내가 뜨면 열린 대화상자(나가기 확인·조작 안내)를 닫는다 — inert 영역 안이라 덮인 채 조작할 수 없게 된다
  useEffect(() => {
    if (!desyncFatal) return;
    setExitConfirm(false);
    setGuideOpen(false);
  }, [desyncFatal]);
  useEffect(() => {
    // 온라인은 서버 타이머가 흐르는 중이라 자동으로 열지 않는다(? 버튼으로 연다)
    if (!onlineRef.current && controllersRef.current.includes("human") && !readGuideSeen()) setGuideOpen(true);
  }, []);
  const closeGuide = useCallback(() => {
    markGuideSeen();
    setGuideOpen(false);
  }, []);

  // AI 차례 — 잠깐 "생각 중"을 보여 준 뒤 계산(메인 스레드, 실측은 perfProbe)
  // 고른 발을 카메라가 컷 없이 따라갈 수 있는 자리에 올 때까지 조금 더 기다린다(최대 CAMERA_WAIT_MAX_MS, lib/cameraWait) — 앞 착탄 자리에서 바로 쏘면 비행 시작에 화면이 넘어간다
  const { cameraReadyFor } = view;
  useEffect(() => {
    if (phase !== "think" || guideOpen || exitConfirm || settingsOpen) return;
    let timer = 0;
    let chosen: { action: Action; events: readonly MatchEvent[] | null; since: number } | null = null;
    const step = () => {
      const s = stateRef.current;
      const level = controllers[s.turn.slot];
      if (level === "human" || level === "remote") return;
      if (!chosen) {
        const t0 = performance.now();
        const action = chooseTurn(s, s.turn.slot, level, fnv1a([config.seed, s.turn.no]));
        recordThink(level, performance.now() - t0);
        const r = applyAction(s, action);
        chosen = { action, events: r.ok ? r.events : null, since: performance.now() };
      }
      if (chosen.events && !cameraWaitDone(performance.now() - chosen.since, cameraReadyFor(chosen.events))) {
        timer = window.setTimeout(step, CAMERA_WAIT_POLL_MS);
        return;
      }
      // AI가 거부되는 행동을 내면(규칙 변경 등) "생각 중"에 멈추지 않게 파워 0으로 넘긴다
      if (!commit(chosen.action)) {
        console.warn("[fortress] AI 행동 거부 — 넘기기로 대체", chosen.action);
        commit({ kind: "fire", move: 0, angle: 90, power: 0, weaponId: TANKS[(s.tanks[s.turn.slot] as Tank).tankId].weapons[0] });
      }
    };
    timer = window.setTimeout(step, AI_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, guideOpen, exitConfirm, settingsOpen, controllers, config.seed, commit, cameraReadyFor]);

  // 이동·각도를 바꾸면 이동 뒤 위치를 엔진 previewShot으로(같은 이동 코드)
  /** 충전 표시는 탭과 구분되는 시간이 지난 뒤부터 */
  const charging = charge !== null && charge >= Math.round((MIN_HOLD_MS / CHARGE_MS) * 100);
  // 이번 턴에 실제로 갈 수 있는 거리(비탈·벽·월드 끝) — 이동을 이 범위로 자른다
  const reach = useMemo(() => moveReach(state), [state]);
  const preview = useMemo(() => {
    if (state.result.kind !== "ongoing" || !current) return null;
    const p = previewShot(state, { kind: "fire", move, angle: 90, power: 1, weaponId: TANKS[current.tankId].weapons[0] });
    return p.ok ? p.from : null;
  }, [state, current, move]);

  // 조준 보조 — 사람 차례에만: 예상 궤적 앞 1/3(맞춘 파워 기준, 충전 중엔 숨김) · 지난 발 착탄점
  const humanAim = phase === "aim" && controller === "human" && current !== undefined && state.result.kind === "ongoing";
  const path = useMemo(
    () => (humanAim && current ? aimPath(state, { kind: "fire", move, angle, power, weaponId }) : null),
    [humanAim, state, current, move, angle, power, weaponId],
  );
  const lastShot = current ? lastShotRef.current[current.slot] : null;
  aimRef.current =
    phase === "aim" && preview && current
      ? { slot: current.slot, x: preview.x, y: preview.y, angle, power: charging ? (charge ?? power) : power, path: humanAim && charge === null ? path : null, lastImpact: humanAim ? (lastShot?.impact ?? null) : null, weaponId: humanAim ? weaponId : undefined, charging: charging || undefined }
      : null;

  // ===== 온라인 턴 시각 — 시작 연출 잠금·남은 시간 =====
  const [now, setNow] = useState(() => Date.now());
  const isOnline = online !== undefined;
  useEffect(() => {
    if (!isOnline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [isOnline]);
  const onlineTurn = online?.feed.turn ?? null;
  const started = !online || now >= online.feed.startAt;
  const timeLeft = online ? remainingMs(online.feed, now) : 0;
  // 서버 기준 내 차례이고 화면이 그 턴까지 따라왔을 때만(앞 행동 연출 중이면 아직)
  const onlineReady = !online || (onlineTurn !== null && onlineTurn.slot === online.mySlot && onlineTurn.seq === appliedRef.current && started && timeLeft > 0);

  // ===== 조준 입력 =====
  // 설정 시트가 열려 있으면 조준을 막는다(시트 뒤에서 키로 발사·이동하지 않게) — 혼자하기는 AI 차례도 멈춘다(위 think)
  const canAim = phase === "aim" && controller === "human" && !guideOpen && !exitConfirm && !settingsOpen && !desyncFatal && onlineReady;
  /** 지금 조준할 수 있나(렌더마다) — 패드가 사라지며 보내는 뗌은 사라지기 전 렌더의 핸들러로 오므로 이것으로 다시 본다 */
  const canAimRef = useRef(canAim);
  canAimRef.current = canAim;
  dragRef.current = {
    canAim,
    setAim: (a, p) => {
      setFacing(facingOf(a, facingRef.current));
      setAngle(a);
      setPower(p);
    },
  };
  const fuel = current ? current.fuel : 0;
  const maxFuel = current ? TANKS[current.tankId].fuel : 0;
  // 누르면 한 칸, 계속 누르고 있으면 잠깐 뒤부터 반복(짧은 탭이 두세 칸이 되지 않게)
  const holdRepeat = (fn: () => void) => {
    stopRepeat();
    fn();
    repeatDelayRef.current = window.setTimeout(() => {
      repeatRef.current = window.setInterval(fn, 70);
    }, 350);
  };
  useEffect(() => stopRepeat, [stopRepeat]);
  /** 포신 올리기·내리기 — 바라보는 쪽 기준(aimAngle) */
  const nudgeElevation = (d: number) => {
    // 바라보는 쪽은 지금 값으로 잡아 둔다 — updater 안에서 ref를 읽으면 나중에 다시 계산될 때 그 사이 돌아선 쪽으로 계산될 수 있다
    const face = facingRef.current;
    setAngle((a) => elevate(a, face, d));
  };
  const blockedWhy = moveBlocked === "right" ? reach?.rightWhy : moveBlocked === "left" ? reach?.leftWhy : undefined;
  const blockedText = blockedWhy === "fuel" ? "연료를 다 썼어요" : blockedWhy === "edge" ? "맵 끝이에요" : blockedWhy === "slope" ? "비탈이 가팔라 더 못 가요" : blockedWhy === "cliff" ? "더 가면 떨어져요" : null;
  const nudgeMove = (d: number) => {
    const lo = -(reach?.left ?? fuel);
    const hi = reach?.right ?? fuel;
    const next = Math.max(lo, Math.min(hi, moveRef.current + d));
    // 끝에 막혀 덜 갔거나(잘림) 아예 못 갔으면 그 방향 안내
    setMoveBlocked(next !== moveRef.current + d ? (d > 0 ? "right" : "left") : null);
    moveRef.current = next;
    setMove(next);
  };
  const nudgePower = (d: number) => setPower((p) => clampPower(p + d));
  /** 이동 버튼·키 — 반대쪽을 보고 있으면 이번 한 번은 돌아서기만(원작), 같은 쪽이면 2씩 이동 */
  const stepMove = (dir: Facing) => {
    if (facingRef.current !== dir) {
      setFacing(dir);
      setAngle((a) => turnAround(a));
      setMoveBlocked(null);
      return;
    }
    nudgeMove(dir * 2);
  };

  /** 온라인 제출 — 확정은 서버 피드로 온다. 거절되면 이유를 보이고(서버가 정리할 턴이면 기다리고) 아니면 다시 입력 */
  const submitOnline = async (input: { move: number; angle: number; power: number; weaponId: number }) => {
    const link = onlineRef.current;
    if (!link) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLButtonElement && controlsRef.current?.contains(focused)) {
      restoreFocusRef.current = stateRef.current.turn.slot;
      focused.blur();
    }
    stopRepeat();
    keyChargeRef.current = false;
    chargeActiveRef.current = false;
    setCharge(null);
    setSubmitError(null);
    setPhaseBoth("submit");
    const id = ++submitIdRef.current;
    const result = await link.submit(input);
    // 그 사이 다른 제출이 시작됐거나 이미 다음으로 넘어갔으면 이 응답은 버린다
    if (result.ok || id !== submitIdRef.current) return;
    const next: Phase = SUBMIT_WAIT_CODES.has(result.code) ? "wait" : "aim";
    if (phaseRef.current === "submit") setPhaseBoth(next);
    // 남의 기권 연출 중에 실패가 왔다 — 연출 뒤 제출 대기 대신 이 결과로 돌아간다
    else if (phaseRef.current === "play" && resumePhaseRef.current === "submit") resumePhaseRef.current = next;
    else return;
    setSubmitError(link.errorMessage(result.code));
  };

  const fire = (firePower: number) => {
    if (!canAim || !current) return;
    lastAimRef.current[current.slot] = { angle, power: firePower, facing: facingRef.current };
    if (online) void submitOnline({ move, angle, power: firePower, weaponId });
    else commit({ kind: "fire", move, angle, power: firePower, weaponId });
  };

  const startCharge = () => {
    if (!canAim) return;
    getFortressSound().play({ kind: "charge" });
    chargeStartRef.current = performance.now();
    chargeActiveRef.current = true;
    setCharge(0);
  };
  useEffect(() => {
    if (charge === null) return;
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - chargeStartRef.current;
      setCharge(Math.min(100, Math.round((elapsed / CHARGE_MS) * 100)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charge === null]); // eslint-disable-line react-hooks/exhaustive-deps -- 충전 시작·끝에만 루프를 건다
  /** 브라우저가 제스처로 가져가거나 창을 떠나는 등 취소되면 쏘지 않는다 */
  const cancelCharge = () => {
    keyChargeRef.current = false;
    chargeActiveRef.current = false;
    setCharge(null);
  };
  const release = () => {
    keyChargeRef.current = false;
    if (charge === null && !chargeActiveRef.current) return;
    chargeActiveRef.current = false;
    const elapsed = performance.now() - chargeStartRef.current;
    setCharge(null);
    if (elapsed < MIN_HOLD_MS) {
      fire(power);
      return;
    }
    const held = clampPower((elapsed / CHARGE_MS) * 100);
    setPower(held);
    fire(held);
  };
  const pass = () => {
    if (!canAim || !current) return;
    const input = { move, angle, power: 0, weaponId: TANKS[current.tankId].weapons[0] };
    if (online) void submitOnline(input);
    else commit({ kind: "fire", ...input });
  };

  // 키보드(데스크톱) — 규칙은 lib/aimKeys. 핸들러는 ref로 최신 값을 보고, 리스너는 조준 가능할 때만 한 번 붙인다
  const keyRef = useRef<{ down: (e: KeyboardEvent) => void; up: (e: KeyboardEvent) => void; cancel: () => void } | null>(null);
  keyRef.current = {
    down: (e: KeyboardEvent) => {
      const action = aimKeyAction(e, focusKind(e.target));
      if (!action) return;
      e.preventDefault();
      if (action.kind === "elevate") nudgeElevation(action.delta);
      else if (action.kind === "power") nudgePower(action.delta);
      else if (action.kind === "move") stepMove(action.dir);
      else if (action.kind === "charge" && charge === null) {
        startCharge();
        keyChargeRef.current = true;
      }
    },
    up: (e: KeyboardEvent) => {
      if (e.key === " " && keyChargeRef.current) release();
    },
    cancel: () => {
      if (keyChargeRef.current) cancelCharge();
    },
  };
  useEffect(() => {
    if (!canAim) return;
    const down = (e: KeyboardEvent) => keyRef.current?.down(e);
    const up = (e: KeyboardEvent) => keyRef.current?.up(e);
    // 스페이스를 누른 채 창을 떠나면 keyup이 오지 않는다 — 충전을 버린다
    const cancel = () => keyRef.current?.cancel();
    const onVisibility = () => document.visibilityState === "hidden" && cancel();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canAim]);

  // 조준을 못 하게 되면(안내 열기·발사·턴 전환) 진행 중인 충전을 버린다 — 리스너가 떨어져 keyup이 오지 않아 충전이 남지 않게
  // 터치 패드의 누르는 동안 반복도 멈춘다 — 패드는 조준 가능 여부가 바뀌면 다시 마운트돼(뗌) 멈추지만, 그 경로와 따로 한 번 더(이중 안전)
  useEffect(() => {
    if (canAim) return;
    keyChargeRef.current = false;
    chargeActiveRef.current = false;
    setCharge(null);
    stopRepeat();
  }, [canAim, stopRepeat]);

  // ===== 터치 패드(D-025 보충 2) — 십자 ◀▶ 이동·▲▼ 포신(누르는 동안 반복), 발사(짧게=맞춘 파워·길게=충전), 무기 바꾸기 =====
  const padHoldStart = (press: number) => {
    if (!canAim) return;
    if (press === PAD.LEFT) holdRepeat(() => stepMove(-1));
    else if (press === PAD.RIGHT) holdRepeat(() => stepMove(1));
    else if (press === PAD.UP) holdRepeat(() => nudgeElevation(1));
    else if (press === PAD.DOWN) holdRepeat(() => nudgeElevation(-1));
    else if (press === PAD.FIRE) startCharge();
  };
  const padHoldEnd = (press: number, cancelled?: boolean) => {
    if (press !== PAD.FIRE) return stopRepeat();
    // 취소(전화·알림·앱 전환·시스템 제스처가 포인터를 가져감·패드가 사라짐)면 쏘지 않는다 — 데스크톱 발사 버튼·키보드 충전과 같다
    if (cancelled) return cancelCharge();
    // 막힌 뒤(안내·확인 창·차례 끝)의 뗌은 쏘지 않고 버린다 — 패드를 새로 마운트하며 오는 뗌은 사라지기 전 렌더의 핸들러라
    // 늘 최신인 ref 둘로 본다(지금 조준할 수 있고, 충전이 아직 살아 있다 — 차례 시작·발사·제출이 충전을 지운다)
    if (canAimRef.current && chargeActiveRef.current) release();
    else cancelCharge();
  };
  const padInstant = (action: number) => {
    if (action !== PAD.WEAPON || !canAim || !current) return;
    getFortressSound().play({ kind: "weapon" });
    setWeaponId((w) => nextWeapon(current, w));
  };

  // 조작부 오버레이(데스크톱 lg · 휴대폰 가로 short-land) 높이 — 카메라가 그만큼 위로 담는다. 매 프레임 레이아웃을 읽지 않게 크기가 바뀔 때만 잰다
  useEffect(() => {
    const panel = panelRef.current;
    const wide = typeof window.matchMedia === "function" ? window.matchMedia(OVERLAY_PANEL_QUERY) : null;
    if (!panel || !wide) return;
    const measure = () => {
      overlayInsetRef.current = wide.matches ? panel.offsetHeight : 0;
      // 터치 가로 — 패드가 전장 위 양끝에 겹친다(공용 GamePad의 landscape:absolute). 왼쪽 십자 묶음·오른쪽 버튼 묶음 중 넓은 쪽
      overlaySideRef.current = 0;
      const pad = panel.querySelector<HTMLElement>('[data-testid="game-pad"]');
      if (pad && getComputedStyle(pad).position === "absolute") {
        const box = pad.getBoundingClientRect();
        const left = pad.querySelector('[data-testid="game-pad-dpad"]')?.getBoundingClientRect();
        const right = pad.querySelector('[role="group"][aria-label="버튼"]')?.getBoundingClientRect();
        overlaySideRef.current = Math.max(left ? left.right - box.left : 0, right ? box.right - right.left : 0);
      }
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(panel);
    // 가로 패드 크기는 화면 높이(vh)를 따른다 — 주소창이 접혀 높이만 바뀌어도 다시 잰다
    const pad = panel.querySelector('[data-testid="game-pad"]');
    if (pad) observer?.observe(pad);
    wide.addEventListener("change", measure);
    return () => {
      observer?.disconnect();
      wide.removeEventListener("change", measure);
    };
    // 패드가 다시 마운트되면(차례·조준 가능 여부가 바뀜) 새 노드를 다시 관찰한다 — 떨어진 옛 노드를 보고 있으면 높이(vh)만 바뀔 때 다시 재지 못한다
  }, [touch, landscape, state.turn.no, canAim]);

  // 키보드로 쏜 사람의 다음 턴이 오면 포커스를 발사 버튼으로 돌려준다(다른 사람 턴이면 버린다)
  useEffect(() => {
    if (!canAim || restoreFocusRef.current === null) return;
    const slot = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (slot === stateRef.current.turn.slot) fireButtonRef.current?.focus();
  }, [canAim]);

  const nameOf = (slot: number) => playerName(controllers, slot, online?.names);
  const enemyX = current && preview ? (nearestEnemy(state, state.tanks.filter((x): x is Tank => x !== null), current.slot, preview)?.x ?? null) : null;
  // 자동 검증용 — 지금 화면 state의 해시(탭끼리 대조), 적용한 행동 수
  const clientHash = useMemo(() => (online ? stateHash(state) : ""), [online, state]);
  const result = state.result;
  const turnColor = slotColor(state, state.turn.slot);
  const fuelLeft = fuel - Math.abs(move);
  const rounds = state.maxTurns / state.players;

  /** 각도·파워·연료 — 데스크톱은 조작부 안, 터치는 전장 위(세로)·패드 사이 줄(가로) */
  // data-tank-x·data-preview-x·data-enemy-x·data-last-impact-x — 자동 검증용(이동 반영: 엔진 위치·미리보기 위치, 조준 시험: 가까운 적·지난 착탄점)
  // compact — 터치 가로: 전장 위쪽 띠(카메라가 비워 두는 HUD 높이) 안에 한 줄로
  const renderHud = (compact: boolean) =>
    current ? (
      <dl className={compact ? "flex items-center gap-3 text-[11px] tabular-nums" : "grid grid-cols-[auto_auto_1fr] items-end gap-x-4 text-xs tabular-nums"} data-testid="fortress-hud" data-tank-x={current.x} data-preview-x={preview?.x} data-enemy-x={enemyX ?? undefined} data-last-impact-x={lastShot?.impact?.x}>
        <div className={compact ? "flex items-baseline gap-1" : undefined}>
          <dt className={compact ? "sr-only" : "text-slate-500"}>각도</dt>
          <dd className={`whitespace-nowrap font-bold text-white ${compact ? "text-sm" : "text-base"}`} data-testid="fortress-angle">
            <AngleText view={angleView(angle, facing)} />
          </dd>
        </div>
        <div className={compact ? "flex items-baseline gap-1" : undefined}>
          <dt className="text-slate-500">파워</dt>
          <dd className={`font-bold text-white ${compact ? "text-sm" : "text-base"}`}>{charging ? charge : power}</dd>
        </div>
        {/* min-w-0·truncate — 좁은 칸에서 긴 문구(이동 막힘 안내)가 칸을 밀어 옆 버튼과 겹치지 않고 말줄임으로(안내는 라이브 영역에도 있다) */}
        <div className={compact ? "flex min-w-0 items-center gap-1.5" : "min-w-0"}>
          <dt className="flex min-w-0 justify-between gap-1 text-slate-500">
            <span className="shrink-0">연료</span>
            <span className="min-w-0 truncate">
              {moveBlocked ? (
                <span className="text-amber-300" data-testid="fortress-move-blocked">
                  {blockedText}
                </span>
              ) : (
                <>
                  {/* 좁은 가로(640px 미만)는 남은 연료만 — 이동 거리는 전장의 반투명 탱크로 보인다 */}
                  <span className="short-land:max-sm:hidden">{move === 0 ? "제자리" : `${move < 0 ? "←" : "→"} ${Math.abs(move)}`} · </span>남음 <span className="text-slate-300">{fuelLeft}</span>
                </>
              )}
            </span>
          </dt>
          <dd className={`overflow-hidden rounded-full bg-slate-800 ${compact ? "h-1.5 w-12 shrink-0" : "mt-1.5 h-2"}`} aria-label={`연료 ${fuelLeft} / ${maxFuel}`} data-testid="fortress-fuel">
            <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${maxFuel > 0 ? (fuelLeft / maxFuel) * 100 : 0}%` }} />
          </dd>
        </div>
      </dl>
    ) : null;
  const hud = renderHud(false);

  return (
    // 루트 layout이 이미 <main>으로 감싼다 — 중첩하지 않는다
    <div
      className={`relative flex h-full flex-col pt-[env(safe-area-inset-top)] ${usesVivid(look) ? vividStyles.vivid : ""}`}
      data-testid="fortress-match"
      data-look={look}
      data-applied={online ? appliedRef.current : undefined}
      data-state-hash={online ? clientHash : undefined}
      data-phase={phase}
    >
      <header className="flex items-center gap-2 px-2 py-1.5 sm:px-3" inert={desyncFatal} data-hud="bar">
        {/* 진행 중이면 확인부터 — 키보드 포커스가 여기 있을 때 충전하려던 Space 한 번에 경기를 잃지 않게 */}
        <button type="button" onMouseDown={noMouseFocus} onClick={() => {
            if (state.result.kind !== "ongoing") return onExit();
            // 안내가 떠 있으면 닫고 확인을 띄운다(대화상자 둘이 겹치면 Esc·Tab이 서로 엉킨다)
            if (guideOpen) setGuideOpen(false);
            setExitConfirm(true);
          }} className={CHIP_BUTTON} aria-label={online ? "나가기" : "설정으로"} data-hud="chip">
          <span aria-hidden="true">←</span>
          <span aria-hidden="true" className="ml-1 hidden sm:inline">
            {online ? "나가기" : "설정"}
          </span>
        </button>
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto" aria-label="플레이어" data-count={state.tanks.filter(Boolean).length}>
          {state.tanks.map((t) =>
            t ? (
              <PlayerChip
                key={t.slot}
                name={online ? nameOf(t.slot) : `P${t.slot + 1}`}
                ai={online ? (t.slot === online.mySlot ? "나" : null) : controllers[t.slot] === "human" ? null : AI_LABELS[controllers[t.slot] as AiLevel]}
                color={slotColor(state, t.slot)}
                hp={t.hp}
                maxHp={TANKS[t.tankId].hp}
                alive={t.alive}
                active={t.slot === state.turn.slot && result.kind === "ongoing"}
              />
            ) : null,
          )}
        </ul>
        {/* 설정(소리·진동) — 테트리스와 같은 공통 톱니 버튼. 대전은 포커스를 돌려주지 않는다(남은 포커스가 Space를 가로채지 않게) */}
        {/* 서버와 못 맞춘 안내가 뜨면 내린다 — 열려 있던 시트도 함께 닫혀 두 대화상자가 겹치지 않게 */}
        {desyncFatal ? null : <GameSettingsButton testId="fortress-settings-button" restoreFocus={!online} onOpenChange={setSettingsOpen} renderSheet={(close) => <FortressSettingsSheet onClose={close} />} />}
        <button type="button" onMouseDown={noMouseFocus} onClick={() => setGuideOpen(true)} className={CHIP_BUTTON} aria-label="조작 안내" data-testid="fortress-help" data-hud="chip">
          ?
        </button>
      </header>

      <div ref={view.containerRef} className="relative min-h-0 flex-1" inert={desyncFatal}>
        <canvas ref={view.canvasRef} className="absolute inset-0 block touch-none" {...view.canvasHandlers} aria-label="포트리스 전장 — 끌어서 둘러보기, 두 손가락으로 확대, 포신을 끌어 조준" />
        {glow.layer}
        <div className="pointer-events-none absolute inset-x-0 top-2 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-2 sm:px-3">
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[11px] tabular-nums text-slate-400" data-hud="pill">
              라운드 {Math.min(state.turn.round, rounds)} / {rounds}
            </span>
            {result.kind === "ongoing" ? (
              <span className="flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-white" data-testid="fortress-turn" data-hud="pill">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: turnColor }} aria-hidden />
                <span className="truncate">{online ? nameOf(state.turn.slot) : `P${state.turn.slot + 1}`} 차례</span>
                {phase === "think" ? <span className="shrink-0 font-normal text-slate-400">생각 중…</span> : null}
              </span>
            ) : null}
            {/* 온라인 턴 타이머 — 연출 중엔 숨기고, 시작 연출 동안은 "곧 시작". 5초 이하 경고 */}
            {online && result.kind === "ongoing" && phase !== "play" && onlineTurn ? (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${!started ? "border-white/10 bg-slate-900/80 text-slate-300" : timeLeft <= TIMER_WARN_MS ? "border-rose-400/60 bg-rose-500/20 text-rose-100" : "border-white/10 bg-slate-900/80 text-slate-200"}`}
                data-testid="fortress-timer"
                data-hud="pill"
              >
                {!started ? `곧 시작 ${Math.ceil((online.feed.startAt - now) / 1000)}` : `⏱ ${Math.ceil(timeLeft / 1000)}초`}
              </span>
            ) : null}
          </div>
          <WindGauge wind={state.wind} turnKey={state.turn.no} />
          <div className="flex justify-end">
            {!view.following && result.kind === "ongoing" ? (
              <button type="button" onMouseDown={noMouseFocus} onClick={view.recenter} className={`${CHIP_BUTTON} pointer-events-auto text-slate-200`} data-testid="fortress-recenter" data-hud="chip">
                내 탱크로
              </button>
            ) : null}
          </div>
        </div>
        {touch && controller === "human" && result.kind === "ongoing" && hud ? (
          // 터치 — 각도·파워·연료를 전장 위에(조작부 높이를 줄여 전장을 넓힌다). 세로는 왼쪽 아래, 가로는 오른쪽 위(아래 양끝은 패드, 가운데는 슬라이더)
          <div
            className={`pointer-events-none absolute rounded-xl border border-white/10 bg-slate-900/80 ${landscape ? "right-2 top-[3.875rem] max-w-[60%] rounded-full px-3 py-0 leading-tight" : "bottom-2 left-2 max-w-[calc(100%-1rem)] px-2.5 py-1.5 lg:bottom-auto lg:top-28"}`}
            data-testid="fortress-touch-hud"
          >
            {renderHud(landscape)}
            {/* 지난 발 — 세로만(가로는 한 줄 띠라 파워 슬라이더의 지난 발 눈금으로 본다) */}
            {lastShot && !landscape ? (
              <p className="mt-0.5 truncate text-[11px] tabular-nums text-amber-200/90" data-testid="fortress-last-shot">
                지난 발 <AngleText view={angleView(lastShot.angle)} /> · {lastShot.power}
                {lastShot.impact ? "" : " · 맵 밖"}
              </p>
            ) : null}
          </div>
        ) : null}
        {result.kind === "ongoing" && !guideOpen ? <TurnBanner key={state.turn.no} name={nameOf(state.turn.slot)} color={turnColor} look={look} mine={controller === "human"} /> : null}
        {guideOpen ? <FortressGuide onClose={closeGuide} /> : null}
        <ConfirmModal
          isOpen={exitConfirm}
          onClose={() => setExitConfirm(false)}
          onConfirm={() => {
            setExitConfirm(false);
            onExit();
          }}
          title={online ? "경기를 나갈까요?" : "경기를 그만둘까요?"}
          message={online ? "지금 나가면 기권으로 처리돼요. 경기는 남은 사람끼리 이어져요." : "지금 경기는 저장되지 않아요. 설정 화면으로 돌아갑니다."}
          confirmLabel={online ? "나가기" : "그만두기"}
          cancelLabel="계속하기"
          variant="danger"
        />
      </div>

      {/* 조작부 — 휴대폰 세로는 전장 아래, 넓은 화면(lg)·휴대폰 가로(short-land)는 전장 위 아래쪽 반투명 바(전장을 화면 대부분으로 — 가로에서 아래에 쌓으면 전장이 남지 않는다) */}
      <section
        ref={panelRef}
        className={`border-t border-white/10 bg-slate-900/85 px-3 pt-2 ${touch ? "pb-0" : "pb-[calc(0.6rem+env(safe-area-inset-bottom))]"} lg:absolute lg:inset-x-0 lg:bottom-0 lg:border-0 lg:bg-gradient-to-t lg:from-slate-950/95 lg:via-slate-950/75 lg:to-transparent lg:pt-10 short-land:absolute short-land:inset-x-0 short-land:bottom-0 short-land:border-0 short-land:bg-gradient-to-t short-land:from-slate-950/95 short-land:via-slate-950/75 short-land:to-transparent short-land:pt-5 short-land:pb-[calc(0.4rem+env(safe-area-inset-bottom))] short-land:pl-[max(0.75rem,env(safe-area-inset-left))] short-land:pr-[max(0.75rem,env(safe-area-inset-right))]`}
        aria-label="조작"
        inert={desyncFatal}
        data-hud="controls"
      >
        <p className="sr-only" aria-live="polite">
          {result.kind === "ongoing" ? `${nameOf(state.turn.slot)} 차례, 바람 ${state.wind < 0 ? "왼쪽" : state.wind > 0 ? "오른쪽" : "없음"} ${Math.abs(state.wind)}` : "경기 끝"}
          {blockedText ? `. ${blockedText}` : ""}
        </p>
        {/* 라이브 영역은 늘 마운트 — 내용만 바꾼다 */}
        <p role="alert" className={submitError ? "mx-auto mb-2 max-w-xl text-center text-xs text-rose-300" : "sr-only"}>
          {submitError ?? ""}
        </p>
        {touch && current && result.kind === "ongoing" ? (
          // 터치 — 파워 슬라이더 줄 + 공용 패드(D-025 보충 2). 남의 차례에도 같은 자리에 흐리게 두어 높이가 바뀌지 않게(카메라 가림 높이도 그대로)
          <div
            ref={controlsRef}
            inert={!canAim}
            data-testid="fortress-touch-controls"
            className={canAim ? "" : "opacity-50"}
            // 탭한 버튼(넘기기)이 포커스를 갖지 않게 — 외장 키보드의 Space가 충전 대신 그 버튼을 누르지 않게(데스크톱 조작부와 같다). 슬라이더는 끌기 위해 그대로
            onMouseDown={(e) => {
              if (e.target instanceof HTMLInputElement) return;
              e.preventDefault();
            }}
          >
            <div
              className="mx-auto flex max-w-xl flex-col gap-1"
              // 가로 — 전장 위 양끝에 겹친 패드(십자·버튼 묶음) 사이에 둔다
              style={landscape ? { paddingLeft: "calc(clamp(112px, 34vh, 150px) + 28px)", paddingRight: "calc(clamp(50px, 15vh, 68px) * 2.13 + 28px)", maxWidth: "none" } : undefined}
            >
              {controller === "human" ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex min-w-0 flex-1">
                    <input
                      type="range"
                      min={1}
                      max={POWER_MAX}
                      value={charging ? (charge ?? power) : power}
                      onChange={(e) => setPower(clampPower(Number(e.target.value)))}
                      onPointerDown={(e) => {
                        if (e.button === 0) e.currentTarget.setPointerCapture?.(e.pointerId);
                      }}
                      onPointerUp={(e) => e.currentTarget.blur()}
                      onLostPointerCapture={(e) => e.currentTarget.blur()}
                      aria-label="파워"
                      aria-valuetext={`파워 ${power}${lastShot ? `, 지난 발 ${lastShot.power}` : ""}`}
                      className="box-border h-11 min-w-0 max-w-full flex-1 accent-sky-400"
                      data-testid="fortress-power"
                    />
                    {lastShot ? (
                      <span
                        className="pointer-events-none absolute top-1 bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-amber-300/90"
                        style={{ left: `calc(8px + (100% - 16px) * ${(lastShot.power - 1) / (POWER_MAX - 1)})` }}
                        aria-hidden
                        data-testid="fortress-last-power"
                      />
                    ) : null}
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-white" aria-hidden>
                    {charging ? charge : power}
                  </span>
                  <button type="button" onClick={pass} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg px-2 text-[11px] text-slate-400 underline-offset-2">
                    넘기기
                  </button>
                </div>
              ) : (
                <p className="flex min-h-11 items-center justify-center gap-2 text-sm text-slate-400" aria-hidden>
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: turnColor }} />
                  {nameOf(state.turn.slot)} 차례{phase === "think" ? " · 생각 중…" : phase === "submit" ? " · 보내는 중…" : ""}
                </p>
              )}
            </div>
            <GamePad
              // 차례·조준 가능 여부가 바뀌면 새로 마운트 — 앞 사람(또는 막히기 전)에 누르던 입력이 남아 다음 차례에 저절로 다시 눌리지 않게(언마운트가 모두 뗀다)
              key={`${state.turn.no}:${canAim}`}
              layout={fortressPadLayout({ tank: current, weaponId, power, charge: charging ? charge : null, facing, fireAria: `발사 ${power}, ${angleSpeech(angle, facing)}`, vivid: usesVivid(look) })}
              onHoldStart={padHoldStart}
              onHoldEnd={padHoldEnd}
              onInstant={padInstant}
              active={canAim}
            />
          </div>
        ) : current && controller === "human" && result.kind === "ongoing" ? (
          <div
            ref={controlsRef}
            inert={!canAim}
            className={`mx-auto flex max-w-xl flex-col gap-2 lg:max-w-6xl lg:flex-row lg:items-end lg:gap-3 short-land:max-w-none short-land:flex-row short-land:items-end short-land:gap-2 ${canAim ? "" : "pointer-events-none opacity-50"}`}
            // 마우스·터치로 누른 버튼은 포커스를 갖지 않게(남은 포커스가 다음 스페이스를 가로채지 않게) — 슬라이더는 끌기 위해 그대로
            onMouseDown={(e) => {
              if (e.target instanceof HTMLInputElement) return;
              e.preventDefault();
              if (document.activeElement instanceof HTMLElement && controlsRef.current?.contains(document.activeElement)) document.activeElement.blur();
            }}
          >
            <div className="flex flex-col gap-2 lg:w-80 lg:shrink-0 short-land:w-52 short-land:shrink-0 short-land:gap-1.5 short-land:max-sm:w-44" data-hud="deck">
              {hud}
              <div className="flex gap-1.5" role="group" aria-label="무기">
                {TANKS[current.tankId].weapons.map((id) => {
                  const w = WEAPONS[id];
                  const cooling = w.cooldown > 0 && current.cooldown > 0;
                  const vividLook = usesVivid(look);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={cooling}
                      onClick={() => {
                        if (weaponId !== id) getFortressSound().play({ kind: "weapon" });
                        setWeaponId(id);
                      }}
                      aria-pressed={weaponId === id}
                      aria-label={cooling ? `${w.name} — ${current.cooldown}턴 뒤 사용 가능` : w.cooldown > 0 ? `${w.name} (필살기)` : w.name}
                      className={`${choiceClass(weaponId === id)} relative text-xs leading-tight`}
                      data-special-glow={vividLook && weaponId === id && w.cooldown > 0 ? "true" : undefined}
                    >
                      {vividLook ? (
                        // 시안(D-025 보충 6) — 아이콘 + 이름, 필살기는 금색 줄, 대기 중이면 남은 턴 배지(시계)
                        <span className="flex items-center justify-center gap-1.5" aria-hidden="true">
                          <WeaponIcon weaponId={id} size={26} className={cooling ? "opacity-50 grayscale" : undefined} />
                          <span className="flex flex-col items-start leading-tight">
                            <span>{w.name}</span>
                            {w.cooldown > 0 ? <span className={`text-[11px] font-bold ${cooling ? "text-slate-300" : "text-amber-300"}`}>{cooling ? `${current.cooldown}턴 뒤` : "필살기"}</span> : null}
                          </span>
                          {cooling ? <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#160b1c] bg-amber-300 px-1 text-[11px] font-black text-slate-900">⏳{current.cooldown}</span> : null}
                        </span>
                      ) : (
                        <>
                          {w.name}
                          {w.cooldown > 0 ? <span className="block text-[11px] text-slate-400">{cooling ? `${current.cooldown}턴 뒤` : "필살기"}</span> : null}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 lg:w-72 lg:shrink-0 short-land:w-44 short-land:shrink-0 short-land:max-sm:w-48 short-land:max-sm:gap-1" role="group" aria-label="이동·각도" data-hud="deck">
              {/* 휴대폰 가로는 키 안내 줄을 빼 높이를 줄인다(터치라 키 안내가 쓸모없다). 좁은 가로(640px 미만)는 버튼 넷(44px)이 겹치지 않게 칸을 넓히고 간격을 줄인다 */}
              <p className="col-span-2 flex items-center gap-1 text-[11px] text-slate-400 short-land:hidden" aria-hidden>
                이동 <Keycap>←</Keycap>
                <Keycap>→</Keycap>
              </p>
              <p className="col-span-2 flex items-center gap-1 text-[11px] text-slate-400 short-land:hidden" aria-hidden>
                포신 <Keycap>↑</Keycap>
                <Keycap>↓</Keycap>
              </p>
              {/* 반대쪽을 보고 있으면 첫 누름은 돌아서기 — 흐림(더 못 감)은 같은 쪽일 때만 */}
              <HoldButton wide label={facing === -1 ? "왼쪽으로 이동" : "왼쪽으로 돌아서기"} atLimit={facing === -1 && reach !== null && -move >= reach.left} step={() => stepMove(-1)} hold={holdRepeat} release={stopRepeat}>
                ◀
              </HoldButton>
              <HoldButton wide label={facing === 1 ? "오른쪽으로 이동" : "오른쪽으로 돌아서기"} atLimit={facing === 1 && reach !== null && move >= reach.right} step={() => stepMove(1)} hold={holdRepeat} release={stopRepeat}>
                ▶
              </HoldButton>
              <HoldButton wide label="포신 올리기" atLimit={angle === 90} step={() => nudgeElevation(1)} hold={holdRepeat} release={stopRepeat}>
                ▲
              </HoldButton>
              <HoldButton wide label="포신 내리기" atLimit={angle === 0 || angle === ANGLE_MAX} step={() => nudgeElevation(-1)} hold={holdRepeat} release={stopRepeat}>
                ▼
              </HoldButton>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5" data-hud="deck">
              <div className="flex items-center">
                <p className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-slate-400" aria-hidden>
                  파워 <Keycap>Q</Keycap>
                  <Keycap>E</Keycap>
                </p>
                {lastShot ? (
                  <p className="ml-2 min-w-0 truncate text-[11px] tabular-nums text-amber-200/90" data-testid="fortress-last-shot">
                    지난 발 <AngleText view={angleView(lastShot.angle)} /> · {lastShot.power}
                    {lastShot.impact ? "" : " · 맵 밖"}
                  </p>
                ) : null}
                <button type="button" onClick={pass} className="ml-auto min-h-11 shrink-0 whitespace-nowrap rounded-lg px-2 text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
                  넘기기
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex min-w-0 flex-1">
                  <input
                    type="range"
                    min={1}
                    max={POWER_MAX}
                    value={power}
                    onChange={(e) => setPower(clampPower(Number(e.target.value)))}
                    // 끌기를 마치면 포커스를 놓는다 — 남으면 ←→(이동)·↑↓(포신)가 슬라이더 값을 바꾼다. 키보드(Tab)로 들어오면 화살표가 파워
                    // 손잡이를 슬라이더 밖으로 끌고 놓아도 pointerup이 여기로 오게 잡는다(놓친 포커스가 남지 않게)
                    onPointerDown={(e) => {
                      if (e.button === 0) e.currentTarget.setPointerCapture?.(e.pointerId);
                    }}
                    onPointerUp={(e) => e.currentTarget.blur()}
                    onLostPointerCapture={(e) => e.currentTarget.blur()}
                    aria-label="파워"
                    aria-valuetext={`파워 ${power}${lastShot ? `, 지난 발 ${lastShot.power}` : ""}`}
                    className="box-border h-11 min-w-0 max-w-full flex-1 accent-sky-400"
                    data-testid="fortress-power"
                  />
                  {/* 지난 발 파워 눈금 — 손잡이 폭(16px)의 절반만큼 안쪽에서 시작 */}
                  {lastShot ? (
                    <span
                      className="pointer-events-none absolute top-1 bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-amber-300/90"
                      style={{ left: `calc(8px + (100% - 16px) * ${(lastShot.power - 1) / (POWER_MAX - 1)})` }}
                      aria-hidden
                      data-testid="fortress-last-power"
                    />
                  ) : null}
                </div>
                {/* 발사 하나 — 짧게 누르면(탭·Enter·화면 낭독기) 맞춘 파워로, 길게 누르면 누른 만큼 충전해 뗄 때 발사 */}
                <button
                  ref={fireButtonRef}
                  type="button"
                  onPointerDown={(e) => {
                    // 주 버튼만(오른쪽 클릭 메뉴가 pointerup을 가져가면 충전이 남는다)
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    pointerFireAtRef.current = performance.now();
                    startCharge();
                  }}
                  onPointerUp={release}
                  onPointerCancel={cancelCharge}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    // 포인터로 누른 것은 위 pointerup이 쐈다 — 키보드·보조기술 클릭만 여기서
                    if (performance.now() - pointerFireAtRef.current < POINTER_CLICK_MS) return;
                    fire(power);
                  }}
                  aria-label={`발사 ${power}, ${angleSpeech(angle, facing)}`}
                  className="relative min-h-12 min-w-32 touch-none short-land:min-w-24 short-land:max-sm:min-w-20 overflow-hidden rounded-xl border border-rose-300/50 bg-rose-600/85 px-3 text-base font-bold tabular-nums text-white shadow-[0_8px_20px_rgba(2,6,23,0.5)] active:bg-rose-500/85"
                  data-testid="fortress-fire"
                  data-special-glow={usesVivid(look) && WEAPONS[weaponId]?.cooldown > 0 ? "true" : undefined}
                  data-charging={charging || undefined}
                >
                  {/* 충전 막대 — 버튼 안을 왼쪽부터 채운다 */}
                  <span className="absolute inset-y-0 left-0 bg-amber-300/45" style={{ width: `${charging ? charge : 0}%` }} aria-hidden />
                  <span className="relative flex items-center justify-center gap-2">
                    {charging ? `파워 ${charge}` : `발사 ${power}`}
                    <Keycap>Space</Keycap>
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mx-auto flex max-w-xl items-center justify-center gap-2 py-6 text-sm text-slate-400 lg:py-3 short-land:py-2" aria-hidden>
            {result.kind === "ongoing" ? (
              <>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: turnColor }} />
                {nameOf(state.turn.slot)} 차례{phase === "think" ? " · 생각 중…" : phase === "submit" ? " · 보내는 중…" : ""}
              </>
            ) : (
              "경기 끝"
            )}
          </p>
        )}
      </section>
      {/* 서버와 못 맞춤 — 뒤쪽(머리·전장·조작부)은 inert, 포커스는 새로고침 버튼으로 */}
      {desyncFatal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6" role="alertdialog" aria-modal="true" aria-labelledby="fortress-desync-title" data-testid="fortress-desync">
          <div className="max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center">
            <p id="fortress-desync-title" className="text-base font-semibold text-white">
              화면을 서버와 맞추지 못했어요
            </p>
            <p className="mt-2 text-sm text-slate-400">새로고침하면 지금 경기로 다시 들어가요.</p>
            <button ref={desyncReloadRef} type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-6 text-sm font-semibold text-white">
              새로고침
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 상단 플레이어 칸 — 차례인 사람은 노란 테두리, HP 막대 */
function PlayerChip({ name, ai, color, hp, maxHp, alive, active }: { name: string; ai: string | null; color: string; hp: number; maxHp: number; alive: boolean; active: boolean }) {
  return (
    <li
      className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-2 py-1 text-xs ${active ? "border-amber-300/70 bg-amber-400/10" : "border-slate-700/60 bg-slate-900/70"} ${alive ? "" : "opacity-40"}`}
      aria-current={active ? "true" : undefined}
      data-hud="player"
    >
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden data-hud="dot" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate font-semibold ${active ? "text-amber-200" : "text-slate-200"} ${alive ? "" : "line-through"}`}>
          {name}
          {ai ? (
            <span className="ml-1 text-[11px] font-normal text-slate-400" data-hud="ai">
              {ai}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-800" aria-hidden data-hud="hp">
            <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }} />
          </span>
          {/* 숫자는 보이기용(좁은 시안 화면에서는 숨긴다) — 낭독은 아래 sr-only가 늘 맡는다 */}
          <span className="tabular-nums text-slate-400" aria-hidden data-hud="hp-num">
            {hp}
          </span>
          <span className="sr-only">HP {hp}</span>
        </span>
      </span>
    </li>
  );
}

/** 각도 표기 — 방향 화살표(낭독은 "오른쪽" 등 낱말) + 높이. 수직은 방향 없이(지난 발) */
function AngleText({ view }: { view: AngleView }) {
  return (
    <>
      {view.arrow ? <span aria-hidden="true">{view.arrow} </span> : null}
      <span className="sr-only">{view.word} </span>
      {view.height}°
    </>
  );
}

/** 누르고 있으면 반복(포인터), 키보드·보조기술 클릭(detail 0)이면 한 번 */
function HoldButton({
  label,
  step,
  hold,
  release,
  wide = false,
  atLimit = false,
  children,
}: {
  label: string;
  step: () => void;
  hold: (fn: () => void) => void;
  release: () => void;
  wide?: boolean;
  /** 그 방향으로 더 못 간다 — 흐리게, 누르면 이유 안내(step이 막힌 걸 알린다) */
  atLimit?: boolean;
  children: React.ReactNode;
}) {
  // 누른 채 사라지면(턴이 AI로 넘어가 조작부가 바뀜) pointerup이 오지 않는다 — 언마운트 때 놓는다
  const releaseRef = useRef(release);
  releaseRef.current = release;
  useEffect(() => () => releaseRef.current(), []);
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={atLimit || undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        hold(step);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.detail === 0) step();
      }}
      data-hud="key"
      className={`min-h-11 min-w-11 ${wide ? "flex-1" : ""} rounded-xl border border-white/15 bg-slate-800/80 text-lg text-slate-100 active:bg-slate-700 ${atLimit ? "opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

/** 턴 전환 — 화면 가운데 큰 글씨가 잠깐 떴다 사라진다(움직임 줄이기면 띄우지 않는다, 위쪽 차례 표시는 그대로) */
function TurnBanner({ name, color, look = "classic", mine = false }: { name: string; color: string; look?: Look; mine?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDone(true);
      return;
    }
    const anim = el.animate(
      !usesVivid(look)
        ? [
            { opacity: 0, transform: "translateY(8px) scale(0.92)" },
            { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.18 },
            { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.75 },
            { opacity: 0, transform: "translateY(-6px) scale(1.02)" },
          ]
        : // 시안 — 띠가 왼쪽에서 미끄러져 들어와 잠깐 멈췄다가 오른쪽으로 빠진다
          [
            { opacity: 0, transform: "translateX(-60px) skewX(-12deg)" },
            { opacity: 1, transform: "translateX(0) skewX(-12deg)", offset: 0.16 },
            { opacity: 1, transform: "translateX(6px) skewX(-12deg)", offset: 0.78 },
            { opacity: 0, transform: "translateX(70px) skewX(-12deg)" },
          ],
      { duration: usesVivid(look) ? 1500 : 1300, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = () => setDone(true);
    return () => anim.cancel();
  }, [look]);
  if (done) return null;
  if (usesVivid(look)) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[36%] flex justify-center" aria-hidden>
        <div ref={ref} className="relative w-[min(92%,30rem)] opacity-0">
          {/* 띠 — 연기·폭발 위에서도 읽히게 짙은 판 + 잉크 외곽선(가운데에 차례 색 줄) */}
          <div className="absolute inset-0 rounded-lg border-2 border-[#160b1c] bg-[#241a4a]/92 shadow-[inset_0_2px_0_rgba(255,255,255,0.18),0_4px_0_#160b1c]" />
          <div className="absolute inset-x-3 bottom-1.5 h-1 rounded-full opacity-90" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
          <div className="relative skew-x-[12deg] px-6 py-3 text-center">
            <p className="text-[11px] font-black tracking-[0.5em]" style={{ color }}>
              {mine ? "YOUR TURN" : "TURN"}
            </p>
            <p className="mt-0.5 text-3xl font-black text-white [text-shadow:0_2px_0_rgba(0,0,0,0.6),0_0_18px_rgba(255,190,120,0.45)]">{name}</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center" aria-hidden>
      <div ref={ref} className="rounded-2xl border border-white/10 bg-slate-950/75 px-6 py-3 text-center opacity-0 shadow-[0_8px_20px_rgba(2,6,23,0.5)]">
        <p className="text-[11px] font-semibold tracking-[0.4em] text-slate-400">TURN</p>
        <p className="mt-1 flex items-center justify-center gap-2 text-2xl font-black text-white">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
          {name}
        </p>
      </div>
    </div>
  );
}
