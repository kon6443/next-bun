"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, LoadingSpinnerSimple } from "@/app/teams/components";
import { type FortressMatchListItem, getFortressMatchList } from "@/services/fortressService";
import { ApiError } from "@/types/api";
import { FortressMatchRow } from "./FortressMatchRow";

const PAGE_SIZE = 10;

type ArchiveState = {
  items: FortressMatchListItem[];
  /** 다음 페이지 커서 — null이면 끝 */
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  /** retry = 실패한 그 요청(failedCursor)을 다시, restart = 커서가 무효(422 등)라 처음부터 */
  error: null | "retry" | "restart";
  failedCursor: string | null;
};

/** 다시 보내면 나아질 수 있는 실패 — 네트워크·429·5xx */
export function isRetryableListError(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status === 429 || err.status >= 500;
}

/**
 * 최근 포트리스 경기 전체 목록 (F6) — 최신순, "더 보기"로 다음 페이지 (테트리스 BattleMatchArchive와 같은 흐름)
 * 전체화면 경로(/games/fortress/battle 하위)라 이 화면 안에서 스크롤한다
 */
export function FortressMatchArchive() {
  const [state, setState] = useState<ArchiveState>({ items: [], nextCursor: null, loaded: false, loading: true, error: null, failedCursor: null });
  const [now, setNow] = useState(() => Date.now());
  /** 같은 페이지를 겹쳐 부르지 않게 — 버튼 연타·StrictMode */
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (cursor: string | null) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = (await getFortressMatchList({ limit: PAGE_SIZE, cursor })).data;
      setNow(Date.now());
      setState((s) => {
        // 같은 경기가 두 페이지에 걸쳐 오면(그 사이 새 경기 저장) 한 번만
        const seen = new Set(s.items.map((i) => i.matchId));
        const items = cursor === null ? page.items : [...s.items, ...page.items.filter((i) => !seen.has(i.matchId))];
        return { items, nextCursor: page.nextCursor, loaded: true, loading: false, error: null, failedCursor: null };
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: isRetryableListError(err) ? "retry" : "restart", failedCursor: cursor }));
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
          <Link href="/games/fortress" className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200">
            ← 포트리스
          </Link>
          <h1 className="text-lg font-bold text-white">최근 경기</h1>
        </header>
        <p className="mt-2 text-xs text-slate-500">저장된 온라인 경기만 보여요. 누르면 경기를 다시 볼 수 있어요.</p>

        <div className="mt-4 rounded-2xl border border-slate-700/50 bg-slate-800/50 p-2" data-testid="fortress-match-archive">
          {!state.loaded && state.loading ? (
            <LoadingSpinnerSimple message="최근 경기를 불러오는 중..." />
          ) : state.loaded && state.items.length === 0 ? (
            <EmptyState message="아직 저장된 경기가 없어요." description="친구와 첫 온라인 대전을 해 보세요!" variant="minimal" />
          ) : (
            <ul>
              {state.items.map((item) => (
                <FortressMatchRow key={item.matchId} item={item} now={now} />
              ))}
            </ul>
          )}
        </div>

        {state.error && (
          <p role="alert" className="mt-3 text-center text-sm text-red-300">
            최근 경기를 불러오지 못했어요.
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
            onClick={() => void loadPage(state.error === "restart" ? null : state.error === "retry" ? state.failedCursor : state.nextCursor)}
          >
            {state.loading ? "불러오는 중..." : state.error === "restart" ? "처음부터 다시 불러오기" : state.error ? "다시 시도" : "더 보기"}
          </Button>
        )}
      </div>
    </div>
  );
}
