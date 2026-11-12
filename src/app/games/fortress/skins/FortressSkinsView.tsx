"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { ReloginButton } from "@/app/games/_shared/components/ReloginButton";
import { isAuthExpired } from "@/app/games/_shared/lib/submitError";
import { TeamsPageLayout } from "@/app/teams/components";
import { Button } from "@/app/teams/components/Button";
import { type FortressSkins, equipFortressSkin, getMyFortressSkins, upgradeFortressSkin } from "@/services/fortressService";
import { cardStyles } from "@/styles/teams";
import { ApiError } from "@/types/api";
import { TankSkinPreview } from "../components/TankSkinPreview";
import { SLOT_COLORS } from "../renderer/drawScene";
import { formatPoints } from "../lib/points";
import {
  DEFAULT_TANK_SKIN_ID,
  MAX_TANK_SKIN_LEVEL,
  TANK_SKIN_DESCRIPTIONS,
  TANK_SKIN_IDS,
  TANK_SKIN_LABELS,
  TANK_SKIN_LEVEL_FEATURES,
  type TankSkinId,
  isTankSkinId,
} from "../lib/tankSkins";

type Status = "guest" | "loading" | "ready" | "error" | "expired";

/** 미리보기는 한 색(1번 자리 색)으로 — 스킨 차이만 보이게. 경기에서는 몸통이 자리·팀 색이 된다 */
const PREVIEW_COLOR = SLOT_COLORS[0];
const SHOWCASE = TANK_SKIN_IDS.map((id) => ({ skin: { id, level: 1 }, color: PREVIEW_COLOR, label: TANK_SKIN_LABELS[id] }));

/**
 * 탱크 스킨 (F7, DESIGN §13) — 4종을 맵 위에 나란히 보이고, 로그인하면 장착·강화
 * 레벨·비용·포인트는 서버 응답(GET fortress/skins/me)이 기준 — 장착·강화 응답도 같은 모양이라 그대로 바꿔 끼운다
 * 강화 확인은 테트리스 스킨 강화와 같이 같은 자리 확인 단계(모달을 겹치지 않는다). 요청은 한 번에 하나
 */
export function FortressSkinsView() {
  const { data: session, status: authStatus } = useSession();
  const accessToken = session?.user?.accessToken;
  const [mine, setMine] = useState<FortressSkins | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [selected, setSelected] = useState<TankSkinId>(DEFAULT_TANK_SKIN_ID);
  const [busy, setBusy] = useState<"equip" | "upgrade" | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** 늦게 온 이전 불러오기 응답은 버린다 */
  const loadIdRef = useRef(0);
  /** 응답 때 아직 로그인 상태인지 — 요청 중 로그아웃(게스트 화면)이면 늦게 온 성공 응답을 반영하지 않는다 */
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  /** 강화 버튼 — 확인 단계가 닫히면 포커스를 돌려준다(확인 단계를 여는 동안은 화면에서 빠진다) */
  const upgradeButtonRef = useRef<HTMLButtonElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const refocusRef = useRef(false);

  /** quiet = 강화 409 뒤 다시 맞추기 — 화면(고른 스킨·확인 단계 밖 상태)을 그대로 두고 값만 바꾼다 */
  const load = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!accessToken) return;
      const id = ++loadIdRef.current;
      if (!quiet) setStatus("loading");
      try {
        const res = await getMyFortressSkins(accessToken);
        if (id !== loadIdRef.current) return;
        setMine(res.data);
        if (!quiet) setSelected(isTankSkinId(res.data.equipped.id) ? res.data.equipped.id : DEFAULT_TANK_SKIN_ID);
        setStatus("ready");
      } catch (err) {
        if (id !== loadIdRef.current) return;
        if (!quiet || isAuthExpired(err)) setStatus(isAuthExpired(err) ? "expired" : "error");
        // 조용히 다시 맞추다 실패하면 화면 값이 옛것일 수 있다 — 한 번 알린다
        else toast.error("최신 상태를 불러오지 못했어요. 새로 고쳐 주세요.");
      }
    },
    [accessToken],
  );

  // 확인 단계가 닫히면(취소·Esc·강화 성공·409) 강화 버튼으로, 만렙이라 버튼이 없으면 상세 제목으로 — 커밋 뒤 다음 프레임에
  useEffect(() => {
    if (confirming || !refocusRef.current) return;
    refocusRef.current = false;
    const id = requestAnimationFrame(() => (upgradeButtonRef.current ?? detailHeadingRef.current)?.focus());
    return () => cancelAnimationFrame(id);
  }, [confirming]);
  const closeConfirm = () => {
    refocusRef.current = true;
    setConfirming(false);
  };

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!accessToken) {
      loadIdRef.current++;
      setMine(null);
      setStatus("guest");
      return;
    }
    void load();
  }, [authStatus, accessToken, load]);

  const item = mine?.items.find((x) => x.id === selected) ?? null;
  const level = item?.level ?? 1;

  const failed = (err: unknown, fallback: string) => {
    if (isAuthExpired(err)) {
      setStatus("expired");
      return;
    }
    toast.error(err instanceof ApiError ? skinErrorMessage(err) : fallback);
  };

  const equip = async () => {
    if (!accessToken || !item || busy) return;
    setBusy("equip");
    try {
      const res = await equipFortressSkin(item.id, accessToken);
      if (!tokenRef.current) return;
      // 그 전에 시작한 불러오기가 늦게 와도 이 결과를 덮지 않게
      loadIdRef.current++;
      setMine(res.data);
      // 버린 불러오기가 화면을 "불러오는 중"에 두었을 수 있다 — 이 응답이 최신 값이다
      setStatus("ready");
      toast.success(`${TANK_SKIN_LABELS[selected]} 스킨을 장착했어요. 대전 방에 다음에 들어갈 때부터 적용돼요.`);
    } catch (err) {
      failed(err, "스킨을 바꾸지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const upgrade = async () => {
    if (!accessToken || !item || busy || item.nextCost === null) return;
    setBusy("upgrade");
    try {
      const res = await upgradeFortressSkin({ skinId: item.id, level: item.level + 1 }, accessToken);
      if (!tokenRef.current) return;
      loadIdRef.current++;
      setMine(res.data);
      setStatus("ready");
      closeConfirm();
      // 이미 그 레벨이면(다른 탭에서 올림) 서버가 차감 없이 200 — 실제로 오른 만큼만 알린다
      const upgraded = res.data.items.find((x) => x.id === item.id)?.level ?? item.level;
      if (upgraded > item.level) toast.success(`${TANK_SKIN_LABELS[selected]} Lv${upgraded}로 강화했어요.`);
      else toast(`이미 Lv${upgraded}이에요.`);
    } catch (err) {
      failed(err, "스킨을 강화하지 못했어요.");
      // 레벨·포인트가 서버와 어긋났을 수 있다(다른 탭 강화 등) — 확인 단계를 닫고 조용히 다시 맞춘다
      if (err instanceof ApiError && err.status === 409) {
        closeConfirm();
        void load({ quiet: true });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <TeamsPageLayout maxWidth="lg-wide">
      <div className="flex flex-col gap-4 pb-8">
        <header className="flex items-center gap-1">
          <Link href="/games/fortress" aria-label="포트리스 홈" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-200 hover:bg-white/10">
            <span aria-hidden="true">‹</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">탱크 스킨</h1>
          {mine ? (
            <span className="ml-auto rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-sm tabular-nums text-amber-200" data-testid="fortress-skin-points">
              보유 {formatPoints(mine.points.balance)}
            </span>
          ) : null}
        </header>
        <p className="px-1 text-sm text-slate-400">몸통 색은 늘 내 자리(팀) 색이에요. 스킨은 무늬·궤도·포신을, 강화는 장식을 바꿔요.</p>

        <section className={`${cardStyles.section} overflow-hidden`} aria-label="모든 스킨">
          <TankSkinPreview tanks={SHOWCASE} className="h-44 sm:h-56" label={`탱크 스킨 ${TANK_SKIN_IDS.length}종 미리보기: ${TANK_SKIN_IDS.map((id) => TANK_SKIN_LABELS[id]).join(", ")}`} />
        </section>

        {status === "guest" ? (
          <>
            <section className={`${cardStyles.section} flex flex-col items-start gap-3 p-5`}>
              <p className="text-sm text-slate-300">로그인하면 스킨을 고르고 포인트로 강화할 수 있어요. 무료 스킨 3종은 바로 쓸 수 있어요.</p>
              <ReloginButton label="카카오로 로그인" />
            </section>
            <section className={`${cardStyles.section} flex flex-col gap-3 p-4`} aria-labelledby="fortress-skin-levels">
              <h2 id="fortress-skin-levels" className="text-base font-semibold text-white">
                강화하면
              </h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="스킨">
                {TANK_SKIN_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelected(id)}
                    aria-pressed={selected === id}
                    className={`min-h-11 rounded-full border px-4 text-sm ${selected === id ? "border-sky-400/70 bg-sky-500/15 text-white" : "border-slate-700/60 text-slate-300"}`}
                  >
                    {TANK_SKIN_LABELS[id]}
                  </button>
                ))}
              </div>
              <LevelStrip id={selected} level={1} />
            </section>
          </>
        ) : status === "expired" ? (
          <section className={`${cardStyles.section} flex flex-col items-start gap-3 p-5`} role="alert">
            <p className="text-sm text-slate-300">로그인이 만료됐어요. 다시 로그인하면 스킨을 바꿀 수 있어요.</p>
            <ReloginButton />
          </section>
        ) : status === "error" ? (
          <section className={`${cardStyles.errorSection} flex flex-col items-start gap-3 p-5`} role="alert">
            <p className="text-sm text-slate-200">탱크 스킨을 불러오지 못했어요.</p>
            <Button type="button" size="md" className="min-h-11" onClick={() => void load()}>
              다시 시도
            </Button>
          </section>
        ) : status === "loading" || !mine ? (
          <p className="px-1 text-sm text-slate-400" role="status">
            내 스킨을 불러오는 중…
          </p>
        ) : (
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
            <ul className="grid grid-cols-2 gap-3" aria-label="스킨 고르기">
              {TANK_SKIN_IDS.map((id) => {
                const it = mine.items.find((x) => x.id === id);
                const isSelected = selected === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        // 누른 카드에 포커스가 남는다 — 남은 포커스 복원 표시는 지운다
                        refocusRef.current = false;
                        setSelected(id);
                        setConfirming(false);
                      }}
                      aria-pressed={isSelected}
                      className={`flex w-full flex-col overflow-hidden rounded-2xl border text-left ${isSelected ? "border-sky-400/70 bg-sky-500/10" : "border-slate-700/50 bg-slate-900/60 hover:border-slate-500/70"}`}
                      data-testid={`fortress-skin-${id}`}
                    >
                      <TankSkinPreview tanks={[{ skin: { id, level: it?.level ?? 1 }, color: PREVIEW_COLOR }]} className="h-20" label={`${TANK_SKIN_LABELS[id]} 탱크`} />
                      <span className="flex items-center gap-1.5 px-3 pt-2 text-sm font-semibold text-white">
                        {TANK_SKIN_LABELS[id]}
                        {it ? <span className="text-xs font-normal tabular-nums text-slate-400">Lv{it.level}</span> : null}
                      </span>
                      <span className="px-3 pb-2.5 text-xs text-slate-400">{it?.equipped ? <span className="text-emerald-300">장착 중</span> : it?.owned ? "보유" : it ? "잠김" : "곧 공개"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {item ? (
              <section className={`${cardStyles.section} flex flex-col gap-3 p-4`} aria-labelledby="fortress-skin-detail">
                <h2 ref={detailHeadingRef} tabIndex={-1} id="fortress-skin-detail" className="text-base font-semibold text-white outline-none">
                  {TANK_SKIN_LABELS[selected]} <span className="text-sm font-normal tabular-nums text-slate-400">Lv{level}</span>
                </h2>
                <p className="text-xs text-slate-400">{TANK_SKIN_DESCRIPTIONS[selected]}</p>
                <LevelStrip id={selected} level={level} />
                <div className="flex flex-wrap gap-2">
                  {item.equipped ? (
                    <span className="inline-flex min-h-11 items-center rounded-full border border-emerald-400/40 px-4 text-sm text-emerald-200">장착 중</span>
                  ) : (
                    <Button type="button" size="md" className="min-h-11" onClick={() => void equip()} disabled={!item.owned || busy !== null} data-testid="fortress-skin-equip">
                      {busy === "equip" ? "장착하는 중…" : "장착하기"}
                    </Button>
                  )}
                  {item.owned && item.nextCost !== null && !confirming ? (
                    <button
                      ref={upgradeButtonRef}
                      type="button"
                      onClick={() => {
                        refocusRef.current = false;
                        setConfirming(true);
                      }}
                      disabled={busy !== null}
                      className="min-h-11 rounded-full border border-amber-300/50 px-4 text-sm font-semibold text-amber-100 disabled:opacity-60"
                      data-testid="fortress-skin-upgrade"
                    >
                      Lv{level + 1}로 강화 · {formatPoints(item.nextCost)}
                    </button>
                  ) : null}
                  {item.nextCost === null ? <span className="inline-flex min-h-11 items-center text-sm text-slate-400">최고 레벨이에요</span> : null}
                </div>
                {confirming && item.nextCost !== null ? (
                  <UpgradeConfirm
                    cost={item.nextCost}
                    balance={mine.points.balance}
                    target={level + 1}
                    busy={busy === "upgrade"}
                    onConfirm={() => void upgrade()}
                    onCancel={closeConfirm}
                  />
                ) : null}
              </section>
            ) : (
              <p className="text-sm text-slate-400">이 스킨은 아직 열리지 않았어요.</p>
            )}
          </div>
        )}
      </div>
    </TeamsPageLayout>
  );
}

/** Lv1~5 미리보기와 레벨별 장식 — 지금 레벨까지 받은 장식은 초록 */
function LevelStrip({ id, level }: { id: TankSkinId; level: number }) {
  return (
    <>
      <TankSkinPreview
        tanks={Array.from({ length: MAX_TANK_SKIN_LEVEL }, (_, i) => ({ skin: { id, level: i + 1 }, color: PREVIEW_COLOR, label: `Lv${i + 1}` }))}
        className="h-36 rounded-2xl"
        label={`${TANK_SKIN_LABELS[id]} 레벨 1부터 5까지 미리보기`}
      />
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400 sm:grid-cols-4">
        {TANK_SKIN_LEVEL_FEATURES.slice(1).map((feature, i) => (
          <li key={feature} className={i + 2 <= level ? "text-emerald-300" : ""}>
            Lv{i + 2} {feature}
          </li>
        ))}
      </ul>
    </>
  );
}

/** 같은 자리 확인 단계 — Esc·취소로 닫는다. 포인트가 모자라면 강화 버튼을 막고 모자란 만큼 안내 */
/**
 * 확인 버튼은 막아도 disabled로 바꾸지 않는다(포커스를 받지 못해 body로 빠지고 Esc도 못 받는다) — aria-disabled + 무시
 * 첫 포커스는 강화할 수 있으면 확인 버튼, 모자라면 취소 버튼
 */
function UpgradeConfirm({ cost, balance, target, busy, onConfirm, onCancel }: { cost: number; balance: number; target: number; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const short = Math.max(0, cost - balance);
  const blocked = short > 0 || busy;
  // 열릴 때 한 번 — 나중에 blocked가 바뀌어도 포커스를 옮기지 않는다
  const firstFocusRef = useRef(short > 0 ? cancelRef : confirmRef);
  useEffect(() => firstFocusRef.current.current?.focus(), []);
  return (
    <div
      className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-3"
      role="group"
      aria-label="강화 확인"
      onKeyDown={(e) => {
        // 요청 중에는 닫지 않는다 — 강화는 이미 진행 중이고, 닫으면 포커스가 막힌 버튼으로 가지 못한다
        if (e.key === "Escape" && !busy) onCancel();
      }}
    >
      <p className="text-sm text-amber-50">
        {formatPoints(cost)}를 써서 Lv{target}로 강화할까요? 쓴 포인트는 돌아오지 않아요.
      </p>
      {short > 0 ? <p className="mt-1 text-xs text-rose-300">{formatPoints(short)} 더 필요해요.</p> : null}
      <div className="mt-2 flex gap-2">
        <button ref={cancelRef} type="button" onClick={() => !busy && onCancel()} aria-disabled={busy} className="min-h-11 rounded-full px-4 text-sm text-slate-300 aria-disabled:opacity-50">
          취소
        </button>
        <Button
          ref={confirmRef}
          type="button"
          size="md"
          className="min-h-11 aria-disabled:opacity-50"
          onClick={() => !blocked && onConfirm()}
          aria-disabled={blocked}
          aria-busy={busy}
          data-testid="fortress-skin-upgrade-confirm"
        >
          {busy ? "강화하는 중…" : "강화하기"}
        </Button>
      </div>
    </div>
  );
}

/** 장착·강화 오류 문구 — 코드별 한국어(테트리스 upgradeErrorMessage와 같은 문구), 그 밖은 서버 메시지 */
export function skinErrorMessage(err: ApiError): string {
  if (err.code === "USER_POINTS_INSUFFICIENT") return "포인트가 부족해요.";
  if (err.code === "USER_SKIN_LEVEL_MISMATCH") return "레벨이 다른 곳에서 바뀌었어요. 최신 상태로 다시 불러올게요.";
  if (err.code === "USER_SKIN_NOT_OWNED") return "보유한 스킨만 쓸 수 있어요.";
  return err.message;
}
