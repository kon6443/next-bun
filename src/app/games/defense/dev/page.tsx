import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDefenseDevEnabled } from "../lib/devGate";
import DevBench from "./DevBench";

export const metadata: Metadata = {
  title: "디펜스 렌더러 측정",
  robots: { index: false, follow: false },
};

/** 렌더러 실기기 측정 화면 — 운영 빌드에서는 404 (D-020, lib/devGate) */
export default function DefenseDevPage() {
  if (!isDefenseDevEnabled()) notFound();
  return <DevBench />;
}
