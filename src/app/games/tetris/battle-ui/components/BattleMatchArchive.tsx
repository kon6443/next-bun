"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, LoadingSpinnerSimple } from "@/app/teams/components";
import type { BattleMatchListItem } from "@/services/tetrisBattleService";
import { isRetryableLoadError, loadBattleMatchList } from "../lib/battleMatchLoader";
import { BattleMatchRow } from "./BattleMatchRow";

const PAGE_SIZE = 10;

type ArchiveState = {
  items: BattleMatchListItem[];
  /** 다음 페이지 커서 — null이면 끝 */
  nextCursor: string | null;
  /** 첫 페이지를 받았는지 */
  loaded: boolean;
  loading: boolean;
  /** retry = 실패한 그 요청(failedCursor)을 다시, restart = 커서가 무효(422 등)라 처음부터 */
  error: null | "retry" | "restart";
  /** 마지막으로 실패한 요청의 커서 — 첫 페이지면 null */
  failedCursor: string | null;
};

/**
 * 최근 대전 전체 목록 (DESIGN §19) — 최신순, "더 보기"로 다음 페이지
 * 전체화면 경로(/games/tetris/battle 하위)라 이 화면 안에서 스크롤한다
 */
export function BattleMatchArchive() {
  const [state, setState] = useState<ArchiveState>({ items: [], nextCursor: null, loaded: false, loading: true, error: null, failedCursor: null });
  const [now, setNow] = useState(() => Date.now());
  /** 같은 페이지를 겹쳐 부르지 않게 — 버튼 연타·StrictMode */
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (cursor: string | null) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await loadBattleMatchList(PAGE_SIZE, cursor);
      setNow(Date.now());
      setState((s) => {
        // 같은 경기가 두 페이지에 걸쳐 오면(그 사이 새 경기 저장) 한 번만
        const seen = new Set(s.items.map((i) => i.matchId));
        const items = cursor === null ? page.items : [...s.items, ...page.items.filter((i) => !seen.has(i.matchId))];
        return { items, nextCursor: page.nextCursor, loaded: true, loading: false, error: null, failedCursor: null };
      });
    } catch (err) {
      // 다시 보내도 같은 결과인 실패(잘못된 cursor 422 등)면 같은 커서로 되풀이하지 않고 처음부터
      const error = isRetryableLoadError(err) ? "retry" : "restart";
      setState((s) => ({ ...s, loading: false, error, failedCursor: cursor }));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadPage(null);
  }, [loadPage]);

  return (
    <div className="h-full overflow-y-auto overscroll-contain" style={{ touchAction: "auto" }}>
      <div className="mx-auto w-full max-w-xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <header className="flex items-center gap-3">
          <Link
            href="/games/tetris"
            className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
          >
            ← 테트리스
          </Link>
          <h1 className="text-lg font-bold text-white">최근 대전</h1>
        </header>
        <p className="mt-2 text-xs text-slate-500">저장된 경기만 보여요. 누르면 경기를 다시 볼 수 있어요.</p>

        <div className="mt-4 rounded-2xl border border-slate-700/50 bg-slate-800/50 p-2">
          {!state.loaded && state.loading ? (
            <LoadingSpinnerSimple message="최근 대전을 불러오는 중..." />
          ) : state.loaded && state.items.length === 0 ? (
            <EmptyState message="아직 저장된 대전이 없어요." description="친구와 첫 대전을 해 보세요!" variant="minimal" />
          ) : (
            <ul>
              {state.items.map((item) => (
                <BattleMatchRow key={item.matchId} item={item} now={now} />
              ))}
            </ul>
          )}
        </div>

        {state.error && (
          <p role="alert" className="mt-3 text-center text-sm text-red-300">
            최근 대전을 불러오지 못했어요.
          </p>
        )}
        {(state.error || (state.loaded && state.nextCursor !== null)) && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            className="mt-3 min-h-11"
            disabled={state.loading}
            aria-busy={state.loading}
            onClick={() =>
              void loadPage(state.error === "restart" ? null : state.error === "retry" ? state.failedCursor : state.nextCursor)
            }
          >
            {state.loading ? "불러오는 중..." : state.error === "restart" ? "처음부터 다시 불러오기" : state.error ? "다시 시도" : "더 보기"}
          </Button>
        )}
      </div>
    </div>
  );
}
