"use client";

import { useEffect, useId, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { TeamsPageLayout, ButtonLink, SectionLabel, LoadingSpinnerSimple } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { useKakaoLogin } from "@/app/auth/useKakaoLogin";
import { isAuthExpired } from "@/app/games/_shared/lib/submitError";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { getTetrisSkinCatalog } from "@/services/gameService";
import { ApiError } from "@/types/api";
import type { TetrisSkinCatalog, TetrisSkinCatalogItem, TetrisSkinSlot } from "@/types/game";
import { SkinPreview } from "../components/SkinPreview";
import { useMySkins } from "../hooks/useMySkins";
import { KNOWN_SKIN_IDS, SKIN_ITEM_LABELS, SKIN_SLOTS, SKIN_SLOT_LABELS } from "../lib/skins";

/** 획득 방법 — 서버 unlock 값. 모르는 값(새 획득 방식이 먼저 나온 경우)은 안전한 폴백 */
const UNLOCK_LABELS: Record<string, string> = {
  default: "기본 제공",
  free: "누구나 무료",
};
export function unlockLabel(unlock: string): string {
  return UNLOCK_LABELS[unlock] ?? "곧 공개";
}

type Filter = "all" | "owned" | "missing";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "owned", label: "보유" },
  { key: "missing", label: "미보유" },
];

type Load = { status: "loading" } | { status: "ready"; catalog: TetrisSkinCatalog } | { status: "error"; message: string };

/**
 * 테트리스 스킨 도감 (D-005) — 모든 스킨 + 얻는 방법 + 내 보유·장착
 * 카탈로그(목록·획득 방식·보유)는 서버 GET /games/tetris/skins. 장착은 장착 모달과 같은 저장소(useMySkins — 낙관적 반영·실패 롤백)
 * 로그인이 만료됐으면(401) 게스트 도감으로 다시 받고 다시 로그인하라고 알린다(조회라 익명 조회는 괜찮다 — 401 정책과 같은 안내)
 * 모르는 id(서버가 먼저 아이템을 늘림)는 기본 미리보기 + id로 보인다
 */
export default function SkinsCatalogView() {
  const { data: session, status: authStatus } = useSession();
  const accessToken = session?.user?.accessToken ?? undefined;
  const mine = useMySkins();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [expired, setExpired] = useState(false);
  const [slot, setSlot] = useState<TetrisSkinSlot>("block");
  const [filter, setFilter] = useState<Filter>("all");
  const [attempt, setAttempt] = useState(0);
  const { start: startLogin, isStarting } = useKakaoLogin();
  const tabsId = useId();
  const tabRefs = useRef<Partial<Record<TetrisSkinSlot, HTMLButtonElement | null>>>({});

  useEffect(() => {
    // 로그인 상태를 알기 전에는 부르지 않는다 — 게스트 도감을 받았다가 다시 받지 않게
    if (authStatus === "loading") return;
    let cancelled = false;
    setLoad({ status: "loading" });
    setExpired(false);
    getTetrisSkinCatalog(accessToken)
      .catch((err) => {
        if (!accessToken || !isAuthExpired(err)) throw err;
        if (!cancelled) setExpired(true);
        return getTetrisSkinCatalog();
      })
      .then(({ data }) => !cancelled && setLoad({ status: "ready", catalog: data }))
      .catch((err) => !cancelled && setLoad({ status: "error", message: extractErrorMessage(err, "스킨 목록을 불러오지 못했습니다.") }));
    return () => {
      cancelled = true;
    };
  }, [authStatus, accessToken, attempt]);

  const catalog = load.status === "ready" ? load.catalog : null;
  const signedIn = Boolean(catalog?.signedIn) && !expired;
  const itemsOf = (s: TetrisSkinSlot): TetrisSkinCatalogItem[] => catalog?.slots.find((x) => x.slot === s)?.items ?? [];
  /** 장착은 저장소가 기준(장착하면 바로 바뀐다) — 저장소를 아직 못 불러왔으면 도감 응답 */
  const isEquipped = (s: TetrisSkinSlot, item: TetrisSkinCatalogItem) =>
    signedIn ? (mine.status === "ready" ? mine.equipped[s] === item.id : item.equipped) : false;
  const visible = itemsOf(slot).filter((item) => (filter === "owned" ? item.owned : filter === "missing" ? !item.owned : true));

  const equip = async (item: TetrisSkinCatalogItem) => {
    if (!signedIn || !item.owned || isEquipped(slot, item)) return;
    try {
      await mine.equip(slot, item.id);
      toast.success(`${SKIN_SLOT_LABELS[slot]} 스킨: ${SKIN_ITEM_LABELS[item.id] ?? item.id} 장착`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "스킨을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  /** 탭 키보드 이동 — 왼쪽·오른쪽·Home·End (WAI-ARIA tabs) */
  const onTabKey = (e: React.KeyboardEvent) => {
    const index = SKIN_SLOTS.indexOf(slot);
    const next =
      e.key === "ArrowRight" ? SKIN_SLOTS[(index + 1) % SKIN_SLOTS.length]
      : e.key === "ArrowLeft" ? SKIN_SLOTS[(index - 1 + SKIN_SLOTS.length) % SKIN_SLOTS.length]
      : e.key === "Home" ? SKIN_SLOTS[0]
      : e.key === "End" ? SKIN_SLOTS[SKIN_SLOTS.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    setSlot(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-5`}>
        <div className="flex items-center justify-between">
          <SectionLabel spacing="wide">Tetris</SectionLabel>
          <ButtonLink href="/games/tetris" variant="secondary" size="md">
            테트리스로
          </ButtonLink>
        </div>
        <h1 className="mt-3 text-2xl font-bold text-white">스킨 도감</h1>
        <p className="mt-2 text-sm text-slate-400">모든 스킨과 얻는 방법이에요. 블록·연출·판 스킨은 내 판을 보는 모두에게, 배경은 나에게만 보여요.</p>

        {(expired || (authStatus === "unauthenticated" && load.status !== "loading")) && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-800/50 p-3 text-sm text-slate-300">
            <p>{expired ? "로그인이 만료됐어요. 다시 로그인하면 내 스킨이 보여요." : "로그인하면 보유한 스킨을 보고 바로 장착할 수 있어요."}</p>
            <button
              type="button"
              onClick={() => startLogin({ callbackUrl: "/games/tetris/skins" })}
              disabled={isStarting}
              aria-busy={isStarting}
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full bg-[#FEE500] px-4 text-sm font-semibold text-[#181600] disabled:opacity-70"
            >
              {isStarting ? "카카오로 이동 중..." : "카카오로 로그인"}
            </button>
          </div>
        )}

        {catalog && signedIn && (
          <dl className="mt-4 grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-center text-sm" aria-label="슬롯별 보유">
            {SKIN_SLOTS.map((s) => {
              const items = itemsOf(s);
              return (
                <div key={s}>
                  <dt className="text-xs text-slate-500">{SKIN_SLOT_LABELS[s]}</dt>
                  <dd className="mt-0.5 font-semibold text-slate-100">
                    {items.filter((i) => i.owned).length}/{items.length}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </section>

      <section className={`${cardStyles.section} p-5`}>
        <div role="tablist" aria-label="스킨 슬롯" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-800/60 p-1" onKeyDown={onTabKey}>
          {SKIN_SLOTS.map((s) => (
            <button
              key={s}
              ref={(el) => {
                tabRefs.current[s] = el;
              }}
              type="button"
              role="tab"
              id={`${tabsId}-${s}`}
              aria-selected={slot === s}
              aria-controls={`${tabsId}-panel`}
              tabIndex={slot === s ? 0 : -1}
              onClick={() => setSlot(s)}
              className={`min-h-11 rounded-lg text-sm font-semibold ${slot === s ? "bg-sky-500/30 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {SKIN_SLOT_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2" role="group" aria-label="보기">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-11 rounded-full border px-4 text-sm ${filter === f.key ? "border-sky-400 bg-sky-500/10 text-white" : "border-slate-700/50 text-slate-400"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${slot}`} className="mt-4">
          {load.status === "loading" ? (
            <LoadingSpinnerSimple />
          ) : load.status === "error" ? (
            <div role="alert" className="text-sm text-red-300">
              <p>{load.message}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 min-h-11 rounded-full border border-white/20 px-4 text-slate-200">
                다시 시도
              </button>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-400">{filter === "owned" && !signedIn ? "로그인하면 보유한 스킨이 보여요." : "해당하는 스킨이 없어요."}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-4">
              {visible.map((item) => {
                const equipped = isEquipped(slot, item);
                const known = KNOWN_SKIN_IDS[slot].includes(item.id);
                const name = SKIN_ITEM_LABELS[item.id] ?? item.id;
                return (
                  <li
                    key={item.id}
                    data-testid={`catalog-${slot}-${item.id}`}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3 ${equipped ? "border-sky-400 bg-sky-500/10" : "border-slate-700/50 bg-slate-800/50"}`}
                  >
                    <span className={signedIn && !item.owned ? "opacity-50" : ""}>
                      <SkinPreview slot={slot} id={known ? item.id : "default"} />
                    </span>
                    <span className="text-sm font-semibold text-white">{name}</span>
                    {!known && <span className="text-[11px] text-slate-500">미리보기 준비 중 · {item.id}</span>}
                    <span className="text-xs text-slate-400">{unlockLabel(item.unlock)}</span>
                    {signedIn && (
                      <span className="flex flex-wrap justify-center gap-1 text-[11px]">
                        {item.owned ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">✓ 보유</span>
                        ) : (
                          <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-slate-300">🔒 미보유</span>
                        )}
                        {equipped && <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-sky-200">● 장착 중</span>}
                      </span>
                    )}
                    {signedIn && item.owned && !equipped && (
                      <button
                        type="button"
                        onClick={() => equip(item)}
                        disabled={mine.status === "loading"}
                        className="min-h-11 w-full rounded-full border border-sky-400/40 text-sm text-sky-100 hover:bg-sky-500/10 disabled:opacity-50"
                      >
                        장착
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </TeamsPageLayout>
  );
}
