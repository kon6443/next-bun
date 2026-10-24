import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "../_shared/lib/seo";
import { SITE_CONFIG } from "../../config/siteConfig";

const DESC = "브라우저에서 바로 하는 무료 온라인 테트리스. 일간·주간·전체 랭킹과 리플레이, 친구와 대전.";

/** 테트리스 영역 공통 — 하위 페이지(플레이·대전 화면)의 제목 틀·설명·미리보기 폴백. canonical은 games/layout과 같은 이유로 두지 않는다 */
export const metadata: Metadata = {
  title: { default: "테트리스", template: `%s | ${SITE_CONFIG.name}` },
  description: DESC,
  // 제목·설명은 넣지 않는다 — 비워 두면 Next가 각 페이지의 title·description으로 채운다(대전 초대 등 페이지 문구가 미리보기에 그대로)
  openGraph: { type: "website", locale: SITE_CONFIG.locale, siteName: SITE_CONFIG.name, images: [DEFAULT_OG_IMAGE] },
  // 루트의 twitter(사이트 이름·팀 소개)를 물려받지 않게 — 제목·설명은 위와 같은 이유로 비운다
  twitter: { card: "summary_large_image", images: [DEFAULT_OG_IMAGE.url] },
};

export default function TetrisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
