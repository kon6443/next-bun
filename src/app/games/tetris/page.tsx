import type { Metadata } from "next";
import { GameAbout } from "@/app/games/_shared/components/GameAbout";
import { gamePageMetadata, videoGameJsonLd } from "@/app/games/_shared/lib/seo";
import TetrisHome from "./TetrisHome";

const TITLE = "무료 온라인 테트리스 — 랭킹·친구 대전·리플레이";
const DESCRIPTION = "설치·회원가입 없이 브라우저에서 바로 하는 무료 온라인 테트리스. 일간·주간·전체 랭킹에 기록을 올리고, 친구와 1:1부터 4명까지 대전, 상위 기록 리플레이까지.";

export const metadata: Metadata = gamePageMetadata({ title: TITLE, description: DESCRIPTION, path: "/games/tetris" });

export default function TetrisPage() {
  return (
    <TetrisHome
      about={
        <GameAbout
          title="테트리스 소개"
          paragraphs={[
            "설치나 회원가입 없이 브라우저에서 바로 하는 무료 온라인 테트리스예요. 내려오는 블록을 돌리고 옮겨 가로줄을 채우면 줄이 지워지고 점수가 올라가요.",
            "게임이 끝나면 이름만 적어 랭킹에 기록을 올릴 수 있어요. 랭킹에 오른 기록은 누구나 리플레이로 처음부터 다시 볼 수 있어요.",
          ]}
          features={[
            "일간·주간·전체 랭킹 — 로그인 없이도 등록",
            "랭킹 기록 리플레이 — 배속·구간 이동·하이라이트",
            "친구와 대전 — 2~4명이 방을 만들고 링크로 초대",
            "홀드·하드 드롭·T-스핀·콤보 규칙",
            "PC 키보드와 모바일 터치 패드 모두 지원",
          ]}
          jsonLd={videoGameJsonLd({ name: "테트리스", description: DESCRIPTION, path: "/games/tetris", genre: ["퍼즐", "테트리스"] })}
          collapsible
        />
      }
    />
  );
}
