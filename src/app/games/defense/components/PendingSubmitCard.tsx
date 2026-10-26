"use client";

import { ConfirmModal } from "@/app/components/ConfirmModal";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { normalizePlayerName, validatePlayerName } from "@/app/games/_shared/lib/playerName";
import type { PendingSubmission } from "@/app/games/_shared/lib/storage";
import { classifySubmitError } from "@/app/games/_shared/lib/submitError";
import { ReloginButton } from "@/app/games/_shared/components/ReloginButton";
import { submitGameScore } from "@/services/gameService";
import { defenseStorage, formatDefenseScore } from "../lib/defenseGame";

/**
 * 등록하지 못한 기록 다시 등록 (defense DESIGN §F7·§B4) — 게임 오버 패널에서 보관한 제출(네트워크·429·503 BUSY)을 허브에서 다시 낸다
 * 테트리스 허브와 같은 규칙: 이름 문제면 이름만 바꿔(세션 유지), 확정 실패(세션 만료·재현 실패)면 보관을 지운다
 */
export function PendingSubmitCard() {
  const { data: authSession, status: authStatus } = useSession();
  const accessToken = authSession?.user?.accessToken ?? undefined;
  const [list, setList] = useState<PendingSubmission<"defense">[]>([]);
  const [needsNewName, setNeedsNewName] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  /** 재등록이 로그인 만료(401)로 거절됐다 — 다시 로그인한 뒤 내 기록으로 등록한다 */
  const [needsLogin, setNeedsLogin] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pending = list[0] ?? null;
  // 게임 오버 순간 이름 없이 보관한 기록(기본 이름이 없었다)이면 이름부터 묻는다 (games-polish FE-05)
  const askName = needsNewName || pending?.playerName === "";
  /** 보관 기록 버리기 확인 — 게임 오버 순간 선보관(FE-05)이라 등록할 마음이 없는 기록도 남는다 (games-polish P5) */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /** 같은 렌더 안 연타도 막게 ref로 — 세션은 1회용이라 두 번째 제출은 실패하고 성공 문구를 덮는다 */
  const retryingRef = useRef(false);

  useEffect(() => setList(defenseStorage.loadPendingSubmissions()), []);

  const drop = (sessionId: string) => {
    defenseStorage.removePendingSubmission(sessionId);
    setList(defenseStorage.loadPendingSubmissions());
    setNeedsNewName(false);
  };

  const retry = async () => {
    if (!pending || retryingRef.current) return;
    let playerName = pending.playerName;
    if (askName) {
      const error = validatePlayerName(name);
      if (error) {
        setMessage(error);
        return;
      }
      playerName = normalizePlayerName(name);
    }
    retryingRef.current = true;
    setRetrying(true);
    setMessage(null);
    setNeedsLogin(false);
    try {
      const { data } = await submitGameScore("defense", { sessionId: pending.sessionId, playerName, replay: pending.replay }, accessToken);
      defenseStorage.addMyScoreId(data.scoreId);
      defenseStorage.saveLastName(data.playerName ?? playerName);
      drop(pending.sessionId);
      setMessage(data.ranks ? `등록했어요! ${data.ranks.all}위` : "등록했어요! 순위는 랭킹에서 확인해 주세요.");
    } catch (err) {
      // 보관된 기록은 앞서 한 번 실패한 제출의 재시도다
      const { kind, message: text } = classifySubmitError(err, true);
      setNeedsLogin(kind === "auth");
      if (kind === "final") drop(pending.sessionId);
      else if (kind === "name") {
        setNeedsNewName(true);
        setName(playerName);
      }
      setMessage(text);
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  };

  if (!pending && !message) return null;
  return (
    <section className="rounded-2xl border border-amber-300/30 bg-slate-800/50 p-4" aria-label="등록하지 못한 기록" data-testid="defense-pending">
      {pending && (
        <>
          <p className="text-sm text-slate-200">
            등록하지 못한 기록이 있어요{list.length > 1 ? ` (${list.length}건)` : ""} — <strong>{askName ? name : pending.playerName}</strong> · {formatDefenseScore(pending.score)}
          </p>
          {askName && (
            <div className="mt-3">
              <label htmlFor="defense-pending-name" className="mb-1 block text-xs text-slate-400">
                {pending.playerName === "" ? "등록할 이름 (1~12자)" : "다른 이름으로 등록 (1~12자)"}
              </label>
              <input
                id="defense-pending-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-base text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          )}
          <button
            type="button"
            data-testid="defense-pending-retry"
            onClick={retry}
            // 로그인 상태를 확인하는 동안에는 막는다 — 비로그인으로 잘못 등록되지 않게
            disabled={retrying || authStatus === "loading"}
            aria-busy={retrying}
            className="mt-3 min-h-11 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {retrying ? "등록 중..." : "다시 등록하기"}
          </button>
          <button
            type="button"
            data-testid="defense-pending-discard"
            onClick={() => setConfirmDiscard(true)}
            disabled={retrying}
            className="ml-2 mt-3 min-h-11 rounded-full border border-white/20 px-5 text-sm font-semibold text-slate-200 disabled:opacity-50"
          >
            버리기
          </button>
          <ConfirmModal
            isOpen={confirmDiscard}
            onClose={() => setConfirmDiscard(false)}
            onConfirm={() => {
              setConfirmDiscard(false);
              drop(pending.sessionId);
              setMessage(null);
            }}
            title="이 기록을 버릴까요?"
            message="버리면 랭킹에 다시 등록할 수 없어요."
            confirmLabel="버리기"
            cancelLabel="취소"
            variant="danger"
          />
        </>
      )}
      <p role="status" className="mt-2 text-sm text-slate-300 empty:hidden">
        {message}
      </p>
      {needsLogin && <ReloginButton className="mt-2" />}
    </section>
  );
}
