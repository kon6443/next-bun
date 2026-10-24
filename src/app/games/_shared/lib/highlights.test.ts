import { describe, it, expect } from 'vitest';
import { type Highlight, highlightSeekTarget, nextHighlightIndex, prevHighlightIndex, thinHighlights } from './highlights';

const h = (at: number, kind = 'a'): Highlight => ({ at, kind });

describe('하이라이트 공통 규칙 (games-polish P4)', () => {
  it('같은 종류가 window 안에 몰리면 첫 것만, 다른 종류는 서로 솎지 않는다 — at 오름차순', () => {
    expect(thinHighlights([h(50), h(10), h(30), h(70, 'b'), h(75), h(130)], 60).map((m) => [m.at, m.kind])).toEqual([
      [10, 'a'],
      [70, 'b'],
      [75, 'a'],
    ]);
  });

  it('탐색 위치는 그 순간 leadIn 앞(0 아래로는 안 간다)', () => {
    expect(highlightSeekTarget(h(100), 30)).toBe(70);
    expect(highlightSeekTarget(h(10), 30)).toBe(0);
  });

  it('다음 = 탐색 위치가 지금보다 뒤인 첫 것, 이전 = (지금 − slack)보다 앞인 마지막 것 — 누를 때마다 한 칸씩', () => {
    const marks = [h(100), h(300), h(600)];
    expect(nextHighlightIndex(marks, 0, 30)).toBe(0);
    // 첫 하이라이트로 왔다(70) — 다음은 둘째
    expect(nextHighlightIndex(marks, 70, 30)).toBe(1);
    expect(nextHighlightIndex(marks, 600, 30)).toBe(-1);
    // 둘째로 와서(270) 조금 재생(290) — 이전은 둘째가 아니라 첫째
    expect(prevHighlightIndex(marks, 290, 30, 60)).toBe(0);
    expect(prevHighlightIndex(marks, 70, 30, 60)).toBe(-1);
    expect(prevHighlightIndex(marks, 1000, 30, 60)).toBe(2);
  });
});
