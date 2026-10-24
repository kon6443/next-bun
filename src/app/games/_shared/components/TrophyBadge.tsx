import type { Trophies } from "@/types/game";

const MEDALS = [
  { key: "gold", icon: "🥇", rank: 1 },
  { key: "silver", icon: "🥈", rank: 2 },
  { key: "bronze", icon: "🥉", rank: 3 },
] as const;

/** "1위 1회·3위 2회" — 입상이 없으면 빈 문자열 */
export function trophyLabel(trophies: Trophies): string {
  return MEDALS.filter(({ key }) => trophies[key] > 0)
    .map(({ key, rank }) => `${rank}위 ${trophies[key]}회`)
    .join("·");
}

/**
 * 명예의 전당 배지 (games-growth B5) — 이름 옆 작은 메달 아이콘+횟수. 입상이 없거나 null이면 그리지 않는다
 * 읽을 때는 "명예의 전당 1위 1회·3위 2회" 한 번으로(아이콘·숫자를 따로 읽지 않게)
 */
export function TrophyBadge({ trophies }: { trophies: Trophies | null | undefined }) {
  if (!trophies) return null;
  const label = trophyLabel(trophies);
  if (!label) return null;
  return (
    <span role="img" aria-label={`명예의 전당 ${label}`} title={`명예의 전당 ${label}`} className="ml-1.5 inline-flex items-center gap-1 align-middle text-[10px] font-semibold text-amber-200" data-testid="trophy-badge">
      {MEDALS.filter(({ key }) => trophies[key] > 0).map(({ key, icon }) => (
        <span key={key} aria-hidden="true">
          {icon}
          {trophies[key]}
        </span>
      ))}
    </span>
  );
}
