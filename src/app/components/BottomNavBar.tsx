"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomNavBar.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  match?: (path: string) => boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "홈", icon: "🏠", match: (path) => path === "/" },
  {
    href: "/teams",
    label: "팀스페이스",
    icon: "👥",
    match: (path) => path.startsWith("/teams"),
  },
  {
    href: "/services",
    label: "서비스",
    icon: "🛠️",
    match: (path) => path.startsWith("/services"),
  },
  {
    href: "/mypage",
    label: "마이페이지",
    icon: "👤",
    match: (path) => path.startsWith("/mypage"),
  },
];

const BottomNavBar = () => {
  const pathname = usePathname();

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
