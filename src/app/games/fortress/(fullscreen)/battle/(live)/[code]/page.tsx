import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { normalizeRoomCode } from "@/app/games/_shared/battle-room/lib/roomForm";
import { FortressRoom } from "../../../../battle-ui/components/FortressRoom";

type FortressRoomPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ locked?: string }>;
};

export const metadata: Metadata = {
  title: "포트리스 대전 방",
  description: "포트리스 대전에 초대받았어요 — 들어와서 같이 겨뤄요.",
  robots: { index: false, follow: false },
};

export default async function FortressRoomPage({ params, searchParams }: FortressRoomPageProps) {
  const { code } = await params;
  const { locked } = await searchParams;
  let decoded: string;
  try {
    decoded = decodeURIComponent(code);
  } catch {
    notFound();
  }
  const normalized = normalizeRoomCode(decoded);
  if (!normalized) notFound();
  // 방마다 새로 마운트 — 앞 방의 입장 상태가 이어지지 않게
  return <FortressRoom key={normalized} code={normalized} lockedHint={locked === "1"} />;
}
