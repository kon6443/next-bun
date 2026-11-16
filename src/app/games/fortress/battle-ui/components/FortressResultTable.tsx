import { TEAM_LABEL } from "../lib/roomLabels";
import { DamageBar, GradeBadge, gradeOf } from "../../components/resultFlair";

/** 결과 한 줄 — 소켓 matchEnded.players와 저장된 경기(GET matches/:id) players가 같은 모양 */
export type ResultRow = { playerId: string; name: string; slot: number; team: 0 | 1 | null; hp: number; damage: number; kos: number; place: number };

/**
 * 순위표 — 결과 화면과 경기 기록 페이지가 함께 쓴다. 솔로 결과와 같은 카드 행(순위·플레이어(나·팀)·남은 HP·KO) + 준 피해 막대(1위 금테)
 * 순서 목록(순위)이라 낭독은 "목록, 4개 항목"
 */
export function FortressResultTable({ players, myPlayerId = null }: { players: readonly ResultRow[]; myPlayerId?: string | null }) {
  const maxDamage = Math.max(1, ...players.map((p) => p.damage));
  return (
    // role="list" — 목록 표시를 지운 ol(Tailwind preflight)은 Safari·VoiceOver가 목록으로 읽지 않는다
    <ol role="list" className="flex flex-col gap-2" aria-label="순위" data-testid="fortress-result-cards">
      {players.map((p, i) => {
        const first = p.place === 1;
        const me = p.playerId === myPlayerId;
        return (
          <li key={p.playerId} className={`rounded-2xl border px-3 py-2.5 ${first ? "border-amber-300/40 bg-amber-400/10" : "border-white/10 bg-slate-900/60"}`} data-hud="card" data-win={first || undefined}>
            <div className="flex items-center gap-2 text-sm">
              <span className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-black tabular-nums ${first ? "bg-amber-300 text-slate-900" : "bg-slate-800 text-slate-200"}`}>
                <span className="sr-only">순위 </span>
                {p.place}
              </span>
              <span className={`min-w-0 flex-1 truncate ${first ? "font-bold text-amber-100" : "text-slate-100"}`}>
                {p.name}
                {me ? <span className="ml-1 text-xs text-sky-300">(나)</span> : null}
                {p.team !== null ? <span className="ml-1 text-xs text-slate-400">{TEAM_LABEL[p.team]}</span> : null}
              </span>
              <span className="text-xs tabular-nums text-slate-300">{p.hp > 0 ? `HP ${p.hp}` : "탈락"}</span>
              <span className="w-12 text-right text-xs tabular-nums text-slate-300">KO {p.kos}</span>
              {/* 등급은 오른쪽 끝 — 왼쪽 순위 배지(숫자 원)와 붙어 있으면 둘이 헷갈린다 */}
              <GradeBadge grade={gradeOf({ dealt: p.damage, kos: p.kos, won: first })} />
            </div>
            <DamageBar value={p.damage} max={maxDamage} delay={250 + i * 120} />
          </li>
        );
      })}
    </ol>
  );
}
