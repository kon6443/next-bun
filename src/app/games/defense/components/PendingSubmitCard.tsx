"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { formatScore } from "@/app/games/_shared/lib/format";
import { normalizePlayerName, validatePlayerName } from "@/app/games/_shared/lib/playerName";
import type { PendingSubmission } from "@/app/games/_shared/lib/storage";
import { classifySubmitError } from "@/app/games/_shared/lib/submitError";
import { submitGameScore } from "@/services/gameService";
import { defenseStorage } from "../lib/defenseGame";

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
  const [retrying, setRetrying] = useState(false);
  const pending = list[0] ?? null;

  useEffect(() => setList(defenseStorage.loadPendingSubmissions()), []);

  const drop = (sessionId: string) => {
    defenseStorage.removePendingSubmission(sessionId);
    setList(defenseStorage.loadPendingSubmissions());
    setNeedsNewName(false);
  };

  const retry = async () => {
    if (!pending || retrying) return;
    let playerName = pending.playerName;
    if (needsNewName) {
      const error = validatePlayerName(name);
      if (error) {
        setMessage(error);
        return;
      }
      playerName = normalizePlayerName(name);
    }
    setRetrying(true);
    setMessage(null);
    try {
      const { data } = await submitGameScore("defense", { sessionId: pending.sessionId, playerName, replay: pending.replay }, accessToken);
      defenseStorage.addMyScoreId(data.scoreId);
      defenseStorage.saveLastName(playerName);
      drop(pending.sessionId);
      setMessage(data.ranks ? `등록했어요! ${data.ranks.all}위` : "등록했어요! 순위는 랭킹에서 확인해 주세요.");
    } catch (err) {
      // 보관된 기록은 앞서 한 번 실패한 제출의 재시도다
      const { kind, message: text } = classifySubmitError(err, true);
      if (kind === "final") drop(pending.sessionId);
      else if (kind === "name") {
        setNeedsNewName(true);
        setName(playerName);
      }
      setMessage(text);
    } finally {
      setRetrying(false);
    }
  };

  if (!pending && !message) return null;
  return (
    <section className="rounded-2xl border border-amber-300/30 bg-slate-800/50 p-4" aria-label="등록하지 못한 기록" data-testid="defense-pending">
      {pending && (
        <>
          <p className="text-sm text-slate-200">
            등록하지 못한 기록이 있어요{list.length > 1 ? ` (${list.length}건)` : ""} — <strong>{needsNewName ? name : pending.playerName}</strong> · {formatScore(pending.score)}점
          </p>
          {needsNewName && (
            <div className="mt-3">
              <label htmlFor="defense-pending-name" className="mb-1 block text-xs text-slate-400">
                다른 이름으로 등록 (1~12자)
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
        </>
      )}
      <p role="status" className="mt-2 text-sm text-slate-300 empty:hidden">
        {message}
      </p>
    </section>
  );
}
