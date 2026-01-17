"use client";

import { use } from "react";
import TeamBoard from "./TeamBoard";

type TeamDetailPageProps = {
  params: Promise<{ teamId: string }>;
};

export default function TeamDetailPage({ params }: TeamDetailPageProps) {
  const { teamId } = use(params);
  return <TeamBoard teamId={teamId} />;
}
