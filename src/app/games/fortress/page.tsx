import type { Metadata } from "next";
import { GameAbout } from "@/app/games/_shared/components/GameAbout";
import { gamePageMetadata, videoGameJsonLd } from "@/app/games/_shared/lib/seo";
import { FortressHome } from "./components/FortressHome";

const TITLE = "무료 온라인 포트리스 — 턴제 포격전·AI·친구 대전";
const DESCRIPTION = "설치·회원가입 없이 브라우저에서 바로 하는 무료 턴제 포격전. 바람을 읽고 각도와 파워를 맞춰 쏘고, AI·같은 기기·온라인으로 2~4명 개인전이나 2:2 팀전을 즐기세요.";

export const metadata: Metadata = gamePageMetadata({ title: TITLE, description: DESCRIPTION, path: "/games/fortress" });

/** 포트리스 홈 (F8) — 사이트 홈·게임 목록 카드(gameCatalog)와 sitemap에서 들어온다. AI와 대전 · 같은 기기 대전 · 온라인 대전 진입 */
export default function FortressHomePage() {
  return (
    <FortressHome
      about={
        <GameAbout
          title="포트리스 소개"
          paragraphs={[
            "설치나 회원가입 없이 브라우저에서 바로 하는 무료 턴제 포격전이에요. 차례가 오면 탱크를 움직이고 각도와 파워를 맞춰 쏘아 상대 탱크를 맞혀요.",
            "바람이 턴마다 바뀌고 포탄이 땅을 깎아 지형이 달라져요. 온라인 대전 기록은 누구나 처음부터 다시 볼 수 있어요.",
          ]}
          features={[
            "AI와 대전 — 하·중·상 난이도",
            "같은 기기 대전 — 2~4명이 번갈아 쏘기",
            "친구와 온라인 대전 — 2~4명 개인전 또는 2:2 팀전, 초대 링크",
            "탱크마다 다른 체력·연료·무기와 필살기",
            "PC 키보드와 모바일 터치 모두 지원",
          ]}
          jsonLd={videoGameJsonLd({ name: "포트리스", description: DESCRIPTION, path: "/games/fortress", genre: ["전략", "포격", "턴제"] })}
          collapsible
        />
      }
    />
  );
}
