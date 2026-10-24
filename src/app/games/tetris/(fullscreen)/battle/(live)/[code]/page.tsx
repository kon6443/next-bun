import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BattleRoom } from "../../../../battle-ui/components/BattleRoom";
import { normalizeRoomCode } from "../../../../battle-ui/lib/roomForm";

type BattleRoomPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ locked?: string }>;
};

export const metadata: Metadata = {
  title: "테트리스 대전 방",
  description: "테트리스 대전에 초대받았어요 — 들어와서 같이 겨뤄요.",
  robots: { index: false, follow: false },
};

export default async function TetrisBattleRoomPage({ params, searchParams }: BattleRoomPageProps) {
  const { code } = await params;
  const { locked } = await searchParams;
  // 방 코드 형식이 아니면(잘못된 % 인코딩 포함) 서버에 묻지 않고 404
  let decoded: string;
  try {
    decoded = decodeURIComponent(code);
  } catch {
    notFound();
  }
  const normalized = normalizeRoomCode(decoded);
  if (!normalized) notFound();
  // 방마다 새로 마운트 — 방에서 다른 방 링크로 바로 가도 앞 방의 입장 상태(자동 입장 시도·입력값)가 이어지지 않게 (games-polish FE-35)
  return <BattleRoom key={normalized} code={normalized} lockedHint={locked === "1"} />;
}
