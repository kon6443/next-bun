import type { ReactNode } from "react";
import Link from "next/link";
import { TeamsPageLayout } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { TANKS, WEAPONS } from "../engine";
import { type GuideRow, KEY_GUIDE, TOUCH_GUIDE } from "../lib/controlGuide";
import { FORTRESS_SKINS_HREF } from "../lib/tankSkins";
import { FortressHomeLobbyChat } from "../battle-ui/components/FortressHomeLobbyChat";
import { FortressMySkinButton } from "./FortressMySkinButton";
import { RecentFortressMatches } from "../battle-ui/components/RecentFortressMatches";

/** 플레이 진입 — /play가 vs 값으로 설정을 미리 채운다(FortressPrototype) */
export const FORTRESS_AI_HREF = "/games/fortress/play?vs=ai";
export const FORTRESS_LOCAL_HREF = "/games/fortress/play?vs=local";
/** 온라인 대전 — 로비(방 목록·빠른 참가), 방 만들기 칸(#battle-create), 코드 입력 칸(#battle-room-code) */
export const FORTRESS_ONLINE_HREF = "/games/fortress/battle";
export const FORTRESS_CREATE_HREF = "/games/fortress/battle#battle-create";
export const FORTRESS_CODE_HREF = "/games/fortress/battle#battle-room-code";

const ONLINE_LINK =
  "flex min-h-14 flex-col items-center justify-center rounded-2xl border border-sky-400/40 bg-sky-500/10 px-2 text-center text-sm font-semibold leading-tight text-sky-100 hover:border-sky-300/70";

/**
 * 포트리스 홈 (F8, D-018) — 테트리스 홈 위계: 머리(작은 노을 그림) → 플레이 타일(AI와 대전 채움 · 같은 기기 대전 테두리)
 * → 로비 채팅(최근 3줄) → 온라인 대전(방 목록·방 만들기·코드로 참가) → 조작(접기) → 탱크. 데스크톱(lg)은 왼쪽 플레이·조작, 오른쪽 탱크 2단
 * 채움은 "AI와 대전" 하나 — 주 행동
 * about: 서버가 그린 소개·특징(검색엔진이 읽을 글) — 화면 맨 아래
 */
export function FortressHome({ about }: { about?: ReactNode }) {
  return (
    <TeamsPageLayout maxWidth="lg-wide">
      {/* 고정 하단 내비가 마지막 탱크 카드를 가리지 않게 아래 여백을 더 둔다(내비가 커지는 521px부터 더) */}
      <div className="flex flex-col gap-3 pb-4 sm:gap-4 min-[521px]:pb-8">
        {/* 머리 — 경기 화면과 같은 노을·산·지형을 작게. 제목은 하늘 쪽, 소개는 그림 아래(지형 선과 겹치지 않게) */}
        <header className="relative h-28 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#070b1d] via-[#1d2252] to-[#8a4f6a] sm:h-32">
          <span className="absolute right-[30%] top-4 h-6 w-6 rounded-full bg-amber-200 sm:right-[16%] shadow-[0_0_32px_10px_rgba(254,243,199,0.3)]" aria-hidden="true" />
          <svg className="absolute inset-x-0 bottom-0 h-12 w-full" viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 26 L40 12 L80 22 L130 6 L180 20 L230 9 L290 22 L340 10 L400 20 L400 48 L0 48Z" fill="#262c5c" />
            <path d="M0 38 Q60 26 120 34 T240 31 T400 35 L400 48 L0 48Z" fill="#6f4c2a" />
            <path d="M0 38 Q60 26 120 34 T240 31 T400 35" stroke="#a3e635" strokeWidth="2" fill="none" />
          </svg>
          <div className="relative flex items-center gap-1 p-2">
            <Link href="/games" aria-label="게임 목록" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-200 hover:bg-white/10">
              <span aria-hidden="true">‹</span>
            </Link>
            <h1 className="flex-1 text-2xl font-bold text-white [text-shadow:0_0_14px_rgba(251,146,60,0.6)]">포트리스</h1>
            {/* 내 스킨(D-025) — 테트리스 홈처럼 첫 화면 오른쪽 위에 작게, 장착 탱크 그림·레벨 배지 */}
            <FortressMySkinButton />
          </div>
        </header>
        <p className="px-1 text-sm text-slate-400">바람을 읽고 각도와 파워를 맞춰 상대 탱크를 맞히는 턴제 포격전이에요.</p>

        <div className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
            <section className="flex gap-2" aria-label="플레이" data-testid="fortress-play">
              <Link
                href={FORTRESS_AI_HREF}
                className="flex min-h-24 flex-[1.15] flex-col justify-center rounded-3xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-500 px-4 py-3 leading-tight text-white shadow-lg shadow-rose-500/30 hover:brightness-110"
              >
                <span className="text-lg font-bold">
                  <span aria-hidden="true">▶ </span>AI와 대전
                </span>
                <span className="mt-1 text-xs text-white/85">하 · 중 · 상 난이도</span>
              </Link>
              <Link
                href={FORTRESS_LOCAL_HREF}
                className="flex min-h-24 flex-1 flex-col justify-center rounded-3xl border border-orange-300/40 bg-orange-500/10 px-4 py-3 leading-tight text-orange-50 hover:border-orange-300/70"
              >
                <span className="text-base font-bold">같은 기기 대전</span>
                <span className="mt-1 text-xs text-orange-100/70">2~4명이 번갈아 쏘기</span>
              </Link>
            </section>
            {/* 로비 채팅(D-022) — 최근 3줄·한 줄 입력, 홈에 있는 동안만 포트리스 소켓을 연다(테트리스 홈과 같은 카드) */}
            <FortressHomeLobbyChat />
            {/* 온라인 대전(F5) — 로비로. 방 목록에서 빠른 참가, 방 만들기·코드로 참가는 로비의 그 칸으로 */}
            <section className={`${cardStyles.section} p-4`} aria-labelledby="fortress-online">
              <h2 id="fortress-online" className="flex items-center gap-2 text-base font-semibold text-white">
                <span aria-hidden="true">🌐</span> 친구와 온라인 대전
              </h2>
              <p className="mt-1 text-xs text-slate-400">2~4명 개인전 또는 2:2 팀전 · 초대 링크로 불러요</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Link href={FORTRESS_ONLINE_HREF} className={ONLINE_LINK}>
                  방 목록
                  <span className="block text-[10px] font-normal text-slate-400">빠른 참가</span>
                </Link>
                <Link href={FORTRESS_CREATE_HREF} className={ONLINE_LINK}>
                  방 만들기
                </Link>
                <Link href={FORTRESS_CODE_HREF} className={ONLINE_LINK}>
                  코드로 참가
                </Link>
              </div>
            </section>
            {/* 최근 경기(F6) — 저장된 온라인 경기, 누르면 기록·다시 보기 */}
            <RecentFortressMatches />

            {/* 조작 — 기본은 닫힘(details는 키보드 Enter·Space로 열고 닫힌다) */}
            <details className={`${cardStyles.section} group p-5`} data-testid="fortress-guide-details">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-base font-semibold text-white [&::-webkit-details-marker]:hidden">
                조작 방법
                <span className="text-sm text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true">
                  ▾
                </span>
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-300">키보드</p>
                  <GuideTable rows={KEY_GUIDE} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-300">터치</p>
                  <GuideTable rows={TOUCH_GUIDE} />
                </div>
              </div>
            </details>
          </div>

          <section className={`${cardStyles.section} p-5`} aria-labelledby="fortress-tanks">
            <div className="flex items-center justify-between gap-2">
              <h2 id="fortress-tanks" className="text-base font-semibold text-white">
                탱크
              </h2>
              <Link href={FORTRESS_SKINS_HREF} className="flex min-h-11 items-center rounded-full border border-sky-400/40 px-3 text-sm font-semibold text-sky-100 hover:border-sky-300/70">
                탱크 스킨 ›
              </Link>
            </div>
            <p className="mt-1 text-xs text-slate-400">탱크마다 체력·연료·무기가 달라요. 필살기는 몇 턴에 한 번 쓸 수 있어요.</p>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {TANKS.map((tank) => (
                <li key={tank.id} className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-3">
                  <p className="text-sm font-semibold text-white">{tank.name}</p>
                  <p className="mt-1 text-xs tabular-nums text-slate-400">
                    HP {tank.hp} · 연료 {tank.fuel}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{tank.weapons.map((id) => WEAPONS[id].name).join(" · ")}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {about}
      </div>
    </TeamsPageLayout>
  );
}

function GuideTable({ rows }: { rows: readonly GuideRow[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
      {rows.map(({ keys, label }) => (
        <div key={keys} className="contents">
          <dt className="font-mono font-semibold text-sky-300">{keys}</dt>
          <dd className="text-slate-400">{label}</dd>
        </div>
      ))}
    </dl>
  );
}
