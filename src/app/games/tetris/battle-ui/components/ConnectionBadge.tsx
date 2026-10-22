import type { ConnectionStatus } from "../contexts/BattleSocketContext";

const LABELS: Record<ConnectionStatus, { text: string; dot: string }> = {
  connecting: { text: "연결 중", dot: "bg-amber-400" },
  connected: { text: "연결됨", dot: "bg-emerald-400" },
  disconnected: { text: "다시 연결하는 중", dot: "bg-rose-400" },
  failed: { text: "연결 실패 · 다시 연결", dot: "bg-rose-500" },
};

/** 대전 서버 연결 상태 — 자동 재시도가 끝났으면 눌러서 다시 연결한다 */
export function ConnectionBadge({ status, onReconnect }: { status: ConnectionStatus; onReconnect?: () => void }) {
  const label = LABELS[status];
  if (status === "failed" && onReconnect) {
    return (
      <button
        type="button"
        onClick={onReconnect}
        className="flex min-h-11 items-center gap-2 rounded-full border border-rose-500/50 bg-slate-900/70 px-3 text-xs text-rose-200"
      >
        <span className={`h-2 w-2 rounded-full ${label.dot}`} aria-hidden />
        {label.text}
      </button>
    );
  }
  return (
    <span role="status" className="flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
      <span className={`h-2 w-2 rounded-full ${label.dot}`} aria-hidden />
      {label.text}
    </span>
  );
}
