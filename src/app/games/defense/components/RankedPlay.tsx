"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizePlayerName, validatePlayerName } from "@/app/games/_shared/lib/playerName";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { createGameSession } from "@/services/gameService";
import { ApiError } from "@/types/api";
import { ENGINE_VERSION, MAX_INPUT_LENGTH, MAX_TICKS, resolveBoard, scoreOf } from "../engine";
import { type PlayResult } from "../hooks/useDefensePlay";
import { sessionClockAt, useSessionClock } from "../hooks/useSessionClock";
import { randomSeed } from "../lib/campaign";
import { defenseStorage, recordBest } from "../lib/defenseGame";
import { isRankedUnlocked, loadProgress } from "../lib/progress";
import { ENDLESS_BOARD_KEY, type RankedMode, boardTitle, modeOfBoardKey, weeklyBoardKeyAt } from "../lib/rankedBoards";
import { type ResumeSlot, clearResume, loadResume } from "../lib/resume";
import { type RestoredGame, restoreGame } from "../lib/restoreGame";
import { PlaySession } from "./DefensePlay";
import { RankedResult } from "./RankedResult";

/**
 * 무한·주간 플레이 입구 (defense DESIGN §F1·§F9b·§B3) — 시작 화면 → "시작"에서 세션 발급 → 판(PlaySession 공용) → 게임 오버·등록
 * - 세션이 판의 seed·보드를 정한다. 발급 실패(503 저장소·주간 비활성·429·네트워크)면 이유를 알리고 로컬 seed로 플레이(등록 불가, 테트리스 방식)
 * - ?seed= 고정 판은 세션 없이 로컬(자동 검증·재현용)
 * - 세션 만료는 이 기기에서 흐른 시간으로(useSessionClock) — 30분 전 예고, 만료 뒤에는 등록 불가로 계속 플레이
 * - 이어하기: 같은 모드 저장본만 고르게 한다(세션도 함께 — 만료됐으면 등록 불가로 이어서)
 * - 스테이지 4를 깨야 열린다(§L7) — 랭킹 보기는 누구나
 */
type Props = {
  mode: RankedMode;
  fixedSeed: number | null;
};

type Session = { sessionId: string; receivedAt: number };
type Run = { n: number; boardKey: string; seed: number; restore: RestoredGame | null; notice: string | null; session: Session | null; sessionError: string | null };
type Over = { result: PlayResult; score: number; wave: number; kills: number; isNewBest: boolean; sessionId: string | null; sessionError: string | null };

const EXIT_HREF = "/games/defense";
const OTHER_SLOT_NOTICE = "웨이브를 시작하면 다른 판의 이어하기 저장이 이 판으로 바뀌어요";
const EXPIRED_MESSAGE = "세션 시간이 지나 이번 판은 랭킹에 등록할 수 없어요.";

function sessionErrorMessage(err: unknown): string {
  // 서버가 이유를 아는 503(세션 저장소·주간 비활성)은 그 문구 그대로 — 그 밖은 이유 + 등록 없이 플레이
  if (err instanceof ApiError && (err.code === "GAME_SESSION_UNAVAILABLE" || err.code === "GAME_WEEKLY_UNAVAILABLE")) return err.getDefaultMessage();
  return `${extractErrorMessage(err, "랭킹 등록을 준비하지 못했습니다.")} 이번 판은 등록 없이 플레이해요.`;
}

/** 로컬 판 보드 — 세션이 없으면 표기용(등록 안 됨). 주간은 이번 주 키에 로컬 seed(규칙·맵은 이번 주 공식 판과 다를 수 있다) */
function localBoardKey(mode: RankedMode): string {
  return mode === "endless" ? ENDLESS_BOARD_KEY : weeklyBoardKeyAt(Date.now());
}

export default function RankedPlay({ mode, fixedSeed }: Props) {
  const { data: authSession, status: authStatus } = useSession();
  const accessToken = authSession?.user?.accessToken ?? undefined;
  const loginName = authSession?.user?.userName ?? "";
  const [checked, setChecked] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [resumeOffer, setResumeOffer] = useState<ResumeSlot | null>(null);
  /** 이어하기를 못 불러왔을 때 시작 화면 안내(캠페인과 같은 문구) */
  const [resumeFailed, setResumeFailed] = useState(false);
  const [otherSlot, setOtherSlot] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const clock = useSessionClock(run?.session?.receivedAt ?? null);

  useEffect(() => {
    setUnlocked(isRankedUnlocked(loadProgress()));
    const slot = loadResume();
    const usable = slot && slot.engineVersion === ENGINE_VERSION;
    if (usable && slot.mode === mode && modeOfBoardKey(slot.boardKey) === mode) setResumeOffer(slot);
    else setOtherSlot(!!usable);
    setChecked(true);
  }, [mode]);

  const stage = useMemo(() => (run ? resolveBoard(mode, run.boardKey, run.seed) : null), [mode, run]);

  /** 세션 요청 중 — 같은 렌더 안 연속 클릭(다시 하기 연타)도 막게 ref로 */
  const requestingRef = useRef(false);
  /** 새 판 — 세션은 판마다 1회용이라 다시 하기도 새로 받는다. warnOtherSlot: 다른 판 저장본이 바뀐다고 알릴지(다시 하기는 이미 지웠다) */
  const start = async (n: number, warnOtherSlot = otherSlot) => {
    if (requestingRef.current) return;
    const notice = warnOtherSlot ? OTHER_SLOT_NOTICE : null;
    // 결과는 새 판이 정해질 때 지운다 — 세션을 받는 동안 결과 패널이 사라져 빈 판만 남지 않게
    const local = (reason: string) => {
      setOver(null);
      // 로컬 주간 판은 seed가 달라 이번 주 공식 판과 맵·규칙이 다르다
      setRun({ n, boardKey: localBoardKey(mode), seed: fixedSeed ?? randomSeed(), restore: null, notice, session: null, sessionError: mode === "weekly" ? `${reason} 맵·규칙도 이번 주 공식 판과 달라요.` : reason });
    };
    if (fixedSeed !== null) {
      local("seed를 고정한 판은 랭킹에 등록되지 않아요.");
      return;
    }
    requestingRef.current = true;
    setRequesting(true);
    try {
      const { data } = await createGameSession("defense", accessToken, mode);
      if (data.engineVersion !== ENGINE_VERSION) local("게임이 업데이트되었어요. 새로고침하면 랭킹에 등록할 수 있어요.");
      // 이 앱의 엔진이 풀 수 없는 보드(새 시즌 등)면 그 판을 열 수 없다 — 로컬 판으로
      else if (!data.boardKey || modeOfBoardKey(data.boardKey) !== mode || !resolveBoard(mode, data.boardKey, data.seed)) local("랭킹 등록을 준비하지 못했어요. 이번 판은 등록 없이 플레이해요.");
      else {
        setOver(null);
        setRun({ n, boardKey: data.boardKey, seed: data.seed, restore: null, notice, session: { sessionId: data.sessionId, receivedAt: Date.now() }, sessionError: null });
      }
    } catch (err) {
      local(sessionErrorMessage(err));
    } finally {
      requestingRef.current = false;
      setRequesting(false);
    }
  };

  const resume = (slot: ResumeSlot) => {
    const board = resolveBoard(mode, slot.boardKey, slot.seed);
    const restored = board ? restoreGame(board, slot.seed, slot.inputs, slot.tick) : null;
    setResumeOffer(null);
    if (!restored) {
      clearResume();
      setOtherSlot(false);
      setResumeFailed(true);
      return;
    }
    const session = slot.sessionId && slot.sessionReceivedAt !== undefined ? { sessionId: slot.sessionId, receivedAt: slot.sessionReceivedAt } : null;
    setRun({ n: 0, boardKey: slot.boardKey, seed: slot.seed, restore: restored, notice: null, session, sessionError: session ? null : "이 판은 랭킹에 등록할 수 없어요." });
  };

  if (!checked) return null;
  if (run && stage) {
    const title = boardTitle(run.boardKey);
    const onRankedOver = (result: PlayResult, state: Parameters<typeof scoreOf>[0]) => {
      const { score, wave } = scoreOf(state);
      // 서버 상한을 넘은 판은 검증에서 거절된다 — 제출하지 않고 안내만
      const overLimit = result.endTick > MAX_TICKS || result.inputs.length > MAX_INPUT_LENGTH;
      const expired = run.session !== null && sessionClockAt(run.session.receivedAt, Date.now()) === "expired";
      const sessionId = run.session && !overLimit && !expired ? run.session.sessionId : null;
      const sessionError = overLimit ? "판이 너무 길어 랭킹에 등록할 수 없어요." : expired ? EXPIRED_MESSAGE : run.sessionError;
      // 최고 기록은 등록할 수 있는 판만(세션이 있고 만료·상한 초과가 아닌 판) — 로컬·만료·너무 긴 판이 공식 보드 기록과 섞이지 않게
      setOver({ result, score, wave, kills: state.kills, isNewBest: sessionId ? recordBest(run.boardKey, score) : false, sessionId, sessionError });
    };
    const candidate = [loginName, defenseStorage.loadLastName()].find((name) => name && validatePlayerName(name) === null);
    return (
      <PlaySession
        key={run.n}
        stage={stage}
        mode={mode}
        title={title}
        campaign={null}
        exitMessage="지금까지의 판은 이어하기로 저장해 둘게요. 다시 들어오면 이어서 할 수 있어요."
        boardKey={run.boardKey}
        seed={run.seed}
        restore={run.restore}
        intro={null}
        notice={[run.notice, run.restore ? null : run.sessionError].filter(Boolean).join(" ") || null}
        exitHref={EXIT_HREF}
        resumeFields={run.session ? { sessionId: run.session.sessionId, sessionReceivedAt: run.session.receivedAt } : undefined}
        banner={!over && (clock === "warn" || clock === "expired") ? <SessionBanner expired={clock === "expired"} /> : null}
        onRankedOver={onRankedOver}
        rankedResult={
          over && (
            <RankedResult
              title={title}
              result={over.result}
              score={over.score}
              wave={over.wave}
              kills={over.kills}
              boardKey={run.boardKey}
              weekly={mode === "weekly"}
              isNewBest={over.isNewBest}
              sessionId={over.sessionId}
              sessionError={over.sessionError}
              accessToken={accessToken}
              defaultName={candidate ? normalizePlayerName(candidate) : ""}
              onRetry={() => {
                clearResume();
                setOtherSlot(false);
                void start(run.n + 1, false);
              }}
            />
          )
        }
        onRetry={() => {
          clearResume();
          setOtherSlot(false);
          void start(run.n + 1, false);
        }}
      />
    );
  }

  const title = mode === "endless" ? "무한 모드" : "주간 도전";
  const rankingsLink = (
    <Link href={`/games/defense/rankings?board=${mode === "endless" ? ENDLESS_BOARD_KEY : "weekly"}`} className="flex min-h-11 items-center text-sm text-sky-300">
      랭킹 보기
    </Link>
  );
  if (!unlocked) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" data-testid="defense-ranked-locked">
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-sm text-slate-300">캠페인 스테이지 4를 깨면 열려요.</p>
        {rankingsLink}
        <Link href={EXIT_HREF} className="flex min-h-11 items-center text-sm text-slate-400">
          디펜스 처음으로
        </Link>
      </main>
    );
  }
  // 로그인 상태를 확인하는 동안에는 막는다 — 로그인 사용자가 비로그인 세션을 받지 않게
  const busy = requesting || authStatus === "loading";
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" data-testid="defense-ranked-start" data-mode={mode}>
      <h1 className="text-xl font-bold text-white">{title}</h1>
      <p className="max-w-xs text-sm text-slate-300">
        {mode === "endless" ? "웨이브가 끝없이 와요. 5웨이브마다 증강 카드를 하나 골라요." : "이번 주 맵과 규칙은 모두에게 같아요. 5웨이브마다 증강 카드를 하나 골라요."}
      </p>
      {resumeFailed && (
        <p role="status" className="text-sm text-amber-200" data-testid="defense-resume-failed">
          이어하기를 불러오지 못해 새로 시작해요
        </p>
      )}
      {resumeOffer ? (
        <>
          <p className="text-sm text-slate-200">하던 판이 있어요 — {boardTitle(resumeOffer.boardKey)}</p>
          <button
            type="button"
            data-testid="defense-resume-continue"
            onClick={() => resume(resumeOffer)}
            className="min-h-12 w-full max-w-xs rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white"
          >
            이어하기
          </button>
          <button
            type="button"
            data-testid="defense-resume-new"
            disabled={busy}
            onClick={() => {
              clearResume();
              setResumeOffer(null);
              setOtherSlot(false);
              void start(0);
            }}
            className="min-h-12 w-full max-w-xs rounded-full border border-white/20 text-sm font-semibold text-slate-100 disabled:opacity-50"
          >
            새로 시작
          </button>
        </>
      ) : (
        <button
          type="button"
          data-testid="defense-ranked-play"
          disabled={busy}
          aria-busy={requesting}
          onClick={() => void start(0)}
          className="min-h-12 w-full max-w-xs rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white disabled:opacity-50"
        >
          {requesting ? "준비 중…" : "시작"}
        </button>
      )}
      {rankingsLink}
      <Link href={EXIT_HREF} className="flex min-h-11 items-center text-sm text-slate-400">
        디펜스 처음으로
      </Link>
    </main>
  );
}

/** 세션 만료 예고·만료 (§F2 오버레이) — 판 위쪽 띠, 조작을 막지 않는다 */
function SessionBanner({ expired }: { expired: boolean }) {
  return (
    <p
      role="status"
      data-testid="defense-session-banner"
      data-expired={expired}
      className="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-xl border border-amber-300/40 bg-amber-950/90 px-3 py-1.5 text-center text-xs text-amber-100"
    >
      {expired ? `${EXPIRED_MESSAGE} 계속 플레이할 수 있어요.` : "30분 안에 세션이 끝나요 — 등록하려면 그 전에 판을 끝내야 해요."}
    </p>
  );
}
