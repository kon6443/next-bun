/**
 * 게임 목록 (site-home D-002) — 사이트 홈(`/`)과 게임 목록(`/games`)이 같이 쓴다. 새 게임은 출시 때 여기에 한 줄 추가한다
 * - description: `/games` 카드의 긴 설명(SEO 문구 포함) · tagline: 홈 카드의 한 줄 소개
 * - accent: 홈 카드 위쪽 띠 그라데이션(Tailwind 클래스 — 문자열 그대로 두어야 빌드가 클래스를 찾는다)
 * - battleEntry: 카드 아래 "친구와 대전" 입구(BattleEntryLink)를 붙인다
 */
export type GameCatalogEntry = {
  key: string;
  title: string;
  description: string;
  tagline: string;
  emoji: string;
  playHref: string;
  secondary: { href: string; label: string };
  accent: string;
  battleEntry?: boolean;
};

export const GAME_CATALOG: readonly GameCatalogEntry[] = [
  {
    key: "tetris",
    title: "테트리스",
    description: "줄을 지우고 점수를 쌓아 일간·주간·전체 랭킹에 도전하세요. 로그인 없이도 등록할 수 있어요.",
    tagline: "랭킹 도전 · 친구와 실시간 대전",
    emoji: "🧱",
    playHref: "/games/tetris",
    secondary: { href: "/games/tetris/rankings", label: "랭킹 보기" },
    accent: "from-sky-500/25 to-indigo-500/10",
    battleEntry: true,
  },
  {
    key: "fortress",
    title: "포트리스",
    description: "바람을 읽고 각도와 파워를 맞춰 상대 탱크를 맞히는 턴제 포격전이에요. AI와 겨루거나, 같은 기기·온라인에서 2~4명이 대전해요.",
    tagline: "턴제 포격전 · AI·친구와 대전",
    emoji: "💥",
    playHref: "/games/fortress",
    secondary: { href: "/games/fortress/battle", label: "친구와 대전" },
    accent: "from-orange-500/25 to-rose-500/10",
  },
  {
    key: "defense",
    title: "타워 디펜스",
    description: "돌 받침에 타워를 세워 몰려오는 적을 막아요. 캠페인 8스테이지를 하나씩 열어 가세요.",
    tagline: "캠페인 8스테이지 · 무한 모드",
    emoji: "🏰",
    playHref: "/games/defense",
    secondary: { href: "/games/defense/campaign/s1", label: "스테이지 1" },
    accent: "from-emerald-500/25 to-teal-500/10",
  },
  {
    key: "fishing",
    title: "낚시",
    description: "다른 사람들과 함께 강가에서 물고기를 낚는 방치형 멀티플레이 게임이에요.",
    tagline: "함께 낚는 방치형 멀티플레이",
    emoji: "🎣",
    playHref: "/fishing",
    secondary: { href: "/fishing/guide", label: "물고기 도감" },
    accent: "from-cyan-500/25 to-blue-500/10",
  },
];
