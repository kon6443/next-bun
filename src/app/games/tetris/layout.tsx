import type { Metadata } from "next";
import { SITE_CONFIG } from "../../config/siteConfig";

const DESC = "브라우저에서 바로 하는 테트리스. 일간·주간·전체 랭킹과 리플레이로 실력을 겨뤄 보세요.";

export const metadata: Metadata = {
  title: { default: "테트리스", template: `%s | ${SITE_CONFIG.name}` },
  description: DESC,
  openGraph: { title: `테트리스 | ${SITE_CONFIG.name}`, description: DESC, type: "website", locale: SITE_CONFIG.locale },
  alternates: { canonical: "/games/tetris" },
};

export default function TetrisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
