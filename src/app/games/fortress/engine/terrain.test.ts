import { describe, it, expect } from 'vitest';
import { MAX_SPAN_PAIRS, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import { cosDeg, isqrt, sinDeg } from './math';
import { type Column, blocksAt, carveCircle, groundAt, isSolid, subtractRange } from './terrain';

const flat = (top: number): { cols: Column[] } => ({ cols: Array.from({ length: WORLD_WIDTH }, () => [top, WORLD_HEIGHT]) });

describe('열 구간', () => {
  it('subtractRange — 겹침 없음은 같은 배열, 가운데는 둘로, 가장자리는 잘라낸다', () => {
    const col = [100, 500];
    expect(subtractRange(col, 0, 50)).toBe(col);
    expect(subtractRange(col, 600, 700)).toBe(col);
    expect(subtractRange(col, 200, 300)).toEqual([100, 200, 300, 500]);
    expect(subtractRange(col, 50, 150)).toEqual([150, 500]);
    expect(subtractRange(col, 450, 900)).toEqual([100, 450]);
    expect(subtractRange(col, 0, 900)).toEqual([]);
  });

  it(`구간이 ${MAX_SPAN_PAIRS}쌍을 넘으면 가장 좁은 빈틈부터 메운다`, () => {
    let col: Column = [0, 1000];
    for (let i = 0; i < MAX_SPAN_PAIRS; i++) col = subtractRange(col, 50 + i * 100, 60 + i * 100 + (i === 3 ? -5 : 0));
    expect(col.length).toBe(MAX_SPAN_PAIRS * 2);
    // 9번째 빈틈을 내면 가장 좁은 빈틈(i=3, 5px)이 메워진다
    const next = subtractRange(col, 900, 950);
    expect(next.length).toBe(MAX_SPAN_PAIRS * 2);
    expect(isSolid({ cols: [next] }, 0, 352)).toBe(true);
    expect(isSolid({ cols: [next] }, 0, 920)).toBe(false);
  });

  it('isSolid·groundAt·blocksAt', () => {
    const t = { cols: [[100, 200, 300, WORLD_HEIGHT]] as Column[] };
    expect(isSolid(t, 0, 99)).toBe(false);
    expect(isSolid(t, 0, 100)).toBe(true);
    expect(isSolid(t, 0, 200)).toBe(false);
    expect(isSolid(t, 0, 300)).toBe(true);
    expect(isSolid(t, -1, 300)).toBe(false);
    expect(groundAt(t.cols[0], 0)).toBe(100);
    expect(groundAt(t.cols[0], 250)).toBe(300);
    expect(groundAt(t.cols[0], 150)).toBe(100); // 파묻힘 → 그 구간 top
    expect(groundAt([], 0)).toBe(-1);
    expect(blocksAt(t.cols[0], 150)).toBe(true);
    expect(blocksAt(t.cols[0], 100)).toBe(false);
  });

  it('carveCircle — 바뀐 열만 새 배열, 범위 밖·빈 공간은 null', () => {
    const t = flat(500);
    const c = carveCircle(t, 1000, 500, 20);
    if (!c) throw new Error('파이지 않음');
    expect([c.x0, c.x1]).toEqual([980, 1020]);
    expect(c.terrain.cols[979]).toBe(t.cols[979]);
    expect(c.terrain.cols[1000]).toEqual([521, WORLD_HEIGHT]);
    expect(t.cols[1000]).toEqual([500, WORLD_HEIGHT]);
    expect(carveCircle(t, 1000, 100, 20)).toBeNull();
    expect(carveCircle(t, -100, 500, 20)).toBeNull();
  });
});

describe('정수 수학', () => {
  it('sin·cos 표 — 실제 값과 ±1 이내, 대칭', () => {
    for (let d = 0; d <= 180; d++) {
      expect(Math.abs(sinDeg(d) - Math.round(Math.sin((d * Math.PI) / 180) * 10000))).toBeLessThanOrEqual(1);
      expect(Math.abs(cosDeg(d) - Math.round(Math.cos((d * Math.PI) / 180) * 10000))).toBeLessThanOrEqual(1);
    }
    expect(sinDeg(30)).toBe(sinDeg(150));
    expect(cosDeg(60)).toBe(-cosDeg(120));
  });

  it('isqrt — 내림 제곱근', () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 101, 1e6, 2 ** 40 + 7]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
  });
});
