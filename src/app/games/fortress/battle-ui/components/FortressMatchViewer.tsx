"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import { formatCompactDateTime } from "@/app/utils/dateUtils";
import { type FortressMatch, type FortressReplay as ReplayBody, getFortressMatch, getFortressReplay } from "@/services/fortressService";
import { ApiError } from "@/types/api";
import { FortressReplay } from "../../components/FortressReplay";
import { CARD, EYEBROW } from "../../components/fortressUi";
import vividStyles from "../../components/fortressVivid.module.css";
import { DEFAULT_LOOK, lookFromUrl, usesVivid } from "../../lib/look";
import type { ReplayData } from "../../lib/replay";
import { toTankSkin } from "../../lib/tankSkins";
import { FORTRESS_MATCHES_PATH, buildFortressShareContent, fortressResultHeadline, fortressStatLine } from "../lib/fortressShare";
import { FORTRESS_LOBBY_PATH, MAP_LABEL } from "../lib/roomLabels";
import { FortressResultTable } from "./FortressResultTable";
import { HeroTanks, winnerTanks } from "../../components/resultFlair";
import type { MapId } from "../../engine";

type Loaded =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  /** replay null = 결과는 있지만 리플레이가 없다(404) — 결과만 보인다 */
  | { status: "ready"; match: FortressMatch; replay: ReplayBody | null };

const LINK = "flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/15 px-3 text-sm font-semibold text-slate-200 hover:border-white/30";

/** 리플레이 본문 → 재생 데이터·이름·스킨(slot 순) */
export function replayView(replay: ReplayBody): { data: ReplayData; names: string[]; skins: ReturnType<typeof toTankSkin>[] } {
  const names = replay.config.players.map((p) => `P${p.slot + 1}`);
  const skins = replay.config.players.map(() => toTankSkin(null));
  for (const s of replay.slots) {
    names[s.slot] = s.name;
    skins[s.slot] = toTankSkin(s.skin);
  }
  return { data: { engineVersion: replay.engineVersion, config: replay.config, actions: replay.actions }, names, skins };
}

/**
 * 저장된 경기 (F6) — 공유 링크로 들어온 사람도 보는 결과·다시 보기. 소켓 없이 REST만(로비 소켓 layout 밖)
 * 다시 보기는 서버 리플레이를 같은 엔진으로 처음부터 다시 돌리고, 마지막 해시를 서버 stateHash와 대조해 로그로 남긴다
 */
export function FortressMatchViewer({ matchId }: { matchId: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [playing, setPlaying] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 그림(보충 5) — 서버 렌더와 첫 렌더는 기본값(vivid)으로 같게, 마운트 뒤 주소·탭 기억(?look=classic 등)을 따른다(하이드레이션 불일치 없이)
  const [look, setLook] = useState(DEFAULT_LOOK);
  useEffect(() => setLook(lookFromUrl()), []);
  const { kakao, kakaoScript } = useKakaoReady();

  const load = useCallback(async () => {
    setLoaded({ status: "loading" });
    try {
      const [match, replay] = await Promise.all([
        getFortressMatch(matchId),
        getFortressReplay(matchId).catch((err: unknown) => {
          // 리플레이만 없으면 결과는 보인다
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
      ]);
      setLoaded({ status: "ready", match: match.data, replay: replay?.data ?? null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setLoaded({ status: "notFound" });
      else setLoaded({ status: "error", message: err instanceof ApiError ? err.message : "경기 기록을 불러오지 못했어요." });
    }
  }, [matchId]);

  // matchId가 바뀌면 페이지가 key로 새로 마운트한다
  useEffect(() => {
    void load();
  }, [load]);

  // 렌더마다 새 data를 만들면 재생기가 엔진을 처음부터 다시 돌린다(카카오 SDK 로드 같은 부모 갱신에도) — 리플레이가 바뀔 때만
  const replay = loaded.status === "ready" ? loaded.replay : null;
  const prepared = useMemo(() => (replay ? replayView(replay) : null), [replay]);

  if (loaded.status === "ready" && playing && loaded.replay && prepared) {
    const { data, names, skins } = prepared;
    return (
      <FortressReplay
        data={data}
        controllers={names.map(() => "remote")}
        names={names}
        skins={skins}
        expectedHash={loaded.replay.stateHash}
        closeLabel="기록으로 돌아가기"
        onClose={() => setPlaying(false)}
      />
    );
  }

  return (
    <div
      className={`h-full overflow-y-auto overscroll-contain bg-gradient-to-b from-[#070b1d] via-[#141a3d] to-[#2a2350] ${usesVivid(look) ? vividStyles.vivid : ""} px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]`}
      style={{ touchAction: "pan-y" }}
      data-testid="fortress-match-viewer"
      data-look={look}
    >
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <nav className="flex items-center justify-between text-sm">
          <Link href={FORTRESS_LOBBY_PATH} className="flex min-h-11 items-center text-sky-300">
            ‹ 포트리스 대전
          </Link>
          <Link href={FORTRESS_MATCHES_PATH} className="flex min-h-11 items-center text-slate-400">
            최근 경기
          </Link>
        </nav>

        {loaded.status === "loading" ? (
          <p className="py-10 text-center text-sm text-slate-300" role="status">
            경기 기록을 불러오는 중…
          </p>
        ) : loaded.status === "notFound" ? (
          <section className={`${CARD} text-center`} role="alert">
            <p className="text-base font-semibold text-white">공개되지 않은 경기예요</p>
            <p className="mt-2 text-sm text-slate-400">링크가 잘못됐거나 아직 저장되지 않은 경기예요.</p>
          </section>
        ) : loaded.status === "error" ? (
          <section className={`${CARD} flex flex-col items-center gap-3 text-center`} role="alert">
            <p className="text-sm text-slate-200">{loaded.message}</p>
            <button type="button" onClick={() => void load()} className="min-h-11 rounded-full border border-white/15 px-5 text-sm font-semibold text-slate-100">
              다시 시도
            </button>
          </section>
        ) : (
          <>
            <header className={`${CARD} text-center`} data-hud="card">
              <p className={EYEBROW}>RECORD</p>
              {loaded.match.roomName ? <p className="mt-2 text-sm text-slate-300">{loaded.match.roomName}</p> : null}
              <h1 className="mt-1 text-3xl font-bold text-white">{fortressResultHeadline(loaded.match)}</h1>
              <p className="mt-2 text-xs tabular-nums text-slate-400">
                {fortressStatLine(loaded.match)} · {MAP_LABEL[loaded.match.mapId as keyof typeof MAP_LABEL] ?? loaded.match.mapId} · {formatCompactDateTime(new Date(loaded.match.endedAt))}
              </p>
            </header>
            {usesVivid(look) && loaded.match.result.kind === "win" ? (
              <div className="overflow-hidden rounded-3xl" data-hud="card">
                <HeroTanks tanks={winnerTanks(loaded.match.players, prepared?.skins)} mapId={loaded.match.mapId as MapId} label={`승리한 탱크: ${winnerTanks(loaded.match.players).map((t) => t.label).join(", ")}`} />
              </div>
            ) : null}
            <FortressResultTable players={loaded.match.players} vivid={usesVivid(look)} />
            <div className="flex gap-2">
              {loaded.replay ? (
                <button type="button" onClick={() => setPlaying(true)} className={`${LINK} border-sky-400/50 bg-sky-500/15 text-sky-50`} data-testid="fortress-viewer-replay">
                  다시 보기
                </button>
              ) : (
                <span className={`${LINK} cursor-default opacity-60`}>리플레이가 없어요</span>
              )}
              <button type="button" onClick={() => setShareOpen(true)} aria-haspopup="dialog" className={LINK} data-testid="fortress-viewer-share">
                공유
              </button>
            </div>
            {kakaoScript}
            {shareOpen ? <ShareMenu content={buildFortressShareContent(loaded.match)} kakao={kakao} subject="경기 기록" onClose={() => setShareOpen(false)} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
