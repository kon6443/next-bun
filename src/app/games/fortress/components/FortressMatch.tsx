"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { GamePad } from "@/app/games/_shared/components/GamePad";
import { useMediaQuery } from "@/app/games/_shared/hooks/useMediaQuery";
import type { AiLevel } from "../ai/chooseTurn";
import { ANGLE_MAX, type Action, type MatchConfig, type MatchState, POWER_MAX, TANKS, type Tank, WEAPONS, applyAction, previewShot, stateHash } from "../engine";
import type { MatchFeed } from "../battle-ui/lib/matchFeed";
import { nearestEnemy, useBattleView } from "../hooks/useBattleView";
import { slotColor } from "../lib/slotColors";
import { AI_LABELS, type Controller, playerName } from "../lib/controllers";
import type { Aim } from "../renderer/drawScene";
import { type Facing, angleSpeech, angleView, defaultAngleToward, elevate, facingOf, turnAround } from "../lib/aimAngle";
import { aimKeyAction, focusKind } from "../lib/aimKeys";
import { type LastShot, aimPath, lastShotOf } from "../lib/aimAssist";
import { moveReach } from "../lib/moveReach";
import { type ReplayData, newReplayData } from "../lib/replay";
import { type TankSkin, toTankSkin } from "../lib/tankSkins";
import { type Look, useLook } from "../lib/look";
import { FortressGuide, markGuideSeen, readGuideSeen } from "./FortressGuide";
import { CHIP_BUTTON, Keycap, choiceClass, noMouseFocus } from "./fortressUi";
import vividStyles from "./fortressVivid.module.css";
import { useGlowLayer } from "./GlowLayer";
import { WeaponIcon } from "./WeaponIcon";
import { GameSettingsButton } from "@/app/games/_shared/components/GameSettingsButton";
import { FortressSettingsSheet } from "./FortressSettingsSheet";
import { getFortressSound } from "../lib/sound/player";
import { useMatchSound } from "../hooks/useMatchSound";
import { useOnlineDesync } from "../hooks/useOnlineDesync";
import { useOnlineFeed } from "../hooks/useOnlineFeed";
import { useAiTurn } from "../hooks/useAiTurn";
import { useAimKeys } from "../hooks/useAimKeys";
import { useOverlayInsets } from "../hooks/useOverlayInsets";
import { AngleText, HoldButton, PlayerChip, TurnBanner } from "./matchParts";
import { type Phase, currentTank, replayActions, startMatch } from "../lib/matchFlow";
import { WindGauge } from "./WindGauge";
import { PAD, fortressPadLayout, nextWeapon } from "./fortressPad";
import { ChargeLive, TurnTimer, createChargeStore, useTurnGate } from "./matchLive";

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

/** 발사 버튼을 누르고 있으면 이 시간에 파워 0 → 100 */
const CHARGE_MS = 1600;
/**
 * 이보다 짧게 누르면 충전이 아니라 탭 — 맞춰 둔 파워(슬라이더)로 쏜다
 * (화면 낭독기 두 번 탭·실수 탭이 파워 1 발사가 되지 않게, 충전 표시도 이 뒤부터)
 */
const MIN_HOLD_MS = 250;
/** 충전 표시를 시작하는 파워 — 탭과 구분되는 시간이 지난 뒤부터 */
const CHARGE_VISIBLE = Math.round((MIN_HOLD_MS / CHARGE_MS) * 100);
/** 포인터로 누른 뒤 이 안에 오는 click은 포인터가 이미 처리했다 */
const POINTER_CLICK_MS = 1000;
/** 포신 끌기 조준 — 포탑에서 이 거리(화면 px) 안을 눌러야 잡힌다, 이만큼 끌면 파워 최대 */
const AIM_GRAB_PX = 64;
const AIM_DRAG_FULL_PX = 170;

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
  /** 경기 화면 그림 — glow면 WebGL 후처리 층을 더한다. 없으면 주소의 ?look(기본 vivid) — 온라인 경기도 이 규칙 */
  look?: Look;
}) {
  const { glow: glowLook } = useLook(lookProp);
  // 경기 시작 때 지형 — 중간에 들어온 온라인 경기(재접속·늦은 입장)도 파인 면을 그을린 흙으로 칠하게
  const [origin] = useState(() => startMatch(config).terrain);
  // 온라인은 이미 확정된 행동(재접속·늦은 입장)을 적용한 state에서 시작한다
  const [boot] = useState(() => (online ? replayActions(config, online.feed.actions) : { state: startMatch(config), ok: true, lastShots: [null, null, null, null] }));
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
  const { desyncFatal, desyncReloadRef, requestResync, verifyHash, resetDesyncCount } = useOnlineDesync(onlineRef, boot.ok);

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
  /** 충전 파워(0~100)는 작은 저장소에 — 프레임마다 바뀌어도 이 화면 전체를 다시 그리지 않고, 표시하는 부분(ChargeLive)만 다시 그린다 */
  const [chargeStore] = useState(createChargeStore);
  /** 0 충전 아님 · 1 누르는 중(탭과 구분되는 시간 전) · 2 충전 표시 중 — 이 전환에서만 다시 그린다 */
  const [chargeStage, setChargeStage] = useState<0 | 1 | 2>(0);
  const stopChargeView = useCallback(() => {
    chargeStore.set(null);
    setChargeStage(0);
  }, [chargeStore]);
  const chargeStartRef = useRef(0);
  /** 충전 중(누른 채) — 상태보다 먼저 바뀐다. 패드를 키보드·보조기기로 누르면 누름·뗌이 같은 순간에 와서 상태(charge)로는 뗌을 못 알아본다 */
  const chargeActiveRef = useRef(false);
  /** 스페이스로 시작한 충전만 스페이스 keyup이 놓는다 */
  const keyChargeRef = useRef(false);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const current = currentTank(state);
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
      const t = currentTank(s);
      const enemy = nearestEnemy(s, s.tanks.filter((x): x is Tank => x !== null), t.slot, t);
      const last = lastAimRef.current[t.slot] ?? { angle: defaultAngleToward(t.x, enemy ? enemy.x : null), power: 60, facing: enemy && enemy.x < t.x ? -1 : 1 };
      stopRepeat();
      keyChargeRef.current = false;
      chargeActiveRef.current = false;
      stopChargeView();
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
    [stopRepeat, stopChargeView],
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
  // 소리 — 경기 배경음, 연출 사건의 효과음·진동
  const onCues = useMatchSound();
  // 시안 glow — WebGL 후처리 층(three는 켜질 때만 동적 import)
  const glow = useGlowLayer(glowLook);
  const view = useBattleView({
    initial: state,
    getAim: () => aimRef.current,
    labelOf: (slot) => onlineRef.current?.names[slot] ?? `P${slot + 1}`,
    skinOf: (slot) => toTankSkin((onlineRef.current ? onlineRef.current.skins : skinsRef.current)?.[slot]),
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
      stopChargeView();
      play(s, r.events, r.state, { weaponId: action.kind === "fire" ? action.weaponId : undefined });
      setPhaseBoth("play");
      return true;
    },
    [stopRepeat, stopChargeView, play],
  );

  /** 로컬 행동 확정 — 연출 중·경기 끝에는 받지 않는다(두 번 발사 방지) */
  const commit = useCallback(
    (action: Action) => {
      if (phaseRef.current === "play" || phaseRef.current === "over") return false;
      return playAction(action);
    },
    [playAction],
  );

  // 온라인 — 서버 피드를 차례로 연출, 스냅샷이면 다시 만든다
  const { show } = view;
  useOnlineFeed({
    online,
    onlineRef,
    phase,
    phaseRef,
    setPhase: setPhaseBoth,
    resumePhaseRef,
    appliedRef,
    epochRef,
    stateRef,
    setState,
    replayRef,
    lastShotRef,
    show,
    playAction,
    beginTurn,
    desync: { desyncFatal, verifyHash, requestResync, resetDesyncCount },
  });

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

  // AI 차례 — 생각 중 표시 뒤 계산, 카메라가 따라갈 자리까지 기다렸다 쏜다
  const { cameraReadyFor } = view;
  useAiTurn({ phase, paused: guideOpen || exitConfirm || settingsOpen, controllers, seed: config.seed, stateRef, commit, cameraReadyFor });

  // 이동·각도를 바꾸면 이동 뒤 위치를 엔진 previewShot으로(같은 이동 코드)
  /** 충전 표시는 탭과 구분되는 시간이 지난 뒤부터 */
  const charging = chargeStage === 2;
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
      ? { slot: current.slot, x: preview.x, y: preview.y, angle, power: charging ? (chargeStore.get() ?? power) : power, path: humanAim && chargeStage === 0 ? path : null, lastImpact: humanAim ? (lastShot?.impact ?? null) : null, weaponId: humanAim ? weaponId : undefined, charging: charging || undefined }
      : null;

  // ===== 온라인 턴 시각 — 시작 연출 잠금·남은 시간 =====
  // 시작 연출이 끝났나·시간이 다 됐나만 여기서(바뀔 때만 다시 그린다) — 남은 초 표시는 TurnTimer가 따로 250ms마다
  const { started, expired } = useTurnGate(online?.feed);
  const onlineTurn = online?.feed.turn ?? null;
  // 서버 기준 내 차례이고 화면이 그 턴까지 따라왔을 때만(앞 행동 연출 중이면 아직)
  const onlineReady = !online || (onlineTurn !== null && onlineTurn.slot === online.mySlot && onlineTurn.seq === appliedRef.current && started && !expired);

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
    stopChargeView();
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
    chargeStore.set(0);
    setChargeStage(1);
  };
  const chargeOn = chargeStage !== 0;
  useEffect(() => {
    if (!chargeOn) return;
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - chargeStartRef.current;
      const value = Math.min(100, Math.round((elapsed / CHARGE_MS) * 100));
      chargeStore.set(value);
      if (value >= CHARGE_VISIBLE) {
        // 표시 시작은 한 번만 다시 그린다(같은 값이면 React가 건너뛴다) — 그 뒤 전장 조준선 파워는 그리기 루프가 읽는 aimRef에 바로 쓴다
        setChargeStage(2);
        if (aimRef.current?.charging) aimRef.current = { ...aimRef.current, power: value };
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chargeOn, chargeStore]);
  /** 브라우저가 제스처로 가져가거나 창을 떠나는 등 취소되면 쏘지 않는다 */
  const cancelCharge = () => {
    keyChargeRef.current = false;
    chargeActiveRef.current = false;
    stopChargeView();
  };
  const release = () => {
    keyChargeRef.current = false;
    if (chargeStage === 0 && !chargeActiveRef.current) return;
    chargeActiveRef.current = false;
    const elapsed = performance.now() - chargeStartRef.current;
    stopChargeView();
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

  // 키보드(데스크톱) — 규칙은 lib/aimKeys. 조준 가능할 때만 리스너를 붙인다
  useAimKeys(canAim, {
    down: (e: KeyboardEvent) => {
      const action = aimKeyAction(e, focusKind(e.target));
      if (!action) return;
      e.preventDefault();
      if (action.kind === "elevate") nudgeElevation(action.delta);
      else if (action.kind === "power") nudgePower(action.delta);
      else if (action.kind === "move") stepMove(action.dir);
      else if (action.kind === "charge" && chargeStage === 0) {
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
  });

  // 조준을 못 하게 되면(안내 열기·발사·턴 전환) 진행 중인 충전을 버린다 — 리스너가 떨어져 keyup이 오지 않아 충전이 남지 않게
  // 터치 패드의 누르는 동안 반복도 멈춘다 — 패드는 조준 가능 여부가 바뀌면 다시 마운트돼(뗌) 멈추지만, 그 경로와 따로 한 번 더(이중 안전)
  useEffect(() => {
    if (canAim) return;
    keyChargeRef.current = false;
    chargeActiveRef.current = false;
    stopChargeView();
    stopRepeat();
  }, [canAim, stopRepeat, stopChargeView]);

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

  // 조작부 오버레이 높이·양옆 폭 — 카메라가 그만큼 비워 담는다
  useOverlayInsets({ panelRef, insetBottomRef: overlayInsetRef, insetSideRef: overlaySideRef, remeasure: [touch, landscape, state.turn.no, canAim] });

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
          <dd className={`font-bold text-white ${compact ? "text-sm" : "text-base"}`}>{charging ? <ChargeLive store={chargeStore}>{(c) => c ?? power}</ChargeLive> : power}</dd>
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
      className={`relative flex h-full flex-col pt-[env(safe-area-inset-top)] ${vividStyles.vivid}`}
      data-testid="fortress-match"
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
            {online && result.kind === "ongoing" && phase !== "play" && onlineTurn ? <TurnTimer feed={online.feed} warnMs={TIMER_WARN_MS} /> : null}
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
        {result.kind === "ongoing" && !guideOpen ? <TurnBanner key={state.turn.no} name={nameOf(state.turn.slot)} color={turnColor} mine={controller === "human"} /> : null}
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
                    <ChargeLive store={chargeStore}>
                      {(c) => (
                        <input
                          type="range"
                          min={1}
                          max={POWER_MAX}
                          value={charging ? (c ?? power) : power}
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
                      )}
                    </ChargeLive>
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
                    {charging ? <ChargeLive store={chargeStore}>{(c) => c ?? power}</ChargeLive> : power}
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
            <ChargeLive store={chargeStore}>
              {(c) => (
                <GamePad
                  // 차례·조준 가능 여부가 바뀌면 새로 마운트 — 앞 사람(또는 막히기 전)에 누르던 입력이 남아 다음 차례에 저절로 다시 눌리지 않게(언마운트가 모두 뗀다)
                  key={`${state.turn.no}:${canAim}`}
                  layout={fortressPadLayout({ tank: current, weaponId, power, charge: charging ? c : null, facing, fireAria: `발사 ${power}, ${angleSpeech(angle, facing)}` })}
                  onHoldStart={padHoldStart}
                  onHoldEnd={padHoldEnd}
                  onInstant={padInstant}
                  active={canAim}
                />
              )}
            </ChargeLive>
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
                      data-special-glow={weaponId === id && w.cooldown > 0 ? "true" : undefined}
                    >
                      {/* 아이콘 + 이름, 필살기는 금색 줄, 대기 중이면 남은 턴 배지(시계) */}
                      <span className="flex items-center justify-center gap-1.5" aria-hidden="true">
                        <WeaponIcon weaponId={id} size={26} className={cooling ? "opacity-50 grayscale" : undefined} />
                        <span className="flex flex-col items-start leading-tight">
                          <span>{w.name}</span>
                          {w.cooldown > 0 ? <span className={`text-[11px] font-bold ${cooling ? "text-slate-300" : "text-amber-300"}`}>{cooling ? `${current.cooldown}턴 뒤` : "필살기"}</span> : null}
                        </span>
                        {cooling ? <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#160b1c] bg-amber-300 px-1 text-[11px] font-black text-slate-900">⏳{current.cooldown}</span> : null}
                      </span>
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
                  data-special-glow={WEAPONS[weaponId]?.cooldown > 0 ? "true" : undefined}
                  data-charging={charging || undefined}
                >
                  {/* 충전 막대 — 버튼 안을 왼쪽부터 채운다 */}
                  <ChargeLive store={chargeStore}>
                    {(c) => (
                      <>
                        <span className="absolute inset-y-0 left-0 bg-amber-300/45" style={{ width: `${charging ? (c ?? 0) : 0}%` }} aria-hidden />
                        <span className="relative flex items-center justify-center gap-2">
                          {charging ? `파워 ${c ?? 0}` : `발사 ${power}`}
                          <Keycap>Space</Keycap>
                        </span>
                      </>
                    )}
                  </ChargeLive>
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
