"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ReloginButton } from "@/app/games/_shared/components/ReloginButton";
import { isAuthExpired } from "@/app/games/_shared/lib/submitError";
import { type FortressMatchPoints, getFortressMatchPoints } from "@/services/fortressService";
import { type PointsEligibility, formatPoints, maxPointsIfLoggedIn } from "../../lib/points";

/**
 * 사용자·경기별 조회 — 결과 화면을 다시 열어도(다시 보기 → 결과)·StrictMode 두 번 실행에도 1회만 묻는다
 * 진행 중인 요청을 기억해 같이 기다리고, 실패하면 지워 다음에 다시 묻는다
 * 키에 사용자를 넣는다 — 다른 탭에서 다른 계정으로 로그인해 세션이 바뀌면 앞 사용자의 포인트를 보이지 않게
 */
const pointsCache = new Map<string, Promise<FortressMatchPoints>>();
const pointsSettled = new Map<string, FortressMatchPoints>();

const pointsKey = (userKey: string, matchId: string) => `${userKey}:${matchId}`;

function loadPoints(key: string, matchId: string, token: string): Promise<FortressMatchPoints> {
  let pending = pointsCache.get(key);
  if (!pending) {
    pending = getFortressMatchPoints(matchId, token).then(
      (res) => {
        pointsSettled.set(key, res.data);
        return res.data;
      },
      (err: unknown) => {
        pointsCache.delete(key);
        throw err;
      },
    );
    pointsCache.set(key, pending);
  }
  return pending;
}

type PointsState = { status: "loading" } | { status: "ready"; points: FortressMatchPoints } | { status: "expired" } | { status: "error" };

/** 로그인 사용자 결과 문구 — 적립·참가 여부·사유(memo) */
export function earnedText(points: FortressMatchPoints): { amount: string | null; detail: string } {
  if (!points.participant) return { amount: null, detail: "로그인하기 전에 들어온 경기라 포인트가 없어요." };
  if (points.earned > 0) return { amount: `+${formatPoints(points.earned)}`, detail: points.memo ?? "" };
  return { amount: null, detail: points.memo ?? "이번 경기는 적립 조건(내 차례 발사 3번 · 6턴 이상)을 채우지 못했어요." };
}

/** 게스트 — 적립 조건 미달이면 "로그인했다면 +N P" 대신 그 사유(로그인했어도 0 P였다) */
export const GUEST_INELIGIBLE_TEXT: Record<"turns" | "shots" | "resign", string> = {
  turns: "6턴 전에 끝난 경기라 로그인했어도 포인트가 없었어요.",
  shots: "내 차례에 3번 이상 쏘지 않아 로그인했어도 포인트가 없었어요.",
  resign: "나가기(기권)한 경기라 로그인했어도 포인트가 없었어요.",
};

const ELIGIBLE: PointsEligibility = { eligible: true };

/**
 * 결과 화면 포인트 (F7, DESIGN §13) — 로그인: GET matches/:id/points 1회("+N P"와 내역) · 게스트: "로그인했다면 최대 +N P"
 * 저장 전이면 서버가 그 자리에서 저장하지만, 저장 대기가 끝난 뒤(settled — 저장됨 또는 한도 초과) 부른다
 * 한도를 넘겨 공개되지 않아도(숨김·저장 지연) 1회는 묻는다 — 포인트 칸이 로딩에 머물지 않게
 * 게스트 수치는 프론트 상수(참가·승리·KO 최대 3). 유효 경기 조건은 이 경기 기록으로 판정하고(미달이면 사유), 감쇠·일일 상한은 모르므로 "최대"로 말한다
 */
export function FortressResultPoints({
  matchId,
  settled,
  won,
  kos,
  judgeEligibility,
}: {
  matchId: string;
  settled: boolean;
  won: boolean;
  kos: number;
  /** 게스트 문구용 적립 조건 판정(이 경기 행동 기록을 엔진으로 다시 적용) — 게스트일 때만 부른다. 로그인 사용자는 서버 값을 쓴다 */
  judgeEligibility?: () => PointsEligibility;
}) {
  const { data: session, status: authStatus } = useSession();
  const accessToken = session?.user?.accessToken;
  const guest = !accessToken;
  const eligibility = useMemo(() => (guest && judgeEligibility ? judgeEligibility() : ELIGIBLE), [guest, judgeEligibility]);
  // userId가 없는 세션(이전 토큰)은 사용자를 가를 수 없어 한 칸으로 둔다
  const key = pointsKey(String(session?.user?.userId ?? "-"), matchId);
  // 상태는 어느 키의 것인지와 같이 둔다 — 계정이 바뀐 첫 렌더에 앞 사용자의 값을 그리지 않게(효과는 그린 뒤에 돈다)
  const [held, setHeld] = useState<{ key: string; state: PointsState }>(() => {
    const cached = pointsSettled.get(key);
    return { key, state: cached ? { status: "ready", points: cached } : { status: "loading" } };
  });
  const cachedNow = pointsSettled.get(key);
  const state: PointsState = held.key === key ? held.state : cachedNow ? { status: "ready", points: cachedNow } : { status: "loading" };
  const hasToken = Boolean(accessToken);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  // 토큰 문자열이 갱신돼도 다시 묻지 않는다(로그인 여부만 본다)
  useEffect(() => {
    const token = tokenRef.current;
    if (!token || !settled) return;
    let cancelled = false;
    // 이미 받은 값이면 그대로(렌더 뒤 이전 화면의 응답이 채웠을 수도 있다), 아니면 진행 중인 요청을 같이 기다린다
    const done = pointsSettled.get(key);
    if (done) {
      setHeld({ key, state: { status: "ready", points: done } });
      return;
    }
    setHeld({ key, state: { status: "loading" } });
    loadPoints(key, matchId, token).then(
      (points) => !cancelled && setHeld({ key, state: { status: "ready", points } }),
      (err: unknown) => !cancelled && setHeld({ key, state: { status: isAuthExpired(err) ? "expired" : "error" } }),
    );
    return () => {
      cancelled = true;
    };
  }, [hasToken, settled, key, matchId]);

  if (authStatus === "loading") return null;

  if (!accessToken) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-3 text-center" data-testid="fortress-points-guest">
        {eligibility.eligible ? (
          <p className="text-sm text-amber-50">
            로그인했다면 최대 <strong className="tabular-nums text-amber-200">+{formatPoints(maxPointsIfLoggedIn({ won, kos }))}</strong>를 받을 수 있었어요.
          </p>
        ) : (
          <p className="text-sm text-amber-50">{GUEST_INELIGIBLE_TEXT[eligibility.reason]}</p>
        )}
        <p className="text-xs text-slate-400">포인트로 탱크 스킨을 강화할 수 있어요. 로그인하면 카카오로 이동해 이 방에서 나가고, 다음 경기부터 적용돼요.</p>
        <ReloginButton label="카카오로 로그인" />
      </section>
    );
  }

  const body =
    state.status === "loading" ? (
      <p className="text-sm text-slate-300">포인트를 정리하는 중…</p>
    ) : state.status === "expired" ? (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-slate-300">로그인이 만료돼 포인트를 확인하지 못했어요. 적립은 그대로 돼요.</p>
        <ReloginButton />
      </div>
    ) : state.status === "error" ? (
      <p className="text-sm text-slate-400">포인트를 불러오지 못했어요. 적립은 그대로 돼요.</p>
    ) : (
      (() => {
        const { amount, detail } = earnedText(state.points);
        return (
          <>
            {amount ? <p className="text-2xl font-bold tabular-nums text-amber-200">{amount}</p> : null}
            {detail ? <p className="text-xs text-slate-300">{detail}</p> : null}
          </>
        );
      })()
    );
  return (
    <section className="flex flex-col items-center gap-1 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-3 text-center" aria-live="polite" data-testid="fortress-points">
      {body}
    </section>
  );
}

/** 테스트 전용 — 경기별 조회 기억을 비운다 */
export function resetPointsCacheForTest() {
  pointsCache.clear();
  pointsSettled.clear();
}
