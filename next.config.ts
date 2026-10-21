import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

const nextConfig: NextConfig = {
  output: "standalone",
  compiler: {
    // styled-jsx 비활성화 (React 19 호환성 문제 해결)
    styledJsx: false,
  },
  // 이 목록의 크롤러에는 메타데이터를 스트리밍하지 않고 <head>에 넣어 준다(Next 15.2+ 스트리밍 메타데이터).
  // 카카오톡 링크 미리보기 스크래퍼(kakaotalk-scrap)는 기본 목록에 없어 추가한다 — 설정하면 기본 목록을 대체하므로 이어 붙인다
  // 기본 목록은 Next 내부 경로에서 가져온다(공개 API 아님) — Next를 올릴 때 경로가 바뀌면 config 로드에서 바로 실패하니 그때 맞춘다
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|kakaotalk-scrap`, "i"),
};

export default nextConfig;
