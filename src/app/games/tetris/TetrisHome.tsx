"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { TeamsPageLayout, Button, EmptyState, LoadingSpinnerSimple } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { getGameRankings, getMyBestScore, submitGameScore } from "@/services/gameService";
import type { RankingItem } from "@/types/game";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { RankingTable } from "@/app/games/_shared/components/RankingTable";
import { invalidateRankings } from "@/app/games/_shared/components/RankingsView";
import { TETRIS_GAME } from "./lib/game";
import { BattleEntry } from "./battle-ui/components/BattleEntry";
import { HomeLobbyChat } from "./battle-ui/components/HomeLobbyChat";
import { DailyCard } from "./components/DailyCard";
import { tetrisRankLabel } from "./lib/replayCard";
import { GameSettingsButton } from "@/app/games/_shared/components/GameSettingsButton";
import { ReloginButton } from "@/app/games/_shared/components/ReloginButton";
import { TetrisSettingsSheet } from "./components/TetrisSettingsSheet";
import { MySkinButton } from "./components/MySkinCard";
import { RECORDS_LIMIT, TetrisRecordsCard } from "./components/TetrisRecordsCard";
import { formatScore } from "@/app/games/_shared/lib/format";
import { normalizePlayerName, validatePlayerName } from "@/app/games/_shared/lib/playerName";
import { classifySubmitError } from "@/app/games/_shared/lib/submitError";
import {
  type PendingSubmission,
  addMyScoreId,
  loadBestScore,
  loadMyScoreIds,
  loadPendingSubmissions,
  removePendingSubmission,
  saveLastName,
} from "./lib/storage";
import { syncPointsAfterScore } from "./lib/mySkins";

/** about: 서버가 그린 소개·특징(검색엔진이 읽을 글) — 화면 맨 아래 */
export default function TetrisHome({ about }: { about?: ReactNode }) {
  const { data: session, status: authStatus } = useSession();
  const accessToken = session?.user?.accessToken ?? undefined;
  const [needsNewName, setNeedsNewName] = useState(false);
  const [pendingName, setPendingName] = useState("");

  /** 내 최고 점수 — null = 아직 모름(로그인이면 서버 값을 기다린다) */
  const [best, setBest] = useState<number | null>(null);
  /** 등록하면 올려 서버 최고점을 다시 받는다 */
  const [bestVersion, setBestVersion] = useState(0);
  const [myScoreIds, setMyScoreIds] = useState<ReadonlySet<number>>(new Set());
  const [preview, setPreview] = useState<RankingItem[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  /** 등록 못 한 기록 — 오래된 것부터 하나씩 재시도한다 */
  const [pendingList, setPendingList] = useState<PendingSubmission[]>([]);
  const pending = pendingList[0] ?? null;
  // 게임 오버 순간 이름 없이 보관한 기록(기본 이름이 없었다)이면 이름부터 묻는다 (games-polish FE-05)
  const askName = needsNewName || pending?.playerName === "";
  /** 보관 기록 버리기 확인 — 게임 오버 순간 선보관(FE-05)이라 등록할 마음이 없는 기록도 남는다 (games-polish P5) */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  /** 보관분 재등록이 로그인 만료(401)로 거절됐다 — 다시 로그인한 뒤 내 기록으로 등록한다 */
  const [pendingNeedsLogin, setPendingNeedsLogin] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  /** 이름 문제로 펼친 폼이 그려지면 이름 칸으로 포커스(한 줄 배너의 등록 버튼이 사라져 키보드·스크린리더가 자리를 잃지 않게) */
  const focusNameRef = useRef(false);
  useEffect(() => {
    if (!askName || !focusNameRef.current) return;
    focusNameRef.current = false;
    document.getElementById("tetris-pending-name")?.focus();
  }, [askName]);

  // 브라우저 저장소는 마운트 후에 읽는다 (서버 렌더와 어긋나지 않게)
  useEffect(() => {
    setMyScoreIds(new Set(loadMyScoreIds()));
    setPendingList(loadPendingSubmissions());
  }, []);

  /** 처리한 기록을 빼고 다음 기록으로 */
  const dropPending = (sessionId: string) => {
    removePendingSubmission(sessionId);
    setPendingList(loadPendingSubmissions());
    setNeedsNewName(false);
  };

  /**
   * 내 최고 점수 — 로그인이면 계정의 서버 기록(모든 보드: 이 브라우저 최고점도 일반·데일리·도전장 판을 모두 센다), 서버에 기록이 없거나
   * 불러오지 못하면(엔드포인트 배포 전 404 포함) 이 브라우저 최고점. 비로그인도 브라우저 최고점
   * 서버 값을 우선한다 — 같은 브라우저를 쓴 다른 사람·게스트 판이 계정 기록으로 보이지 않게(등록하지 않은 판은 서버에 없다)
   */
  useEffect(() => {
    if (authStatus === "loading") return;
    if (!accessToken) {
      setBest(loadBestScore());
      return;
    }
    let cancelled = false;
    getMyBestScore("tetris", accessToken)
      .then(({ data }) => !cancelled && setBest(data.score ?? loadBestScore()))
      .catch(() => !cancelled && setBest(loadBestScore()));
    return () => {
      cancelled = true;
    };
  }, [authStatus, accessToken, bestVersion]);

  // 오늘 랭킹 미리보기 — 로그인이면 토큰을 실어 내 기록(isMine)을 받는다. 로그인 상태가 정해진 뒤 한 번
  useEffect(() => {
    if (authStatus === "loading") return;
    let cancelled = false;
    getGameRankings("tetris", "daily", RECORDS_LIMIT, undefined, accessToken)
      .then(({ data }) => !cancelled && setPreview(data.items))
      .catch((err) => !cancelled && setPreviewError(extractErrorMessage(err, "랭킹을 불러오지 못했습니다.")));
    return () => {
      cancelled = true;
    };
  }, [authStatus, accessToken]);

  const retryPending = async () => {
    if (!pending || isRetrying) return;
    let playerName = pending.playerName;
    if (askName) {
      const nameError = validatePlayerName(pendingName);
      if (nameError) {
        setPendingMessage(nameError);
        return;
      }
      playerName = normalizePlayerName(pendingName);
    }
    setIsRetrying(true);
    setPendingMessage(null);
    setPendingNeedsLogin(false);
    try {
      const { data } = await submitGameScore(
        "tetris",
        { sessionId: pending.sessionId, playerName, replay: pending.replay },
        accessToken,
      );
      invalidateRankings("tetris");
      addMyScoreId(data.scoreId);
      saveLastName(data.playerName ?? playerName);
      dropPending(pending.sessionId);
      setMyScoreIds(new Set(loadMyScoreIds()));
      setBestVersion((v) => v + 1);
      syncPointsAfterScore(data.points);
      // 데일리·도전장 판이면 그 보드 순위로 읽히게(결과 화면의 "오늘의 순위"·"도전장 순위"와 같은 값). 로그인 기록이면 쌓인 스킨 포인트도
      const earned = data.points ? ` +${Math.max(0, data.points.earned).toLocaleString("ko-KR")} P` : "";
      setPendingMessage(data.ranks ? `등록했어요! ${tetrisRankLabel(pending.board, data.ranks.all)}${earned}` : `등록했어요! 순위는 랭킹에서 확인해 주세요.${earned}`);
    } catch (err) {
      // 보관된 기록은 앞서 한 번 실패한 제출의 재시도다
      const { kind, message } = classifySubmitError(err, true);
      setPendingNeedsLogin(kind === "auth");
      if (kind === "final") {
        dropPending(pending.sessionId);
      } else if (kind === "name") {
        // 세션은 그대로 — 이름만 바꿔 다시 낸다. 한 줄 배너가 펼친 폼으로 바뀌며 누른 버튼이 사라지니 이름 칸으로 포커스(아래 effect — 그려진 뒤)
        setNeedsNewName(true);
        setPendingName(playerName);
        // 한 줄 배너에서 거절됐을 때만(이미 펼친 폼이면 버튼·이름 칸이 그대로라 옮기지 않는다 — 플래그가 남아 나중에 포커스를 빼앗지 않게)
        focusNameRef.current = !askName;
      }
      setPendingMessage(message);
    } finally {
      setIsRetrying(false);
    }
  };

  const rankingPreview = previewError ? (
    <p className="text-sm text-red-300">{previewError}</p>
  ) : preview === null ? (
    <LoadingSpinnerSimple message="랭킹을 불러오는 중..." />
  ) : preview.length === 0 ? (
    <EmptyState message="오늘은 아직 기록이 없어요." description="첫 번째 주인공이 되어 보세요!" variant="minimal" />
  ) : (
    <RankingTable game={TETRIS_GAME} items={preview} myScoreIds={myScoreIds} compact />
  );

  return (
    <TeamsPageLayout maxWidth="lg-wide">
      {/*
        위계(tetris-home·tetris-home-chat): 상단 바(내 스킨 🎨·설정 ⚙) → 플레이(게임 시작 타일 + 오늘의 테트리스 타일) → 로비 채팅 3줄 → 친구와 대전
        → (등록 못 한 기록 한 줄) → 기록 탭(3줄) → 링크 줄·소개(접기)
        채움은 "게임 시작" 하나 — 나머지는 테두리·줄·글자 링크. 375 첫 화면에 대전 카드까지. 데스크톱(lg)은 왼쪽 플레이 쪽·오른쪽 기록 쪽 2단
      */}
      <header className="flex items-center gap-1">
        <Link
          href="/games"
          aria-label="게임 목록"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="flex-1 text-2xl font-bold text-white [text-shadow:0_0_14px_rgba(56,189,248,0.6)]">테트리스</h1>
        {/* 내 스킨(스킨 상세로 바로)·설정(소리·조작·화면·스킨)은 첫 화면 오른쪽 위 (P8·D-001) */}
        <MySkinButton />
        <GameSettingsButton testId="tetris-settings-open" renderSheet={(close) => <TetrisSettingsSheet onClose={close} />} />
      </header>
      <div className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          {/*
            플레이 — 게임 시작(채움, 주 행동)과 오늘의 테트리스(테두리 보조 타일)를 나란히(tetris-home D-003)
            최고 점수는 시작 타일 안 둘째 줄. 데일리 보드가 없으면 시작이 줄을 다 쓴다
          */}
          <section className="flex gap-2" aria-label="플레이" data-testid="tetris-play">
            <Link
              href="/games/tetris/play"
              className="flex min-h-20 flex-[1.15] flex-col justify-center rounded-3xl bg-gradient-to-br from-indigo-500 via-sky-500 to-cyan-400 px-4 py-3 leading-tight text-white shadow-lg shadow-sky-500/40 hover:brightness-110"
            >
              <span className="text-lg font-bold">
                <span aria-hidden="true">▶ </span>게임 시작
              </span>
              <span className="mt-1 text-xs text-white/85">최고 {best === null ? "…" : best > 0 ? formatScore(best) : "-"}</span>
            </Link>
            <DailyCard className="flex-1" />
          </section>

          {/* 로비 채팅 — 최근 3줄·한 줄 입력, 홈에 있는 동안만 대전 소켓을 연다 (tetris-home-chat) */}
          <HomeLobbyChat />

          {/* 대전 — 첫 화면 안에 색 테두리로 (games-polish P8·tetris-home) */}
          <BattleEntry />

          {/* 등록 못 한 기록 — 이름이 있으면 한 줄(등록·버리기), 이름부터 물어야 하면 펼친다 */}
          {pending && !askName ? (
            <section className={`${cardStyles.section} p-2 pl-4`} role="status" data-testid="tetris-pending">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-slate-200">
                  등록 못 한 기록{pendingList.length > 1 ? ` ${pendingList.length}건` : ""} <strong>{formatScore(pending.score)}점</strong>
                </p>
                {/* 테두리형 — 채움은 게임 시작 하나 */}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11 shrink-0 border-sky-400/50 text-sky-100"
                  onClick={retryPending}
                  disabled={isRetrying || authStatus === "loading"}
                  aria-busy={isRetrying}
                  aria-label={`${pending.playerName} ${formatScore(pending.score)}점 다시 등록하기`}
                >
                  {isRetrying ? "등록 중..." : "등록"}
                </Button>
                <Button type="button" variant="secondary" size="sm" className="min-h-11 shrink-0" onClick={() => setConfirmDiscard(true)} disabled={isRetrying}>
                  버리기
                </Button>
              </div>
              {pendingMessage && <p className="mt-1 pr-2 text-sm text-slate-300">{pendingMessage}</p>}
              {pendingNeedsLogin && <ReloginButton className="mt-1" />}
              <ConfirmModal
                isOpen={confirmDiscard}
                onClose={() => setConfirmDiscard(false)}
                onConfirm={() => {
                  setConfirmDiscard(false);
                  dropPending(pending.sessionId);
                  setPendingMessage(null);
                }}
                title="이 기록을 버릴까요?"
                message="버리면 랭킹에 다시 등록할 수 없어요."
                confirmLabel="버리기"
                cancelLabel="취소"
                variant="danger"
              />
            </section>
          ) : (pending || pendingMessage) && (
            <section className={`${cardStyles.section} p-4`} role="status">
              {pending && (
                <>
                  <p className="text-sm text-slate-200">
                    등록하지 못한 기록이 있어요{pendingList.length > 1 ? ` (${pendingList.length}건)` : ""} —{" "}
                    <strong>{askName ? pendingName : pending.playerName}</strong> · {formatScore(pending.score)}점
                  </p>
                  {askName && (
                    <div className="mt-3">
                      <label htmlFor="tetris-pending-name" className="mb-1 block text-xs text-slate-400">
                        {pending.playerName === "" ? "등록할 이름 (1~12자)" : "다른 이름으로 등록 (1~12자)"}
                      </label>
                      <input
                        id="tetris-pending-name"
                        value={pendingName}
                        onChange={(e) => setPendingName(e.target.value)}
                        className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-base text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3 min-h-11"
                    onClick={retryPending}
                    // 로그인 상태를 확인하는 동안에는 막는다 — 비로그인으로 잘못 등록되지 않게
                    disabled={isRetrying || authStatus === "loading"}
                    aria-busy={isRetrying}
                  >
                    {isRetrying ? "등록 중..." : "다시 등록하기"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="ml-2 mt-3 min-h-11"
                    onClick={() => setConfirmDiscard(true)}
                    disabled={isRetrying}
                  >
                    버리기
                  </Button>
                  <ConfirmModal
                    isOpen={confirmDiscard}
                    onClose={() => setConfirmDiscard(false)}
                    onConfirm={() => {
                      setConfirmDiscard(false);
                      dropPending(pending.sessionId);
                      setPendingMessage(null);
                    }}
                    title="이 기록을 버릴까요?"
                    message="버리면 랭킹에 다시 등록할 수 없어요."
                    confirmLabel="버리기"
                    cancelLabel="취소"
                    variant="danger"
                  />
                </>
              )}
              {pendingMessage && <p className="mt-2 text-sm text-slate-300">{pendingMessage}</p>}
              {pendingNeedsLogin && <ReloginButton className="mt-2" />}
            </section>
          )}

        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <TetrisRecordsCard ranking={rankingPreview} myScoreIds={myScoreIds} accessToken={accessToken} authReady={authStatus !== "loading"} />

          <div>
            <nav aria-label="테트리스 더 보기" className="flex flex-wrap items-center gap-x-5 px-1">
              <Link href="/games/tetris/skins" className={FOOTER_LINK}>
                스킨 도감
              </Link>
              {accessToken && (
                <Link href="/games/tetris/points" className={FOOTER_LINK}>
                  포인트 내역
                </Link>
              )}
            </nav>
            {about}
          </div>
        </div>
      </div>
      {/* 하단 내비(떠 있는 카드형)에 마지막 항목이 가리지 않게 — 디펜스 허브와 같은 여백 */}
      <div aria-hidden="true" className="h-8" />
    </TeamsPageLayout>
  );
}

const FOOTER_LINK = "flex min-h-11 items-center text-sm text-slate-300 hover:text-white";
