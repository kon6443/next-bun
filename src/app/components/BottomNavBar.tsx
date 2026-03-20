"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomNavBar.module.css";

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

function FishingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2l-2 8h-2l-2-8" />
      <path d="M14 10v4a4 4 0 0 1-4 4v0" />
      <path d="M10 18a2 2 0 1 1-4 0" />
      <circle cx="10" cy="18" r="0.5" fill="currentColor" />
      <path d="M3 22c2-2 4-3.5 7-3.5" />
      <path d="M14 14c1.5 0 3 .5 4.5 2s2.5 3 3.5 4" />
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
    href: "/fishing",
    label: "낚시",
    icon: <FishingIcon />,
    match: (path) => path.startsWith("/fishing"),
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

  return (
    <nav className={styles.nav} aria-label="주요 탐색">
      <ul className={styles.list}>
        {navItems.map(({ href, label, icon, match }) => {
          const isActive = match ? match(pathname) : pathname === href;

          return (
            <li key={href} className={styles.item}>
              <Link
                href={href}
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
