import type { Metadata } from "next";
import { SITE_CONFIG } from "../config/siteConfig";

const DESC = "브라우저에서 바로 즐기는 미니게임 모음 — 테트리스 랭킹·대전, 타워 디펜스, 멀티플레이어 낚시.";

export const metadata: Metadata = {
  title: { default: "게임", template: `%s | ${SITE_CONFIG.name}` },
  description: DESC,
  openGraph: { title: `게임 | ${SITE_CONFIG.name}`, description: DESC, type: "website", locale: SITE_CONFIG.locale },
  alternates: { canonical: "/games" },
};

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
