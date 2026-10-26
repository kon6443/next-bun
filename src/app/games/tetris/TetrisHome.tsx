"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { TeamsPageLayout, ButtonLink, Button, SectionLabel, EmptyState, LoadingSpinnerSimple } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { getGameRankings, submitGameScore } from "@/services/gameService";
import type { RankingItem } from "@/types/game";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { ARR_MAX, ARR_MIN, DAS_MAX, DAS_MIN } from "./engine";
import { RankingTable } from "@/app/games/_shared/components/RankingTable";
import { TETRIS_GAME } from "./lib/game";
import { BattleEntry } from "./battle-ui/components/BattleEntry";
import { RecentBattles } from "./battle-ui/components/RecentBattles";
import { DailyCard } from "./components/DailyCard";
import { tetrisRankLabel } from "./lib/replayCard";
import { PopularReplaysPreview } from "@/app/games/_shared/components/PopularReplaysPreview";
import { SoundButton } from "@/app/games/_shared/components/SoundButton";
import { SoundSettingsEntry } from "@/app/games/_shared/components/SoundSettingsEntry";
import { SkinSettingsEntry } from "./components/SkinSettingsModal";
import { CONTROL_GUIDE } from "./lib/controls";
import { formatScore, framesToMs } from "@/app/games/_shared/lib/format";
import { normalizePlayerName, validatePlayerName } from "@/app/games/_shared/lib/playerName";
import { classifySubmitError } from "@/app/games/_shared/lib/submitError";
import {
  type PendingSubmission,
  type TetrisSettings,
  DEFAULT_SETTINGS,
  addMyScoreId,
  loadBestScore,
  loadMyScoreIds,
  loadPendingSubmissions,
  loadSettings,
  removePendingSubmission,
  saveLastName,
  saveSettings,
} from "./lib/storage";

const PREVIEW_LIMIT = 5;

/** about: 서버가 그린 소개·특징(검색엔진이 읽을 글) — 화면 맨 아래 */
export default function TetrisHome({ about }: { about?: ReactNode }) {
  const { data: session, status: authStatus } = useSession();
  const accessToken = session?.user?.accessToken ?? undefined;
  const [needsNewName, setNeedsNewName] = useState(false);
  const [pendingName, setPendingName] = useState("");

  const [best, setBest] = useState(0);
  const [settings, setSettings] = useState<TetrisSettings>(DEFAULT_SETTINGS);
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
  const [isRetrying, setIsRetrying] = useState(false);

  // 브라우저 저장소는 마운트 후에 읽는다 (서버 렌더와 어긋나지 않게)
  useEffect(() => {
    setBest(loadBestScore());
    setSettings(loadSettings());
    setMyScoreIds(new Set(loadMyScoreIds()));
    setPendingList(loadPendingSubmissions());
  }, []);

  /** 처리한 기록을 빼고 다음 기록으로 */
  const dropPending = (sessionId: string) => {
    removePendingSubmission(sessionId);
    setPendingList(loadPendingSubmissions());
    setNeedsNewName(false);
  };

  useEffect(() => {
    getGameRankings("tetris", "daily", PREVIEW_LIMIT)
      .then(({ data }) => setPreview(data.items))
      .catch((err) => setPreviewError(extractErrorMessage(err, "랭킹을 불러오지 못했습니다.")));
  }, []);

  // 저장은 핸들러에서 한 번 — 상태 업데이터는 순수해야 한다(StrictMode가 두 번 부른다, games-polish FE-52)
  const updateSettings = (patch: Partial<TetrisSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

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
    try {
      const { data } = await submitGameScore(
        "tetris",
        { sessionId: pending.sessionId, playerName, replay: pending.replay },
        accessToken,
      );
      addMyScoreId(data.scoreId);
      saveLastName(data.playerName ?? playerName);
      dropPending(pending.sessionId);
      setMyScoreIds(new Set(loadMyScoreIds()));
      // 데일리·도전장 판이면 그 보드 순위로 읽히게(결과 화면의 "오늘의 순위"·"도전장 순위"와 같은 값)
      setPendingMessage(data.ranks ? `등록했어요! ${tetrisRankLabel(pending.board, data.ranks.all)}` : "등록했어요! 순위는 랭킹에서 확인해 주세요.");
    } catch (err) {
      // 보관된 기록은 앞서 한 번 실패한 제출의 재시도다
      const { kind, message } = classifySubmitError(err, true);
      if (kind === "final") {
        dropPending(pending.sessionId);
      } else if (kind === "name") {
        // 세션은 그대로 — 이름만 바꿔 다시 낸다
        setNeedsNewName(true);
        setPendingName(playerName);
      }
      setPendingMessage(message);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <TeamsPageLayout>
      {/* 헤더 */}
      <section className={`${cardStyles.section} p-5`}>
        <div className="flex items-center justify-between">
          <SectionLabel spacing="wide">Tetris</SectionLabel>
          <div className="flex items-center gap-2">
            {/* 소리 설정은 첫 화면에서 — 설정 섹션까지 내려가지 않아도 되게 (P8) */}
            <SoundButton />
            <ButtonLink href="/games" variant="secondary" size="md">
              ← 게임 목록
            </ButtonLink>
          </div>
        </div>
        <h1 className="mt-4 text-3xl font-bold text-white [text-shadow:0_0_14px_rgba(56,189,248,0.6)]">테트리스</h1>
        <p className="mt-2 text-sm text-slate-400">
          줄을 지우고 점수를 쌓으세요. 끝나면 이름을 적어 랭킹에 올릴 수 있어요. (로그인 없이도 가능)
        </p>
        <p className="mt-4 text-sm text-slate-300">
          내 최고 점수 <strong className="ml-1 text-lg text-amber-300">{best > 0 ? formatScore(best) : "-"}</strong>
        </p>
        <ButtonLink href="/games/tetris/play" size="md" fullWidth className="mt-5 min-h-11">
          게임 시작
        </ButtonLink>
      </section>

      {/* 오늘의 테트리스 — 데일리 보드가 있을 때만 (games-growth B1) */}
      <DailyCard />

      {/* 대전 입구는 여기 한 곳 — 첫 화면에 보이게 헤더 바로 아래 (games-polish P8) */}
      <div className={`${cardStyles.section} p-4`}>
        <BattleEntry />
      </div>

      {(pending || pendingMessage) && (
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
        </section>
      )}

      {/* 오늘의 랭킹 미리보기 */}
      <section className={`${cardStyles.section} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">오늘의 TOP {PREVIEW_LIMIT}</h2>
          <ButtonLink href="/games/tetris/rankings" variant="secondary" size="md">
            전체 랭킹
          </ButtonLink>
        </div>
        {previewError ? (
          <p className="text-sm text-red-300">{previewError}</p>
        ) : preview === null ? (
          <LoadingSpinnerSimple message="랭킹을 불러오는 중..." />
        ) : preview.length === 0 ? (
          <EmptyState message="오늘은 아직 기록이 없어요." description="첫 번째 주인공이 되어 보세요!" variant="minimal" />
        ) : (
          <RankingTable game={TETRIS_GAME} items={preview} myScoreIds={myScoreIds} compact />
        )}
      </section>

      <PopularReplaysPreview game={TETRIS_GAME} myScoreIds={myScoreIds} />

      <RecentBattles />

      {/* 조작·설정 */}
      <section className={`${cardStyles.section} p-4`}>
        <h2 className="text-base font-semibold text-white">조작</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {CONTROL_GUIDE.map(({ keys, label }) => (
            <div key={keys} className="contents">
              <dt className="font-mono font-semibold text-sky-300">{keys}</dt>
              <dd className="text-slate-400">{label}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">모바일은 화면 아래 버튼으로 조작해요. 여러 버튼을 동시에 누를 수 있어요.</p>

        <h2 className="mt-6 text-base font-semibold text-white">설정</h2>
        <div className="mt-3 space-y-4">
          <RangeSetting
            id="tetris-das"
            label="이동 반복 시작 (DAS)"
            hint="누르고 있을 때 연속 이동이 시작되기까지"
            min={DAS_MIN}
            max={DAS_MAX}
            value={settings.das}
            display={`${framesToMs(settings.das)}ms`}
            onChange={(das) => updateSettings({ das })}
          />
          <RangeSetting
            id="tetris-arr"
            label="이동 반복 간격 (ARR)"
            hint="0이면 벽까지 한 번에"
            min={ARR_MIN}
            max={ARR_MAX}
            value={settings.arr}
            display={settings.arr === 0 ? "즉시" : `${framesToMs(settings.arr)}ms`}
            onChange={(arr) => updateSettings({ arr })}
          />
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-slate-300">
            <span>진동 (지원하는 기기)</span>
            <input
              type="checkbox"
              checked={settings.vibration}
              onChange={(e) => updateSettings({ vibration: e.target.checked })}
              className="h-5 w-5 accent-sky-400"
            />
          </label>
          <SoundSettingsEntry />
          <SkinSettingsEntry />
        </div>
      </section>

      {about}
      {/* 하단 내비(떠 있는 카드형)에 마지막 항목이 가리지 않게 — 디펜스 허브와 같은 여백 */}
      <div aria-hidden="true" className="h-8" />
    </TeamsPageLayout>
  );
}

type RangeSettingProps = {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
};

function RangeSetting({ id, label, hint, min, max, value, display, onChange }: RangeSettingProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="text-slate-300">
          {label}
        </label>
        <span className="font-mono text-sky-300">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={`${id}-hint`}
        className="mt-1 h-11 w-full accent-sky-400"
      />
      <p id={`${id}-hint`} className="text-xs text-slate-500">
        {hint}
      </p>
    </div>
  );
}
