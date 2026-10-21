import type { Metadata } from "next";
import TetrisPlay from "./TetrisPlay";

export const metadata: Metadata = {
  title: "테트리스 플레이",
  robots: { index: false, follow: false },
};

export default function TetrisPlayPage() {
  return <TetrisPlay />;
}
