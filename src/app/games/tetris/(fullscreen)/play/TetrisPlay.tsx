"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/app/teams/components";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { createGameSession, getGameScore } from "@/services/gameService";
import { SESSION_AUTH_EXPIRED_MESSAGE, isAuthExpired } from "@/app/games/_shared/lib/submitError";
import { useLatestRequest } from "../../hooks/useLatestRequest";
import { useMediaQuery } from "@/app/games/_shared/hooks/useMediaQuery";
import { sessionTtlMs } from "@/app/games/_shared/lib/sessionTtl";
import { ApiError } from "@/types/api";
import type { GameSession, ReplayPayload, ScoreSummary } from "@/types/game";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { ENGINE_VERSION, type GameState, MAX_FRAMES, MAX_INPUT_LENGTH } from "../../engine";
import { normalizePlayerName, validatePlayerName } from "@/app/games/_shared/lib/playerName";
import { TetrisCanvas } from "../../components/TetrisCanvas";
import { useMySkins } from "../../hooks/useMySkins";
import { GamePad } from "@/app/games/_shared/components/GamePad";
import { TETRIS_PAD_LAYOUT } from "../../lib/tetrisPadLayout";
import { EffectsToggle } from "../../components/EffectsToggle";
import { SoundButton } from "@/app/games/_shared/components/SoundButton";
import { type GameResult, GameOverPanel } from "../../components/GameOverPanel";
import { useTetrisPlay } from "../../hooks/useTetrisPlay";
import { CONTROL_GUIDE } from "../../lib/controls";
import { formatFrames, formatScore } from "@/app/games/_shared/lib/format";
import { loadLastName, recordBestScore } from "../../lib/storage";
import { useTetrisSettings } from "../../hooks/useTetrisSettings";
import { isDailyBoardKey, recordDailyRun } from "../../lib/daily";
import { challengeHeadline, challengeRootId } from "../../lib/challenge";

type SessionState =
  | { status: "loading" }
  /**
   * receivedAt: 이 기기 시계로 받은 시각 — 만료 판정은 이 기기에서 흐른 시간으로 한다
   * ttlMs: 받은 순간 남은 시간(응답 ttlSeconds, 없으면 expiresAt 기준 — _shared/lib/sessionTtl)
   */
  | { status: "ready"; session: GameSession; receivedAt: number; ttlMs: number }
  /** 발급 실패 — 로컬 시드로 플레이만 한다 */
  | { status: "failed"; seed: number; error: string }
  /** 도전장을 열 수 없다(원본 없음·공개 전·지난 버전) — 다른 seed로 하면 도전이 아니므로 시작하지 않는다 */
  | { status: "blocked"; error: string };

/** 세션 TTL 상한(백엔드 2시간) — 응답 남은 시간이 이보다 길게 잡히면(기기 시계가 늦다 등) 이 값으로 (sessionTtlMs) */
const SESSION_TTL_FALLBACK_MS = 120 * 60 * 1000;
/** 판 최대 길이(60분) + 여유 1분 — 남은 시간이 이보다 짧으면 시작 전에 새로 받는다 */
const SESSION_PLAY_MARGIN_MS = 61 * 60 * 1000;
/** 세션 응답이 이만큼 늦으면 "등록 없이 시작"을 보인다 — 발급 상한(10초)까지 시작을 막지 않게 (games-polish FE-12) */
export const SLOW_SESSION_MS = 3000;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** 도전장 세션이 거절된 이유 — 다시 받아도 같으므로 시작을 막는다(문구는 고정 — 서버 원문을 그대로 띄우지 않는다). 그 밖(망·503)은 null */
function challengeBlockMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.code === "GAME_CHALLENGE_EXPIRED") return "지난 버전 게임의 기록이라 이 도전장은 더 이상 할 수 없어요.";
  if (err.status === 404) return "도전할 기록을 찾을 수 없어요. 지워졌거나 아직 공개 전인 기록이에요.";
  if (err.status === 409 || err.status === 422) return "이 기록에는 도전할 수 없어요.";
  return null;
}

/** 세션을 못 받았을 때 — 이번 판은 로컬 seed로 등록 없이. 오늘의 테트리스·도전장이면 같은 블록 순서가 아님을 밝힌다 */
function sessionErrorMessage(err: unknown, variant: "daily" | "challenge" | null): string {
  // 로그인 토큰이 거절됐다 — 익명 세션으로 바꿔 받지 않는다(기록이 내 것이 아니게 된다)
  if (isAuthExpired(err)) return SESSION_AUTH_EXPIRED_MESSAGE;
  if (err instanceof ApiError && err.code === "GAME_SESSION_UNAVAILABLE") return err.getDefaultMessage();
  if (err instanceof ApiError && err.code === "GAME_DAILY_UNAVAILABLE") return "지금은 오늘의 테트리스를 열 수 없어요. 이번 판은 일반 판으로 등록 없이 플레이해요.";
  if (variant === "daily") return "오늘의 테트리스를 준비하지 못했어요. 이번 판은 일반 판으로 등록 없이 플레이해요.";
  if (variant === "challenge") return "도전장을 준비하지 못했어요. 이번 판은 일반 판으로 등록 없이 플레이해요.";
  return `${extractErrorMessage(err, "랭킹 등록을 준비하지 못했습니다.")} 이번 판은 등록 없이 플레이해요.`;
}

/**
 * daily: 오늘의 테트리스(games-growth B1) — 데일리 세션(모두 같은 seed)으로, 결과는 오늘 순위·Wordle식 공유
 * challengeScoreId: 도전장(B2) — 그 기록(원본)과 같은 seed로, 결과는 원본과 비교·도전장 순위
 */
export default function TetrisPlay({ daily = false, challengeScoreId }: { daily?: boolean; challengeScoreId?: number }) {
  const { data: authSession, status: authStatus } = useSession();
  // 내 판은 내 보드 스킨(D-003) — 게스트·불러오기 전은 기본
  const { equipped } = useMySkins();
  const mySkins = { block: equipped.block, effect: equipped.effect, board: equipped.board };
  const accessToken = authSession?.user?.accessToken ?? undefined;

  // 조작 설정 — 진동은 바로 반영, DAS·ARR은 판을 시작할 때 엔진에 넘긴다(판 도중 바꾸면 다음 판부터)
  const { settings } = useTetrisSettings();
  const isCoarse = useMediaQuery("(pointer: coarse)");
  const [sessionState, setSessionState] = useState<SessionState>({ status: "loading" });
  /** 판이 끝난 순간의 세션 — 데일리 보드면 오늘 첫 판을 남긴다 */
  const sessionStateRef = useRef(sessionState);
  sessionStateRef.current = sessionState;
  const [phase, setPhase] = useState<"ready" | "game">("ready");
  const [result, setResult] = useState<{
    result: GameResult;
    replay: ReplayPayload;
    overLimit: boolean;
    defaultName: string;
    /** 데일리 세션으로 한 판 — isFirstRun: 이 기기의 오늘 첫 판(공유 문구 기준) */
    daily: { boardKey: string; isFirstRun: boolean } | null;
    /** 도전장 세션으로 한 판 — 도전장 보드(challenge-{원본 id}) */
    challengeBoardKey: string | null;
  } | null>(null);
  const userNameRef = useRef("");
  userNameRef.current = authSession?.user?.userName ?? "";
  const startButtonRef = useRef<HTMLButtonElement>(null);

  const onGameOver = useCallback((state: GameState, replay: ReplayPayload) => {
    const isNewBest = recordBestScore(state.score);
    const current = sessionStateRef.current;
    const dailyBoardKey = current.status === "ready" && current.session.boardKey && isDailyBoardKey(current.session.boardKey) ? current.session.boardKey : null;
    const challengeBoardKey = current.status === "ready" && challengeRootId(current.session.boardKey) !== null ? current.session.boardKey! : null;
    const daily = dailyBoardKey
      ? { boardKey: dailyBoardKey, isFirstRun: recordDailyRun({ boardKey: dailyBoardKey, score: state.score, lines: state.lines, level: state.level }) }
      : null;
    // 이름 기본값은 판마다: 로그인 닉네임 → 마지막에 쓴 이름 (등록 규칙을 통과하는 것만)
    const candidate = [userNameRef.current, loadLastName()].find((name) => name && validatePlayerName(name) === null);
    setResult({
      result: { score: state.score, lines: state.lines, level: state.level, frames: state.endFrame, isNewBest },
      replay,
      // 서버 상한(MAX_FRAMES·MAX_INPUT_LENGTH)을 넘은 판은 검증에서 거절된다 — 제출하지 않고 안내만
      overLimit: replay.frames > MAX_FRAMES || replay.inputs.length > MAX_INPUT_LENGTH,
      defaultName: candidate ? normalizePlayerName(candidate) : "",
      daily,
      challengeBoardKey,
    });
  }, []);

  const play = useTetrisPlay({ vibration: settings.vibration, onGameOver });

  // "처음부터"를 연달아 눌러도 늦게 온 이전 세션 응답이 최신 상태를 덮지 않게 (FE-21)
  const beginSessionRequest = useLatestRequest();
  const requestSession = useCallback(async () => {
    const isLatest = beginSessionRequest();
    setSessionState({ status: "loading" });
    try {
      const { data } = await createGameSession("tetris", accessToken, daily ? "daily" : challengeScoreId ? { challengeScoreId } : undefined);
      if (!isLatest()) return;
      if (data.engineVersion !== ENGINE_VERSION) {
        setSessionState({
          status: "failed",
          seed: randomSeed(),
          error: "게임이 업데이트되었어요. 새로고침하면 랭킹에 등록할 수 있어요.",
        });
        return;
      }
      const receivedAt = Date.now();
      setSessionState({ status: "ready", session: data, receivedAt, ttlMs: sessionTtlMs(data, receivedAt, SESSION_TTL_FALLBACK_MS) });
    } catch (err) {
      if (!isLatest()) return;
      const blocked = challengeScoreId ? challengeBlockMessage(err) : null;
      if (blocked) setSessionState({ status: "blocked", error: blocked });
      else setSessionState({ status: "failed", seed: randomSeed(), error: sessionErrorMessage(err, daily ? "daily" : challengeScoreId ? "challenge" : null) });
    }
  }, [accessToken, beginSessionRequest, daily, challengeScoreId]);

  // 도전장 원본 기록 — 세션 boardKey(challenge-{원본 id})로. 링크의 id가 도전장 기록이어도 원본을 보인다
  const [original, setOriginal] = useState<ScoreSummary | null>(null);
  const originalRequestedRef = useRef<number | null>(null);
  const rootId = sessionState.status === "ready" ? challengeRootId(sessionState.session.boardKey) : null;
  useEffect(() => {
    if (rootId === null || originalRequestedRef.current === rootId) return;
    originalRequestedRef.current = rootId;
    getGameScore("tetris", rootId)
      .then(({ data }) => setOriginal(data))
      // 원본 요약을 못 받아도 도전은 된다 — 비교만 빠진다. 다음 세션(다시 하기)에서 다시 묻게 표시를 지운다
      .catch(() => {
        if (originalRequestedRef.current === rootId) originalRequestedRef.current = null;
      });
  }, [rootId]);

  // 로그인 상태가 정해진 뒤 첫 세션을 받는다 (로그인이면 기록에 USER_ID가 남는다)
  // 이후 세션은 판마다 restart가 새로 받는다
  const firstSessionRequestedRef = useRef(false);
  useEffect(() => {
    if (authStatus === "loading" || firstSessionRequestedRef.current) return;
    firstSessionRequestedRef.current = true;
    requestSession();
  }, [authStatus, requestSession]);

  const { start: startPlay } = play;
  const beginGame = useCallback(
    (seed: number) => {
      setResult(null);
      setPhase("game");
      startPlay(seed, settings.das, settings.arr);
    },
    [startPlay, settings.das, settings.arr],
  );

  /** 세션을 새로 받은 뒤 바로 시작할지 — "시작"을 한 번만 눌러도 되게 */
  const startAfterSessionRef = useRef(false);

  const startGame = () => {
    if (sessionState.status === "loading" || sessionState.status === "blocked") return;
    // 준비 화면에 오래 두어 판 도중(최대 60분) 세션이 만료될 수 있으면 새로 받은 뒤 이어서 시작한다
    if (sessionState.status === "ready" && Date.now() - sessionState.receivedAt > sessionState.ttlMs - SESSION_PLAY_MARGIN_MS) {
      startAfterSessionRef.current = true;
      requestSession();
      return;
    }
    beginGame(sessionState.status === "ready" ? sessionState.session.seed : sessionState.seed);
  };

  useEffect(() => {
    if (!startAfterSessionRef.current || sessionState.status === "loading") return;
    startAfterSessionRef.current = false;
    // 재발급에 실패하면 자동으로 시작하지 않는다 — 준비 화면에서 "등록 불가" 안내를 보고 시작하게
    if (sessionState.status === "ready") beginGame(sessionState.session.seed);
  }, [beginGame, sessionState]);

  // 세션 응답이 늦으면 기다리지 않고 등록 없이 시작할 수 있게 한다 — 늦게 온 응답은 버린다(이 판은 로컬 seed)
  const [sessionSlow, setSessionSlow] = useState(false);
  useEffect(() => {
    setSessionSlow(false);
    if (sessionState.status !== "loading") return;
    const timer = setTimeout(() => setSessionSlow(true), SLOW_SESSION_MS);
    return () => clearTimeout(timer);
  }, [sessionState.status]);

  const startWithoutSession = () => {
    beginSessionRequest(); // 진행 중인 발급 응답을 낡은 것으로 — 늦게 와도 이 판을 바꾸지 않는다
    startAfterSessionRef.current = false;
    const seed = randomSeed();
    setSessionState({ status: "failed", seed, error: "서버 응답이 늦어 이번 판은 랭킹 등록 없이 플레이해요." });
    beginGame(seed);
  };

  /** 일시정지의 "처음부터" — 진행 중인 판을 버리므로 한 번 묻는다 (games-polish FE-27) */
  const [confirmRestart, setConfirmRestart] = useState(false);

  const restart = () => {
    play.reset();
    setResult(null);
    setPhase("ready");
    requestSession();
  };

  // "시작" 버튼은 세션을 받는 동안 비활성이라 autoFocus가 안 먹는다 — 활성화될 때 포커스를 준다
  const startEnabled = phase === "ready" && sessionState.status !== "loading" && sessionState.status !== "blocked";
  useEffect(() => {
    if (startEnabled) startButtonRef.current?.focus();
  }, [startEnabled]);

  const showControls = phase === "game" && play.status !== "over" && isCoarse;
  // 세션을 못 받아 로컬 seed로 하는 판(failed)은 같은 블록 순서가 아니다 — 데일리·도전장 문구를 거둔다(거절된 도전장은 무엇을 못 하는지 보이게 남긴다)
  const dailyLive = daily && sessionState.status !== "failed";
  const challengeLive = !!challengeScoreId && sessionState.status !== "failed";

  return (
    // relative — 가로 화면에서 패드가 판 위에 겹쳐 좌우로 갈라진다(GamePad)
    <div className="relative flex h-full flex-col pt-[env(safe-area-inset-top)]">
      {/* 상단 — 나가기·점수판·일시정지 */}
      {/* 320px에서도 한 줄 — 휴대폰 폭(640px 미만)에서는 나가기를 화살표만, 여백·간격·라벨·숫자를 폭에 맞춰 줄인다(글자 꺾임·잘림 금지, 점수 9,999,999까지) */}
      {/* 휴대폰은 위아래 여백 2px — 판 높이에 돌려준다(D-004 H1, 버튼 터치 영역 44px은 그대로) */}
      <header className="flex items-center gap-1.5 px-2 py-0.5 sm:py-2 min-[360px]:gap-2 min-[360px]:px-3 sm:gap-3">
        <Link
          href="/games/tetris"
          aria-label="나가기"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
        >
          <span aria-hidden="true">←</span>
          <span aria-hidden="true" className="ml-1 hidden sm:inline">
            나가기
          </span>
        </Link>
        <dl className="flex min-w-0 flex-1 justify-center gap-[clamp(4px,2.5vw,16px)] overflow-hidden whitespace-nowrap text-center text-[clamp(10px,3.2vw,12px)] tabular-nums sm:gap-8">
          <div>
            <dt className="text-slate-500">점수</dt>
            <dd className="text-[clamp(11px,3.4vw,14px)] font-bold tracking-tight text-white">{formatScore(play.hud.score)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">줄</dt>
            <dd className="text-[clamp(11px,3.4vw,14px)] font-bold tracking-tight text-white">{play.hud.lines}</dd>
          </div>
          <div>
            <dt className="text-slate-500">레벨</dt>
            <dd className="text-[clamp(11px,3.4vw,14px)] font-bold tracking-tight text-white">{play.hud.level}</dd>
          </div>
          <div>
            <dt className="text-slate-500">시간</dt>
            <dd className="text-[clamp(11px,3.4vw,14px)] font-bold tracking-tight text-white">{formatFrames(play.hud.frame)}</dd>
          </div>
        </dl>
        {/* 소리 설정 모달을 여는 동안 판을 멈춘다 */}
        <SoundButton className="shrink-0" onOpenChange={(open) => open && play.pause()} />
        <button
          type="button"
          onClick={(e) => {
            // 마우스로 누른 뒤 포커스가 남으면 Space가 이 버튼까지 누를 수 있다 — 포커스를 놓는다
            e.currentTarget.blur();
            if (play.status === "paused") play.resume();
            else play.pause();
          }}
          disabled={play.status !== "playing" && play.status !== "paused"}
          aria-label={play.status === "paused" ? "계속하기" : "일시정지"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-slate-300 disabled:opacity-40"
        >
          {play.status === "paused" ? "▶" : "❚❚"}
        </button>
      </header>

      {/* 판 */}
      {/* 루트 layout이 이미 <main>으로 감싼다 — 중첩하지 않는다 */}
      <div className="relative min-h-0 flex-1">
        <TetrisCanvas stateRef={play.stateRef} drawRef={play.afterTickRef} effectsRef={play.effectsRef} skins={mySkins} />

        {phase === "ready" && (
          <Overlay>
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center">
              <p className="text-xs font-semibold tracking-[0.4em] text-slate-400">{dailyLive ? "DAILY" : challengeLive ? "CHALLENGE" : "TETRIS"}</p>
              <h1 className="mt-2 text-2xl font-bold text-white">
                {dailyLive ? "오늘의 테트리스" : challengeLive ? (original ? challengeHeadline(original) : "도전장") : "준비됐나요?"}
              </h1>
              {dailyLive && sessionState.status !== "blocked" && <p className="mt-2 text-sm text-slate-300">오늘은 모두 같은 블록 순서예요. 첫 판 기록으로 결과를 공유해요.</p>}
              {challengeLive && sessionState.status !== "blocked" && <p className="mt-2 text-sm text-slate-300">같은 블록 순서로 이 점수를 넘어 보세요.</p>}
              <p className="mt-2 text-sm text-slate-400" role="status">
                {sessionState.status === "loading"
                  ? "랭킹 등록을 준비하는 중..."
                  : sessionState.status === "failed" || sessionState.status === "blocked"
                    ? sessionState.error
                    : "게임이 끝나면 이름을 적어 랭킹에 올릴 수 있어요."}
              </p>
              {sessionState.status === "blocked" ? (
                <Link href="/games/tetris/play" className="mt-5 flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white">
                  일반 게임 하기
                </Link>
              ) : (
                <Button
                  type="button"
                  size="md"
                  fullWidth
                  className="mt-5 min-h-11"
                  ref={startButtonRef}
                  onClick={startGame}
                  disabled={sessionState.status === "loading"}
                >
                  시작
                </Button>
              )}
              {sessionState.status === "loading" && sessionSlow && (
                <Button type="button" variant="secondary" size="md" fullWidth className="mt-2 min-h-11" onClick={startWithoutSession}>
                  등록 없이 시작
                </Button>
              )}
              <EffectsToggle className="mt-3" />
              {!isCoarse && <ControlGuide />}
            </div>
          </Overlay>
        )}

        {phase === "game" && play.status === "paused" && (
          <Overlay>
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center">
              <h2 className="text-2xl font-bold text-white">일시정지</h2>
              <div className="mt-5 flex flex-col gap-2">
                <Button type="button" size="md" fullWidth className="min-h-11" onClick={play.resume} autoFocus>
                  계속하기
                </Button>
                <Button type="button" variant="secondary" size="md" fullWidth className="min-h-11" onClick={() => setConfirmRestart(true)}>
                  처음부터
                </Button>
              </div>
              <EffectsToggle className="mt-3" />
              {!isCoarse && <ControlGuide />}
            </div>
          </Overlay>
        )}

        {phase === "game" && play.status === "over" && result && (
          <Overlay>
            <GameOverPanel
              result={result.result}
              replay={result.replay}
              sessionId={sessionState.status === "ready" && !result.overLimit ? sessionState.session.sessionId : null}
              sessionError={
                result.overLimit
                  ? `플레이가 너무 길어(60분 또는 입력 ${(MAX_INPUT_LENGTH / 2).toLocaleString("ko-KR")}회 초과) 랭킹에 등록할 수 없어요.`
                  : sessionState.status === "failed"
                    ? sessionState.error
                    : null
              }
              accessToken={accessToken}
              defaultName={result.defaultName}
              daily={result.daily}
              challenge={result.challengeBoardKey ? { boardKey: result.challengeBoardKey, original } : null}
              onRestart={restart}
            />
          </Overlay>
        )}
      </div>

      {showControls && (
        <GamePad layout={TETRIS_PAD_LAYOUT} onHoldStart={play.press} onHoldEnd={play.release} onInstant={play.instant} active={play.status === "playing"} />
      )}
      <ConfirmModal
        isOpen={confirmRestart}
        onClose={() => setConfirmRestart(false)}
        onConfirm={() => {
          setConfirmRestart(false);
          restart();
        }}
        title="처음부터 다시 할까요?"
        message="지금 판은 끝나고 기록이 남지 않아요."
        confirmLabel="처음부터"
        cancelLabel="계속하기"
        variant="danger"
      />
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4" style={{ touchAction: "auto" }}>
      {children}
    </div>
  );
}

function ControlGuide() {
  return (
    <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-left text-xs">
      {CONTROL_GUIDE.map(({ keys, label }) => (
        <div key={keys} className="contents">
          <dt className="font-mono font-semibold text-sky-300">{keys}</dt>
          <dd className="text-slate-400">{label}</dd>
        </div>
      ))}
    </dl>
  );
}
