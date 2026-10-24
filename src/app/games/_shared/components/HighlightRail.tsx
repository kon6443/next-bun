"use client";

import { memo } from "react";
import { type Highlight, type HighlightKindSpec, highlightSeekTarget, nextHighlightIndex, prevHighlightIndex } from "../lib/highlights";

/**
 * 리플레이 하이라이트 표시 (games-polish P4) — 세 재생기(테트리스·대전·디펜스) 공용
 * - HighlightMarks: 진행 막대 위 점(장식 — 조작은 막대와 HighlightNav). 부모는 relative, 막대와 같은 끝(max)
 * - HighlightNav: 이전·다음 하이라이트 버튼(키보드·스크린리더 — 이름에 종류·시각) + 범례(있는 종류만, 개수)
 */

type MarksProps<K extends string> = {
  marks: readonly Highlight<K>[];
  kinds: Record<K, HighlightKindSpec>;
  /** 막대 끝(막대 max와 같은 단위·값) */
  max: number;
};

function HighlightMarksImpl<K extends string>({ marks, kinds, max }: MarksProps<K>) {
  if (marks.length === 0 || max <= 0) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-3 h-2" data-testid="highlight-marks">
      {marks.map((m, i) => (
        <span
          key={i}
          data-kind={m.kind}
          className={`absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full ring-1 ring-slate-950 ${kinds[m.kind].dot}`}
          style={{ left: `${(Math.min(m.at, max) / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

/** 점은 기록마다 고정 — 재생 중 시간이 바뀌어도 다시 그리지 않는다(긴 판은 점이 수십 개) */
export const HighlightMarks = memo(HighlightMarksImpl) as typeof HighlightMarksImpl;

type NavProps<K extends string> = {
  marks: readonly Highlight<K>[];
  kinds: Record<K, HighlightKindSpec>;
  /** 지금 재생 위치(막대와 같은 단위) */
  position: number;
  /** 그 순간 이만큼 앞부터 — 예: 1.5초 */
  leadIn: number;
  /** "이전"이 방금 간 것을 다시 고르지 않게 — 예: 2초 */
  slack: number;
  /** 시각 표기(m:ss) — 버튼 이름 */
  formatAt: (at: number) => string;
  onSeek: (target: number) => void;
  /** 미리 시뮬 중이면 버튼을 잠근다 */
  disabled?: boolean;
};

const navButton =
  "min-h-11 rounded-full border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:border-white/30 disabled:opacity-40";

function describe<K extends string>(mark: Highlight<K>, kinds: Record<K, HighlightKindSpec>, formatAt: (at: number) => string): string {
  return `${kinds[mark.kind].label}${mark.detail ? ` ${mark.detail}` : ""} ${formatAt(mark.at)}`;
}

export function HighlightNav<K extends string>({ marks, kinds, position, leadIn, slack, formatAt, onSeek, disabled = false }: NavProps<K>) {
  if (marks.length === 0) return null;
  const prev = prevHighlightIndex(marks, position, leadIn, slack);
  const next = nextHighlightIndex(marks, position, leadIn);
  const counts = new Map<K, number>();
  for (const m of marks) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="highlight-nav">
      <button
        type="button"
        disabled={disabled || prev < 0}
        onClick={() => prev >= 0 && onSeek(highlightSeekTarget(marks[prev], leadIn))}
        aria-label={prev >= 0 ? `이전 하이라이트 — ${describe(marks[prev], kinds, formatAt)}` : "이전 하이라이트 없음"}
        className={navButton}
      >
        ◀ 하이라이트
      </button>
      <button
        type="button"
        disabled={disabled || next < 0}
        onClick={() => next >= 0 && onSeek(highlightSeekTarget(marks[next], leadIn))}
        aria-label={next >= 0 ? `다음 하이라이트 — ${describe(marks[next], kinds, formatAt)}` : "다음 하이라이트 없음"}
        className={navButton}
      >
        하이라이트 ▶
      </button>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400" aria-label="하이라이트 종류">
        {[...counts].map(([kind, count]) => (
          <li key={kind} className="flex items-center gap-1">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${kinds[kind].dot}`} />
            {kinds[kind].label} {count}
          </li>
        ))}
      </ul>
    </div>
  );
}
