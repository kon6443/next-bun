"use client";

import { DefenseShareButton } from "./DefenseShareButton";
import { ServerReplay } from "./ReplayScreens";

/** 서버 기록 재생 화면 — 머리줄에 공유 버튼(공용 공유 메뉴, §F11) */
export function DefenseServerReplay({ scoreId }: { scoreId: number }) {
  return <ServerReplay scoreId={scoreId} actions={(data) => <DefenseShareButton subject={{ scoreId: data.scoreId, playerName: data.playerName, score: data.score, detail: data.detail }} />} />;
}
