"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { SOUND, Sfx } from "../audio/sfx";
import { AUGMENTS, ENGINE_VERSION, EVENT, EVENT_STRIDE, OP, findStage, slotAvailable, type GameState, type Stage } from "../engine";
import { useDefenseCanvas } from "../hooks/useDefenseCanvas";
import { type FrameInfo, type PlayResult, type Speed, useDefensePlay } from "../hooks/useDefensePlay";
import { useDefenseSettings } from "../hooks/useDefenseSettings";
import { loadSettings } from "../lib/settings";
import { type Briefing, briefingFor } from "../lib/briefings";
import { CAMPAIGN, type Difficulty, type StageMeta, parseBoardKey, randomSeed, stagePath } from "../lib/campaign";
import { settleCampaign } from "../lib/campaignResult";
import { applyTickEvents, createTickNotice } from "../lib/fx";
import { DIFFICULTY_NAMES, ENEMY_NAMES, TOWER_NAMES } from "../lib/labels";
import { hasSeenBriefing, isDifficultyUnlocked, loadProgress, markBriefingSeen, markEnemiesMet, markTutorialDone, saveProgress } from "../lib/progress";
import { type ResumeSlot, clearResume, loadResume, saveResume } from "../lib/resume";
import type { RestoredGame } from "../lib/restoreGame";
import { useChunkedRestore } from "../hooks/useChunkedRestore";
import { RestoreProgress } from "./RestoreProgress";
import { type RingOption, currentRange, ringOptions, tapRing } from "../lib/ringOptions";
import { boardTitle, modeOfBoardKey } from "../lib/rankedBoards";
import { toRenderMap } from "../lib/toRenderView";
import { TUTORIAL_BUBBLE_BAND, TUTORIAL_NOTICE_BAND, TUTORIAL_SLOT, tutorialBubbleAbove, tutorialStep } from "../lib/tutorial";
import { nextWaveIndex, wavePreview } from "../lib/wavePreview";
import { DamageNumberPool, EffectPool, ParticlePool } from "../renderer/particles";
import type { RenderView } from "../renderer/renderView";
import { createSceneScratch, drawBossBar, drawLeakPulse, drawSceneLayer, drawSelection } from "../renderer/sceneLayer";
import { toScreenX, toScreenY } from "../renderer/viewport";
import { AugmentPicker } from "./AugmentPicker";
import { BriefingCard } from "./BriefingCard";
import { Hud } from "./Hud";
import { RankedStrip } from "./RankedStrip";
import { ResultPanel } from "./ResultPanel";
import { SettingsPanel } from "./SettingsPanel";
import { TowerRing, ringSpan } from "./TowerRing";
import { TUTORIAL_TARGET_SIZE, TutorialOverlay } from "./TutorialOverlay";
import { WaveBar } from "./WaveBar";

/**
 * 플레이 화면 (defense DESIGN §F1~§F9b) — 캔버스(엔진 렌더) 위에 DOM 슬롯 버튼·링 메뉴·HUD
 * 기본 내보내기는 캠페인 입구, PlaySession은 캠페인·무한·주간 공용(무한·주간 입구는 RankedPlay)
 * 슬롯은 DOM 버튼이라 키보드(Tab·Enter·방향키)·스크린리더·자동화(data-testid)로도 조작된다(§F10 입력: 캔버스 접근성)
 * F1b: 튜토리얼(S1)·브리핑 카드·효과음(기본 꺼짐)·설정·이어하기·연출(원소 파티클·충격파·번개·보스 막대·흔들림)
 */

const PARTICLE_CAPACITY = 400;
const NUMBER_CAPACITY = 40;
const EFFECT_CAPACITY = 48;
/** 슬롯 버튼 크기 — 44px, 화면이 작아 이웃 슬롯과 겹치면 그 간격까지 줄인다(겹친 곳은 DOM 뒤 슬롯이 가져간다) */
const SLOT_BUTTON = 44;
const LEAK_PULSE_MS = 450;
const SHAKE_MS = 260;
const SHAKE_PX = 4;
const BOSS_BANNER_MS = 2400;
const DPR_CAP = 2;

export type Intro = "tutorial" | "briefing" | null;
/** notice = 시작 화면 한 줄 안내(이어하기를 못 불러옴·다른 판 저장본이 바뀜) */
type Opening = { restore: RestoredGame | null; intro: Intro; notice: string | null };
export type PlayMode = "campaign" | "endless" | "weekly";

type Props = { boardKey: string; seed: number; fixedSeed: boolean };

export default function DefensePlay({ boardKey, seed, fixedSeed }: Props) {
  const parsed = useMemo(() => parseBoardKey(boardKey), [boardKey]);
  const stage = useMemo(() => findStage(boardKey), [boardKey]);
  const campaign = useMemo(() => (parsed ? { meta: parsed.stage, difficulty: parsed.difficulty } : null), [parsed]);
  const [attempt, setAttempt] = useState({ n: 0, seed });
  const [access, setAccess] = useState<"checking" | "ok" | "locked">("checking");
  /** 이 보드의 이어하기 저장 — 고를 때까지 판을 시작하지 않는다 */
  const [resumeOffer, setResumeOffer] = useState<ResumeSlot | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);

  const restorer = useChunkedRestore();
  const introFor = useCallback((stageId: string): Intro => {
    const progress = loadProgress();
    if (stageId === "s1" && !progress.tutorialDone) return "tutorial";
    return briefingFor(stageId) && !hasSeenBriefing(progress, stageId) ? "briefing" : null;
  }, []);

  useEffect(() => {
    if (!parsed) return;
    if (!isDifficultyUnlocked(loadProgress(), parsed.stage.id, parsed.difficulty)) {
      setAccess("locked");
      return;
    }
    setAccess("ok");
    const slot = loadResume();
    if (slot && slot.boardKey === boardKey && slot.engineVersion === ENGINE_VERSION) setResumeOffer(slot);
    else {
      // 이어하기는 1슬롯(§F9b) — 다른 판 저장본이 있으면 이 판에서 웨이브를 부를 때 바뀐다는 것을 알린다
      // 쓸 수 없는 구버전 저장본은 알리지 않는다(허브에도 안 보인다)
      // 무한·주간 저장본(세션 포함)도 같은 1슬롯 — 덮어쓰기 전에 알린다
      const otherSlot = slot && slot.boardKey !== boardKey && slot.engineVersion === ENGINE_VERSION ? slot : null;
      const other = otherSlot ? parseBoardKey(otherSlot.boardKey) : null;
      const otherName = other ? `스테이지 ${other.stage.number} ${DIFFICULTY_NAMES[other.difficulty]}` : otherSlot && modeOfBoardKey(otherSlot.boardKey) ? boardTitle(otherSlot.boardKey) : null;
      const notice = otherName ? `웨이브를 시작하면 ${otherName}의 이어하기 저장이 이 판으로 바뀌어요` : null;
      setOpening({ restore: null, intro: introFor(parsed.stage.id), notice });
    }
  }, [parsed, boardKey, introFor]);

  if (!parsed || !stage || !campaign) return null;
  const exitHref = stagePath(parsed.stage.id);
  if (access === "checking") return null;
  if (access === "locked") {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-slate-200">아직 열리지 않은 스테이지·난이도예요.</p>
        <Link href={exitHref} className="flex min-h-11 items-center rounded-full border border-white/20 px-5 text-sm font-semibold">
          스테이지 화면으로
        </Link>
      </main>
    );
  }
  if (resumeOffer && !opening) {
    const choose = async (resume: boolean) => {
      if (restorer.progress !== null) return;
      const restored = resume ? await restorer.restore(stage, resumeOffer.seed, resumeOffer.inputs, resumeOffer.tick) : null;
      if (restored === "cancelled") return;
      if (!restored) clearResume();
      setAttempt((a) => ({ n: a.n, seed: restored ? resumeOffer.seed : a.seed }));
      setOpening({ restore: restored, intro: restored ? null : introFor(parsed.stage.id), notice: resume && !restored ? "이어하기를 불러오지 못해 새로 시작했어요" : null });
    };
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" data-testid="defense-resume">
        <h1 className="text-lg font-bold text-white">하던 판이 있어요</h1>
        <p className="text-sm text-slate-300">스테이지 {parsed.stage.number} {DIFFICULTY_NAMES[parsed.difficulty]} — 저장한 곳부터 이어서 할까요?</p>
        {restorer.progress !== null && <RestoreProgress progress={restorer.progress} />}
        <button
          type="button"
          data-testid="defense-resume-continue"
          disabled={restorer.progress !== null}
          onClick={() => void choose(true)}
          className="min-h-12 w-full max-w-xs rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white"
        >
          이어하기
        </button>
        <button
          type="button"
          data-testid="defense-resume-new"
          disabled={restorer.progress !== null}
          onClick={() => void choose(false)}
          className="min-h-12 w-full max-w-xs rounded-full border border-white/20 text-sm font-semibold text-slate-100 disabled:opacity-50"
        >
          새로 시작
        </button>
      </main>
    );
  }
  if (!opening) return null;
  return (
    <PlaySession
      key={attempt.n}
      stage={stage}
      mode="campaign"
      title={`스테이지 ${parsed.stage.number} ${DIFFICULTY_NAMES[parsed.difficulty]}`}
      campaign={campaign}
      exitMessage="지금까지의 판은 이어하기로 저장해 둘게요. 같은 스테이지·난이도로 다시 들어오면 이어서 할 수 있어요."
      boardKey={boardKey}
      seed={attempt.seed}
      restore={opening.restore}
      intro={opening.intro}
      notice={opening.notice}
      exitHref={exitHref}
      onRetry={() => {
        clearResume();
        setOpening({ restore: null, intro: null, notice: null });
        setAttempt((a) => ({ n: a.n + 1, seed: fixedSeed ? seed : randomSeed() }));
      }}
    />
  );
}

export type SessionProps = {
  stage: Stage;
  mode: PlayMode;
  /** 화면 이름 — main의 접근성 이름 */
  title: string;
  /** 캠페인이면 스테이지·난이도(별·진행도·다음 스테이지·브리핑) — 무한·주간은 null */
  campaign: { meta: StageMeta; difficulty: Difficulty } | null;
  /** 무한·주간 판이 끝나면 한 번 — 결과(점수·최고 기록)는 부르는 쪽이 정해 rankedResult로 그린다 */
  onRankedOver?: (result: PlayResult, state: GameState) => void;
  /** 무한·주간 결과 화면(웨이브·등록) — 캠페인은 ResultPanel */
  rankedResult?: ReactNode;
  /** 판 위 안내 띠(세션 만료 예고 등) */
  banner?: ReactNode;
  /** 이어하기 저장에 함께 싣는 값(무한·주간 세션) */
  resumeFields?: Pick<ResumeSlot, "sessionId" | "sessionReceivedAt" | "sessionTtlMs">;
  /** 판 중 나가기 확인 문구 */
  exitMessage: string;
  boardKey: string;
  seed: number;
  restore: Opening["restore"];
  intro: Intro;
  notice: string | null;
  exitHref: string;
  onRetry: () => void;
};

type Finished = { result: PlayResult; campaign: { stars: number; replaySaved: boolean; progressSaved: boolean } | null };

/**
 * 단축키 — 영문 글자면 e.key(AZERTY·Dvorak에서도 자판에 보이는 글자), 아니면(한글 'ㅔ'·IME 'Process') 물리 키 e.code
 * 숫자는 물리 키(숫자 줄·키패드 — AZERTY는 Shift 없이 '&'가 온다)
 */
function shortcutOf(e: KeyboardEvent): string | null {
  if (e.code === "Space") return " ";
  if (e.key === "Escape" || e.key.startsWith("Arrow")) return e.key;
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^(Digit|Numpad)[1-6]$/.test(e.code)) return e.code.slice(-1);
  return null;
}

/** 글을 입력하는 요소면 Space는 그 요소의 것 — 버튼은 Enter로 누르고 Space는 늘 웨이브 호출(§F3) */
function isTextInput(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input,textarea,select,[contenteditable]") !== null;
}

const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/** 방향키 슬롯 커서 (§F10 입력) — from 슬롯에서 그 방향(±45° 안)으로 가장 가까운 슬롯. 없으면 -1 */
export function nearestSlotInDirection(slots: readonly { x: number; y: number }[], from: number, dx: number, dy: number): number {
  let best = -1;
  let bestScore = Infinity;
  const origin = slots[from];
  for (let i = 0; i < slots.length; i++) {
    if (i === from) continue;
    const vx = slots[i].x - origin.x;
    const vy = slots[i].y - origin.y;
    const along = vx * dx + vy * dy;
    const across = Math.abs(vx * dy - vy * dx);
    if (along <= 0 || across > along) continue;
    // 곧은 방향을 우선 — 옆으로 벗어난 만큼 멀게 친다
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // 지원하지 않거나 막힌 기기 — 무시
  }
}

/** OS 동작 줄이기 — 화면 흔들림을 끈다 */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PlaySession({ stage, mode, title, campaign, onRankedOver, rankedResult, banner, resumeFields, exitMessage, boardKey, seed, restore, intro, notice, exitHref, onRetry }: SessionProps) {
  const router = useRouter();
  const renderMap = useMemo(() => toRenderMap(stage), [stage]);
  const canvas = useDefenseCanvas(renderMap, DPR_CAP);
  const { settings, update: updateSettings } = useDefenseSettings();
  // 시작 배속 — 판은 첫 렌더에 만들어진다(설정 훅은 마운트 뒤에 읽는다). 판 중 배속은 HUD 버튼
  const [initialSpeed] = useState<Speed>(() => loadSettings().defaultSpeed);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const fx = useRef<{ particles: ParticlePool; numbers: DamageNumberPool; effects: EffectPool; scratch: ReturnType<typeof createSceneScratch> } | null>(null);
  if (fx.current === null) {
    fx.current = { particles: new ParticlePool(PARTICLE_CAPACITY), numbers: new DamageNumberPool(NUMBER_CAPACITY), effects: new EffectPool(EFFECT_CAPACITY), scratch: createSceneScratch() };
  }
  const noticeRef = useRef(createTickNotice());
  const sfxRef = useRef<Sfx | null>(null);
  if (sfxRef.current === null) sfxRef.current = new Sfx();
  const leakAtRef = useRef(-Infinity);
  const shakeUntilRef = useRef(-Infinity);
  /** 이번 판에서 만난 적 — 저장 시점에 도감 기록으로 */
  const metRef = useRef<number[]>([]);
  /** 그리기 루프가 읽는 선택 표시 (맵 좌표·사거리) */
  const selectionRef = useRef<{ x: number; y: number; range: number } | null>(null);
  /** 웨이브 경계가 지나면 다음 프레임 전에 이어하기를 저장한다 */
  const saveDueRef = useRef(false);
  /** 이어하기 저장 실패를 이미 알렸나 — 웨이브마다 되풀이하지 않게 판당 한 번 */
  const resumeSaveWarnedRef = useRef(false);

  const [selected, setSelected] = useState<number | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [bossBanner, setBossBanner] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(() => (intro === "briefing" && campaign ? briefingFor(campaign.meta.id) : null));
  const [tutorialOn, setTutorialOn] = useState(intro === "tutorial");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const overlayOpenRef = useRef(false);
  /** 나가기 확인을 띄우며 일시정지했나 — 계속하기면 다시 진행 */
  const pausedForExitRef = useRef(false);

  const onTickEvents = useCallback((events: readonly number[], view: RenderView, prev: RenderView) => {
    const pools = fx.current!;
    const notice = applyTickEvents(events, view, prev, pools, noticeRef.current, settingsRef.current.damageNumbers);
    const now = performance.now();
    for (const sound of notice.sounds) sfxRef.current!.play(sound, now);
    if (notice.leakedLives > 0) {
      leakAtRef.current = now;
      if (settingsRef.current.vibration) vibrate(30);
      shakeUntilRef.current = now + SHAKE_MS;
    }
    if (notice.bossSpawned >= 0) {
      shakeUntilRef.current = now + SHAKE_MS * 2;
      setBossBanner(ENEMY_NAMES[notice.bossSpawned]);
    }
    for (let i = 0; i < events.length; i += EVENT_STRIDE) {
      if (events[i] === EVENT.SPAWN && !metRef.current.includes(events[i + 2])) metRef.current.push(events[i + 2]);
      else if (events[i] === EVENT.WAVE_START || events[i] === EVENT.WAVE_CLEAR) saveDueRef.current = true;
    }
  }, []);

  const reducedMotionRef = useRef(false);
  useEffect(() => {
    reducedMotionRef.current = prefersReducedMotion();
  }, []);
  /** 마지막으로 그린 프레임 — 루프가 멈춘 뒤(판 끝) 화면 크기가 바뀌면 다시 그린다 */
  const lastFrameRef = useRef<FrameInfo | null>(null);
  const shakingRef = useRef(false);
  const onFrame = useCallback(
    (frame: FrameInfo) => {
      const ctx = canvas.fgContextRef.current;
      const viewport = canvas.viewportRef.current;
      const { particles, numbers, effects, scratch } = fx.current!;
      lastFrameRef.current = frame;
      particles.update(frame.frameMs);
      numbers.update(frame.frameMs);
      effects.update(frame.frameMs);
      if (saveDueRef.current) persistRef.current();
      if (!ctx || !viewport) return;
      const showNumbers = settingsRef.current.damageNumbers;
      drawSceneLayer(ctx, { prev: frame.prev, curr: frame.curr, alpha: frame.alpha, particles, numbers, effects, showDamageNumbers: showNumbers, timeMs: frame.now }, viewport, scratch);
      if (selectionRef.current) drawSelection(ctx, selectionRef.current, viewport);
      drawBossBar(ctx, viewport, frame.curr, ENEMY_NAMES);
      drawLeakPulse(ctx, viewport, 1 - (frame.now - leakAtRef.current) / LEAK_PULSE_MS);
      // 화면 흔들림(설정) — 컨테이너만 옮긴다(캔버스 다시 그리기 없음). 끝나면 한 번 원위치
      const container = canvas.containerRef.current;
      const shaking = settingsRef.current.shake && !reducedMotionRef.current && frame.now < shakeUntilRef.current;
      if (container && (shaking || shakingRef.current)) {
        container.style.transform = shaking ? `translate(${(Math.random() - 0.5) * SHAKE_PX * 2}px, ${(Math.random() - 0.5) * SHAKE_PX * 2}px)` : "";
        shakingRef.current = shaking;
      }
    },
    [canvas.fgContextRef, canvas.viewportRef, canvas.containerRef],
  );

  // 크기가 바뀌면 캔버스 백버퍼가 지워진다 — 루프가 돌고 있으면 다음 프레임이 그리지만, 멈춘 뒤에는 여기서 한 번(경과 0)
  useEffect(() => {
    const frame = lastFrameRef.current;
    if (canvas.viewport && frame) onFrame({ ...frame, frameMs: 0 });
  }, [canvas.viewport, onFrame]);

  /** 무한·주간 결과 콜백 — 부모가 렌더마다 새 함수를 넘겨도 onOver가 바뀌지 않게 최신 값만 */
  const onRankedOverRef = useRef(onRankedOver);
  onRankedOverRef.current = onRankedOver;
  const onOver = useCallback(
    (result: PlayResult, state: GameState) => {
      clearResume();
      saveProgress(markEnemiesMet(loadProgress(), metRef.current));
      // 별·진행도·로컬 다시보기는 캠페인만 — 무한·주간 기록은 서버 등록(결과 화면)
      const outcome = campaign ? settleCampaign({ stageId: campaign.meta.id, difficulty: campaign.difficulty, boardKey, seed, engineVersion: ENGINE_VERSION, ...result }) : null;
      if (!campaign) onRankedOverRef.current?.(result, state);
      sfxRef.current!.play(result.victory ? SOUND.VICTORY : SOUND.DEFEAT, performance.now());
      setSelected(null);
      setArmed(null);
      setFinished({ result, campaign: outcome });
    },
    [campaign, boardKey, seed],
  );

  const { hud, dispatch, togglePause, cycleSpeed, stateRef, recorderRef } = useDefensePlay({
    stage,
    seed,
    restore,
    initialSpeed,
    onTickEvents,
    onFrame,
    onOver,
  });

  /** 이어하기 저장(웨이브 경계·숨김·나가기) + 만난 적 기록 — 판 시작 전·끝난 뒤는 저장하지 않는다 */
  const persistRef = useRef(() => {});
  persistRef.current = () => {
    saveDueRef.current = false;
    const state = stateRef.current;
    if (state.over || state.wavesStarted === 0) return;
    const saved = saveResume({ engineVersion: ENGINE_VERSION, mode, boardKey, seed, tick: state.tick, inputs: recorderRef.current.inputs.slice(), savedAt: Date.now(), ...resumeFields });
    // 저장소 차단·용량 초과면 떠났다 돌아와도 이어할 수 없다 — 모르고 떠나지 않게 한 번 알린다 (games-polish FE-46)
    if (!saved && !resumeSaveWarnedRef.current) {
      resumeSaveWarnedRef.current = true;
      toast("이어하기를 저장하지 못했어요. 이 화면을 떠나면 판을 이어갈 수 없어요.", { id: "defense-resume-save" });
    }
    const progress = loadProgress();
    const next = markEnemiesMet(progress, metRef.current);
    if (next !== progress) saveProgress(next);
  };
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) persistRef.current();
    };
    const onPageHide = () => persistRef.current();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      // 브라우저 뒤로가기 같은 클라이언트 이동은 pagehide가 없다 — 떠날 때 한 번(끝난 판·시작 전 판은 persist가 거른다)
      persistRef.current();
    };
  }, []);

  // 효과음 — 꺼져 있으면 컨텍스트를 만들지 않는다. 켜져 있는데 아직 소리가 안 나면(저장값 켜짐·제스처 전 suspended·iOS 끊김)
  // 사용자 활성화를 주는 이벤트(pointerup·touchend·click·keydown — 터치의 pointerdown은 활성화가 아니다)마다 다시 시도한다
  // 음소거 토글을 누르는 제스처는 건너뛴다(끄려는 손짓에 컨텍스트를 만들지 않게)
  useEffect(() => {
    const sfx = sfxRef.current!;
    if (!settings.sound) {
      sfx.setEnabled(false);
      return;
    }
    // 이미 만든 컨텍스트면 바로 켠다 — 처음 만드는 것은 아래 제스처에서만(제스처 밖에서 만들면 iOS가 소리를 내지 않는다)
    if (sfx.created) sfx.setEnabled(true);
    const unlock = (e: Event) => {
      if (sfx.created && !sfx.waitingForGesture) return;
      if (e.target instanceof Element && e.target.closest('[data-testid="defense-sound"]')) return;
      sfx.setEnabled(true);
      sfx.unlock();
    };
    const events = ["pointerup", "touchend", "click", "keydown"] as const;
    for (const type of events) window.addEventListener(type, unlock);
    return () => {
      for (const type of events) window.removeEventListener(type, unlock);
    };
  }, [settings.sound]);
  useEffect(() => sfxRef.current!.setSpeed(hud.speed), [hud.speed]);
  // 끝난 판은 멈추지 않는다 — 승패음(0.6~0.8초)이 끝까지 나게. 루프는 판이 끝나면 곧 멈춘다
  useEffect(() => sfxRef.current!.setPaused(hud.status === "paused"), [hud.status]);
  useEffect(() => () => sfxRef.current?.dispose(), []);

  const toggleSound = useCallback(() => {
    const on = !settingsRef.current.sound;
    // 이 클릭이 사용자 제스처 — 여기서 켜야 컨텍스트가 소리를 낸다
    sfxRef.current!.setEnabled(on);
    updateSettings({ sound: on });
  }, [updateSettings]);
  /** 설정 패널 — 효과음을 바꾸는 체크도 제스처 안이라 그 자리에서 켠다/끈다 */
  const changeSettings = useCallback(
    (patch: Parameters<typeof updateSettings>[0]) => {
      if (patch.sound !== undefined) sfxRef.current!.setEnabled(patch.sound);
      updateSettings(patch);
    },
    [updateSettings],
  );

  // 보스 등장 배너 — 잠깐 보이고 사라진다
  useEffect(() => {
    if (!bossBanner) return;
    const timer = setTimeout(() => setBossBanner(null), BOSS_BANNER_MS);
    return () => clearTimeout(timer);
  }, [bossBanner]);

  // 엔진 상태는 ref — HUD 스냅샷(골드·웨이브·명령 version이 바뀔 때만 새 객체)을 다시 계산 신호로 쓴다
  const options = useMemo(
    () => (selected === null || hud.status === "over" ? [] : ringOptions(stateRef.current, stage, selected)),
    [selected, hud, stage, stateRef],
  );

  // 선택·미리보기 → 캔버스 사거리 원
  useEffect(() => {
    if (selected === null) {
      selectionRef.current = null;
      return;
    }
    const spot = stage.map.slots[selected];
    const armedOption = options.find((o) => o.id === armed);
    selectionRef.current = { x: spot.x, y: spot.y, range: armedOption && armedOption.range > 0 ? armedOption.range : currentRange(stateRef.current, selected) };
  }, [selected, armed, options, stage, stateRef]);

  const slotButtons = useRef<(HTMLButtonElement | null)[]>([]);
  /** 링을 키보드(Enter·Space로 슬롯 누름)로 열었나 — 포커스 이동은 키보드로 연 경우만(마우스·터치면 포커스를 옮기지 않는다) */
  const [keyboardRing, setKeyboardRing] = useState(false);
  const keyboardRingRef = useRef(false);
  keyboardRingRef.current = keyboardRing;
  const close = useCallback(() => {
    setSelected((slot) => {
      // 키보드로 연 링이 닫히면 포커스를 그 슬롯으로 되돌린다(링 버튼이 사라져 포커스를 잃지 않게)
      if (slot !== null && keyboardRingRef.current) queueMicrotask(() => slotButtons.current[slot]?.focus({ preventScroll: true }));
      return null;
    });
    setArmed(null);
  }, []);

  /** 마지막 포인터 종류 — 마우스로 누른 슬롯만 포커스를 놓는다(터치·펜·보조기기 두 번 탭은 포커스를 그대로 둔다) */
  const lastPointerRef = useRef("");
  const selectSlot = (slot: number, byKeyboard: boolean) => {
    if (hud.status === "over") return;
    // 잠긴 자리(개척 전·좁은 땅)는 링이 없다 — 고르지 않고 닫는다(선택 고리만 남지 않게, games-polish FE-08)
    const state = stateRef.current;
    if (!state.towers.some((t) => t.slot === slot) && !slotAvailable(state, stage, slot)) {
      setArmed(null);
      setSelected(null);
      return;
    }
    setArmed(null);
    setKeyboardRing(byKeyboard);
    // 마우스로 누른 버튼에 포커스를 주는 브라우저가 있다 — 남은 포커스가 Enter를 엉뚱한 슬롯으로 보내지 않게 놓는다
    if (!byKeyboard && lastPointerRef.current === "mouse") slotButtons.current[slot]?.blur();
    // 다음 클릭은 다음 pointerdown이 정한다 — 포인터 없이 클릭을 합성하는 보조기기가 이전 'mouse'를 물려받지 않게
    lastPointerRef.current = "";
    setSelected((current) => (current === slot ? null : slot));
  };

  const tapOption = useCallback(
    (option: RingOption) => {
      const next = tapRing(armed, option);
      setArmed(next.armed);
      if (!next.command) return;
      const { op } = next.command;
      const ok = dispatch(op, next.command.a, next.command.b);
      if (ok) {
        const sound = op === OP.BUILD ? SOUND.BUILD : op === OP.SELL ? SOUND.SELL : op === OP.UPGRADE || op === OP.BRANCH ? SOUND.UPGRADE : -1;
        if (sound >= 0) sfxRef.current!.play(sound, performance.now());
      }
      // 건설·판매 뒤에는 닫고, 업그레이드·타게팅은 같은 슬롯을 열어 둔다(연속 업그레이드)
      if (ok && (op === OP.BUILD || op === OP.SELL)) close();
    },
    [armed, dispatch, close],
  );

  const callWave = useCallback(() => {
    // 대화상자(브리핑 등) 뒤에서 판이 시작되지 않게
    if (overlayOpenRef.current) return;
    // 직접 부른 웨이브는 엔진이 렌더 이벤트를 내지 않는다(명령 적용은 이벤트 버퍼 없이) — 시작음을 여기서
    if (dispatch(OP.CALL_WAVE)) {
      sfxRef.current!.play(SOUND.WAVE_START, performance.now());
      persistRef.current();
    }
  }, [dispatch]);

  // 튜토리얼 단계(§F5) — 판 상태로 정하고, 웨이브를 부르면 끝(저장)
  const step = tutorialOn ? tutorialStep({ ringOpen: selected !== null, towers: stateRef.current.towers.length, wavesStarted: hud.wavesStarted }) : null;
  useEffect(() => {
    if (tutorialOn && hud.wavesStarted > 0) {
      setTutorialOn(false);
      saveProgress(markTutorialDone(loadProgress()));
    }
  }, [tutorialOn, hud.wavesStarted]);
  const skipTutorial = () => {
    setTutorialOn(false);
    saveProgress(markTutorialDone(loadProgress()));
  };
  const closeBriefing = () => {
    setBriefing(null);
    if (campaign) saveProgress(markBriefingSeen(loadProgress(), campaign.meta.id));
  };

  // 증강 대기 — 카드를 고르는 동안 링은 닫고 단축키·호출을 막는다(엔진도 카드 선택만 받는다)
  const choosingAugment = hud.status === "augment" && !finished;
  useEffect(() => {
    if (choosingAugment) close();
  }, [choosingAugment, close]);
  const pickAugment = useCallback(
    (index: number) => {
      if (dispatch(OP.PICK_AUGMENT, index)) persistRef.current();
    },
    [dispatch],
  );

  const overlayOpen = !!finished || !!briefing || settingsOpen || confirmExit || choosingAugment;
  overlayOpenRef.current = overlayOpen;

  // 데스크톱 단축키 (§F3): 1~6 타워 · U 업그레이드 · A/B 분기 · S 판매 · T 타게팅 · Space 호출 · P/Esc 일시정지 · F 배속 · 방향키 슬롯 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 길게 누름(반복)·한글 조합 중·대화상자(결과·브리핑·설정·나가기 확인)에서는 단축키를 쓰지 않는다 — 2탭 확정이 반복 키로 풀리지 않게(§F0-2)
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing || overlayOpen) return;
      const key = shortcutOf(e);
      if (key === null) return;
      if (key === " ") {
        if (isTextInput(e.target)) return;
        e.preventDefault();
        callWave();
        return;
      }
      const arrow = ARROWS[key];
      // 링 안 버튼에 포커스가 있으면 방향키는 슬롯을 옮기지 않는다(링이 옛 슬롯에 열린 채 포커스만 빠지지 않게)
      if (arrow && document.activeElement?.closest('[data-testid="defense-ring"]')) return;
      if (arrow) {
        const focused = slotButtons.current.findIndex((b) => b === document.activeElement);
        const from = focused >= 0 ? focused : (selected ?? -1);
        const target = from < 0 ? 0 : nearestSlotInDirection(stage.map.slots, from, arrow[0], arrow[1]);
        if (target >= 0) {
          e.preventDefault();
          slotButtons.current[target]?.focus();
        }
        return;
      }
      if (key === "Escape" && selected !== null) {
        close();
        return;
      }
      if (key === "P" || key === "Escape") {
        togglePause();
        return;
      }
      if (key === "F") {
        cycleSpeed();
        return;
      }
      const option = options.find((o) => o.shortcut === key);
      if (option) {
        e.preventDefault();
        tapOption(option);
      }
    };
    // 버튼의 Space 누르기는 keyup에서 일어나는 브라우저가 있다(Firefox 등) — keydown과 같이 keyup도 막는다
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !overlayOpen && !isTextInput(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [options, selected, overlayOpen, stage, callWave, close, togglePause, cycleSpeed, tapOption]);

  const nextIndex = nextWaveIndex(stateRef.current, stage);
  const preview = useMemo(() => (nextIndex === null ? [] : wavePreview(stage, nextIndex)), [stage, nextIndex]);
  const viewport = canvas.viewport;
  const nextMeta = campaign ? (CAMPAIGN[campaign.meta.number] ?? null) : null;
  const slotSize = useMemo(() => {
    if (!viewport) return SLOT_BUTTON;
    let min = Infinity;
    const slots = stage.map.slots;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) min = Math.min(min, Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y));
    }
    return Math.min(SLOT_BUTTON, Math.floor(min * viewport.scale));
  }, [viewport, stage]);
  const tutorialTarget = step === 0 && viewport ? { x: toScreenX(viewport, stage.map.slots[TUTORIAL_SLOT].x), y: toScreenY(viewport, stage.map.slots[TUTORIAL_SLOT].y) } : null;
  // 말풍선은 가리키는 곳(0단계 슬롯 고리·1단계 열린 링과 설명 카드)을 덮지 않고, 슬롯을 덜 덮는 쪽(위·아래) — 같으면 가리키는 곳의 반대편, 2단계는 위
  // 시작 안내는 웨이브 전까지 — 튜토리얼 중에는 말풍선에 붙고(띠도 그만큼 두껍게), 아니면 위쪽에 따로
  const noticeVisible = !!notice && hud.status === "ready" && !finished;
  const tutorialFocus = !viewport
    ? null
    : tutorialTarget
      ? { top: tutorialTarget.y - TUTORIAL_TARGET_SIZE / 2, bottom: tutorialTarget.y + TUTORIAL_TARGET_SIZE / 2 }
      : step === 1 && selected !== null
        ? ringSpan(toScreenY(viewport, stage.map.slots[selected].y), viewport.height)
        : null;
  const tutorialAbove =
    step === null || !viewport
      ? true
      : tutorialBubbleAbove(
          viewport.height,
          stage.map.slots.map((slot) => toScreenY(viewport, slot.y)),
          slotSize / 2,
          tutorialFocus,
          tutorialFocus ? tutorialFocus.top + tutorialFocus.bottom > viewport.height : true,
          // 시작 안내가 말풍선에 붙으면 그만큼 띠가 두껍다
          TUTORIAL_BUBBLE_BAND + (noticeVisible ? TUTORIAL_NOTICE_BAND : 0),
        );

  const leave = () => {
    persistRef.current();
    router.replace(exitHref);
  };
  const requestExit = () => {
    // 확인을 고르는 동안 판이 흘러 목숨을 잃지 않게 멈춘다
    pausedForExitRef.current = hud.status === "playing";
    if (pausedForExitRef.current) togglePause();
    setConfirmExit(true);
  };
  const cancelExit = () => {
    setConfirmExit(false);
    if (pausedForExitRef.current && hud.status === "paused") togglePause();
    pausedForExitRef.current = false;
  };
  // 확인 중에 판이 끝나면(이론상 — 일시정지 중이라 안 끝난다) 확인을 닫고 결과를 보인다
  if (confirmExit && finished) setConfirmExit(false);

  return (
    <main className="flex h-full flex-col" aria-label={title}>
      <Hud
        hud={hud}
        exitHref={exitHref}
        onRequestExit={hud.wavesStarted > 0 && !finished ? requestExit : undefined}
        soundOn={settings.sound}
        onToggleSound={toggleSound}
        onTogglePause={togglePause}
        onCycleSpeed={cycleSpeed}
        showTotalWaves={mode === "campaign"}
        exitLabel={campaign ? undefined : "디펜스 처음으로 나가기"}
      />
      {mode !== "campaign" && <RankedStrip rules={stateRef.current.rules} bannedTower={stateRef.current.bannedTower} augments={stateRef.current.augments} />}
      <div className="relative min-h-0 flex-1" ref={canvas.containerRef} data-testid="defense-board" data-status={hud.status}>
        <canvas ref={canvas.bgRef} className="absolute inset-0" aria-hidden="true" />
        <canvas ref={canvas.fgRef} className="absolute inset-0" aria-hidden="true" onPointerDown={close} />
        {viewport &&
          stage.map.slots.map((spot, i) => {
            const tower = stateRef.current.towers.find((t) => t.slot === i);
            // 잠긴 자리 — 개척 증강 전·좁은 땅 규칙. 판 중에 바뀌므로(증강) 렌더마다 판정, 배경 맵 대신 버튼에 표시 (FE-08)
            const locked = !tower && !slotAvailable(stateRef.current, stage, i);
            const label = tower ? `${TOWER_NAMES[tower.kind]} Lv${tower.level}` : locked ? "잠긴 자리" : "빈 자리";
            return (
              <button
                key={i}
                ref={(el) => {
                  slotButtons.current[i] = el;
                }}
                type="button"
                data-testid={`defense-slot-${i}`}
                data-tower={tower ? tower.kind : ""}
                data-level={tower ? tower.level : 0}
                aria-label={`슬롯 ${i + 1} — ${label}`}
                aria-pressed={selected === i}
                aria-disabled={locked || undefined}
                data-locked={locked || undefined}
                disabled={hud.status === "over"}
                onPointerDown={(e) => {
                  lastPointerRef.current = e.pointerType;
                }}
                // detail 0 = 키보드(Enter·Space)로 누른 클릭
                onClick={(e) => selectSlot(i, e.detail === 0)}
                className="absolute rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                style={{ left: toScreenX(viewport, spot.x) - slotSize / 2, top: toScreenY(viewport, spot.y) - slotSize / 2, width: slotSize, height: slotSize }}
              >
                {locked && (
                  <span aria-hidden="true" className="pointer-events-none flex h-full w-full items-center justify-center rounded-full bg-slate-950/65 text-xs">
                    🔒
                  </span>
                )}
              </button>
            );
          })}
        {viewport && selected !== null && options.length > 0 && (
          <TowerRing
            key={selected}
            options={options}
            anchor={{ x: toScreenX(viewport, stage.map.slots[selected].x), y: toScreenY(viewport, stage.map.slots[selected].y) }}
            bounds={{ width: viewport.width, height: viewport.height }}
            armed={armed}
            focusOnOpen={keyboardRing}
            onTap={tapOption}
          />
        )}
        {step !== null && !briefing && (
          <TutorialOverlay step={step} target={tutorialTarget} above={tutorialAbove} notice={noticeVisible ? notice : null} onSkip={skipTutorial} />
        )}
        {bossBanner && (
          <p
            role="status"
            data-testid="defense-boss-banner"
            className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 rounded-full border border-rose-400/50 bg-rose-950/90 px-4 py-1.5 text-sm font-bold text-rose-100 shadow-lg shadow-rose-900/50"
          >
            보스 등장 — {bossBanner}
          </p>
        )}
        {hud.status === "paused" && !finished && (
          // 위쪽은 보스 체력 막대 자리 — 일시정지 표시는 아래에(튜토리얼 말풍선이 아래면 막대 밑으로). 표시가 가린 슬롯도 눌리게 설정 버튼만 받는다
          <div
            className={`pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/90 py-1 pl-3 pr-1 text-xs text-slate-200 ${step !== null && !tutorialAbove ? "top-12" : "bottom-3"}`}
            role="status"
          >
            <span>일시정지 — 지금도 건설할 수 있어요</span>
            <button
              type="button"
              data-testid="defense-settings-open"
              onClick={() => setSettingsOpen(true)}
              className="pointer-events-auto min-h-11 rounded-full border border-white/20 px-3 text-xs font-semibold text-slate-100"
            >
              설정
            </button>
          </div>
        )}
        {hud.status === "ready" && !finished && step === null && !briefing && (
          <div className="pointer-events-none absolute left-1/2 top-3 grid w-[min(92%,22rem)] -translate-x-1/2 gap-1 text-center" role="status">
            <p className="rounded-full bg-slate-900/90 px-3 py-1 text-xs text-slate-200">돌 받침을 눌러 타워를 짓고 웨이브를 시작하세요</p>
          </div>
        )}
        {/* 시작 안내(이어하기 못 불러옴·다른 판 저장본이 바뀜) — 웨이브 전까지. 튜토리얼 중에는 말풍선에 붙여 그린다(TutorialOverlay) */}
        {noticeVisible && !briefing && step === null && (
          <p
            role="status"
            data-testid="defense-notice"
            className="pointer-events-none absolute left-1/2 top-12 w-[min(92%,22rem)] -translate-x-1/2 rounded-xl bg-amber-950/90 px-3 py-1 text-center text-xs text-amber-100"
          >
            {notice}
          </p>
        )}
        {briefing && <BriefingCard briefing={briefing} onClose={closeBriefing} />}
        {/* 나가기 확인·설정이 위에 뜨면 카드 대화상자를 내린다(포커스 가둠·숫자 키가 겹치지 않게) — 닫으면 다시 */}
        {choosingAugment && !confirmExit && !settingsOpen && <AugmentPicker key={hud.wavesCleared} choices={stateRef.current.augmentChoices} onPick={pickAugment} rarityOf={(id) => AUGMENTS[id]?.rarity ?? 0} />}
        {banner}
        {finished && !finished.campaign && rankedResult}
        {finished?.campaign && (
          <ResultPanel
            result={finished.result}
            stars={finished.campaign.stars}
            replaySaved={finished.campaign.replaySaved}
            progressSaved={finished.campaign.progressSaved}
            nextHref={nextMeta ? stagePath(nextMeta.id) : null}
            replayHref={campaign ? `/games/defense/replays/local/${campaign.meta.id}` : null}
            exitHref={exitHref}
            onRetry={onRetry}
          />
        )}
      </div>
      <WaveBar hud={hud} preview={preview} blocked={overlayOpen} onCall={callWave} />
      <SettingsPanel open={settingsOpen} settings={settings} onChange={changeSettings} onClose={() => setSettingsOpen(false)} />
      <ConfirmModal
        isOpen={confirmExit}
        onClose={cancelExit}
        onConfirm={leave}
        title="판을 나갈까요?"
        message={exitMessage}
        confirmLabel="나가기"
        cancelLabel="계속하기"
      />
    </main>
  );
}

