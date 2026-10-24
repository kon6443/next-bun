import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "./_shared/lib/seo";
import { SITE_CONFIG } from "../config/siteConfig";

const DESC = "설치 없이 브라우저에서 바로 하는 무료 미니게임 모음 — 온라인 테트리스 랭킹·대전, 타워 디펜스, 멀티플레이어 낚시.";

/**
 * 게임 영역 공통 — 따로 정하지 않은 하위 페이지(플레이 화면 등)의 제목 틀·설명·미리보기 폴백
 * canonical은 비운다: layout에 두면 하위 페이지가 모두 그 주소의 중복으로 보인다(루트의 "/"도 물려받지 않게 null).
 * 색인할 페이지는 gamePageMetadata로 자기 canonical을 정한다
 */
export const metadata: Metadata = {
  title: { default: "게임", template: `%s | ${SITE_CONFIG.name}` },
  description: DESC,
  // 제목·설명은 넣지 않는다 — 비워 두면 Next가 각 페이지의 title·description으로 채운다(대전 초대 등 페이지 문구가 미리보기에 그대로)
  openGraph: { type: "website", locale: SITE_CONFIG.locale, siteName: SITE_CONFIG.name, images: [DEFAULT_OG_IMAGE] },
  // 루트의 twitter(사이트 이름·팀 소개)를 물려받지 않게 — 제목·설명은 위와 같은 이유로 비운다
  twitter: { card: "summary_large_image", images: [DEFAULT_OG_IMAGE.url] },
  alternates: { canonical: null },
};

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
