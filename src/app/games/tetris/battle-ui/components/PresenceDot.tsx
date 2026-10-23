/** 접속 표시 점 — 온라인 초록·오프라인 회색 (D-010). 글자 옆에 두는 장식이라 읽어 주지 않는다 */
export function PresenceDot({ online }: { online: boolean }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${online ? "bg-emerald-400" : "bg-slate-500"}`} />;
}
