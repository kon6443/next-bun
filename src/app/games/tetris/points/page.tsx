import type { Metadata } from "next";
import PointsHistoryView from "./PointsHistoryView";

export const metadata: Metadata = {
  title: "포인트 내역 — 테트리스",
  robots: { index: false, follow: false },
};

export default function TetrisPointsPage() {
  return <PointsHistoryView />;
}
