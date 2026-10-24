/** 이어하기를 다시 돌리는 중 — 긴 판은 몇 초 걸린다(useChunkedRestore, games-polish FE-06) */
export function RestoreProgress({ progress }: { progress: number }) {
  return (
    <p role="status" data-testid="defense-restoring" className="text-sm text-slate-300">
      판을 불러오는 중… {Math.round(progress * 100)}%
    </p>
  );
}
