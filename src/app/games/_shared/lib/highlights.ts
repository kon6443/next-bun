/**
 * 리플레이 하이라이트 (games-polish P4) — 재생 전 미리 시뮬로 모은 "의미 있는 순간"을 진행 막대에 점으로 찍고 이전/다음으로 건너뛴다
 * 단위(at)는 재생기 축 그대로 — 테트리스·대전은 프레임, 디펜스는 틱. 게임별 종류·임계값은 각 게임이 정하고, 여기는 공통 규칙만
 */
export type Highlight<K extends string = string> = {
  /** 그 순간(재생 축 단위) */
  at: number;
  kind: K;
  /** 화면 문구 보탬 — 예: "4줄", "7줄 공격" (aria-label·툴팁) */
  detail?: string;
};

/** 종류별 표기 — 범례·버튼 이름(label), 점 색(dot: Tailwind 배경 클래스) */
export type HighlightKindSpec = { label: string; dot: string };

/**
 * 같은 종류가 window 안에 몰리면 첫 것만 남긴다 — 레일이 점으로 뒤덮이지 않게(예: 몰려 샌 적 여러 마리 = 한 번의 위기)
 * 다른 종류는 서로 솎지 않는다. 결과는 at 오름차순
 */
export function thinHighlights<K extends string>(marks: readonly Highlight<K>[], window: number): Highlight<K>[] {
  const sorted = [...marks].sort((a, b) => a.at - b.at);
  const lastKept = new Map<K, number>();
  const kept: Highlight<K>[] = [];
  for (const mark of sorted) {
    const last = lastKept.get(mark.kind);
    if (last !== undefined && mark.at - last < window) continue;
    lastKept.set(mark.kind, mark.at);
    kept.push(mark);
  }
  return kept;
}

/** 하이라이트로 갈 때 실제로 탐색할 위치 — 그 순간 조금 앞(leadIn)부터 보여 준다 */
export function highlightSeekTarget(mark: Highlight, leadIn: number): number {
  return Math.max(0, mark.at - leadIn);
}

/** 지금 위치 다음 하이라이트 — 탐색 위치가 지금보다 뒤인 첫 것(없으면 -1). marks는 at 오름차순 */
export function nextHighlightIndex(marks: readonly Highlight[], position: number, leadIn: number): number {
  for (let i = 0; i < marks.length; i++) if (highlightSeekTarget(marks[i], leadIn) > position) return i;
  return -1;
}

/**
 * 지금 위치 이전 하이라이트 — 탐색 위치가 (지금 − slack)보다 앞인 마지막 것(없으면 -1)
 * slack: 방금 그 하이라이트로 와서 조금 재생됐을 때 "이전"이 같은 것을 다시 고르지 않게(누를 때마다 한 칸씩 뒤로)
 */
export function prevHighlightIndex(marks: readonly Highlight[], position: number, leadIn: number, slack: number): number {
  for (let i = marks.length - 1; i >= 0; i--) if (highlightSeekTarget(marks[i], leadIn) < position - slack) return i;
  return -1;
}
