"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomNavBar.module.css";
import { FEEDBACK_PATH, buildFeedbackHref, isFeedbackPath } from "@/app/utils/feedbackUtils";
import { GAMES_PATH, isFullscreenGamePath, isGamesPath } from "@/app/games/gamesPaths";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match?: (path: string) => boolean;
};

/** SVG 아이콘 컴포넌트들 */
function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GameIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 11h4" />
      <path d="M8 9v4" />
      <circle cx="15" cy="12" r="0.5" fill="currentColor" />
      <circle cx="17.5" cy="10" r="0.5" fill="currentColor" />
      <path d="M17.3 5H6.7a4 4 0 0 0-3.96 3.47l-.73 5.5A3 3 0 0 0 7.2 16.4L9 15h6l1.8 1.4a3 3 0 0 0 5.2-2.43l-.73-5.5A4 4 0 0 0 17.3 5z" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </svg>
  );
}

function MyPageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const navItems: NavItem[] = [
  { href: "/", label: "홈", icon: <HomeIcon />, match: (path) => path === "/" },
  {
    href: "/teams",
    label: "팀스페이스",
    icon: <TeamIcon />,
    match: (path) => path.startsWith("/teams"),
  },
  {
    href: GAMES_PATH,
    label: "게임",
    icon: <GameIcon />,
    match: isGamesPath,
  },
  {
    href: FEEDBACK_PATH,
    label: "피드백",
    icon: <FeedbackIcon />,
    match: isFeedbackPath,
  },
  {
    href: "/mypage",
    label: "마이페이지",
    icon: <MyPageIcon />,
    match: (path) => path.startsWith("/mypage"),
  },
];

const BottomNavBar = () => {
  const pathname = usePathname() ?? '';

  // 전체화면 게임(낚시·테트리스 플레이·리플레이)에서는 숨긴다
  if (isFullscreenGamePath(pathname)) return null;

  return (
    <nav className={styles.nav} aria-label="주요 탐색" data-fixed-bottom-overlay>
      <ul className={styles.list}>
        {navItems.map(({ href, label, icon, match }) => {
          const isActive = match ? match(pathname) : pathname === href;
          // 피드백 탭은 지금 경로를 ?from= 으로 넘긴다 (피드백 pagePath)
          const linkHref = href === FEEDBACK_PATH ? buildFeedbackHref(pathname) : href;

          return (
            <li key={href} className={styles.item}>
              <Link
                href={linkHref}
                className={`${styles.link} ${isActive ? styles.active : ""}`}
              >
                <span className={styles.icon} aria-hidden="true">
                  {icon}
                </span>
                <span className={styles.label}>{label}</span>
                {isActive && <span className={styles.pill} aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default BottomNavBar;
