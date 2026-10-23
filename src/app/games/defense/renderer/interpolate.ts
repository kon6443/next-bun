/**
 * 틱 사이 보간 — 이전·현재 렌더 상태에서 id가 같은 엔티티 좌표를 alpha(0~1)만큼 섞는다
 * 두 목록 모두 id 오름차순(엔진 생성 순번)이라 한 번 훑기로 짝을 찾는다. 새로 생긴 것은 현재 좌표 그대로
 */

type Positioned = { id: number; x: number; y: number };

/** out[2i], out[2i+1] = curr[i]의 보간 좌표 — out이 작으면 키워서 돌려준다(커질 때만 할당) */
export function interpolatePositions(prev: readonly Positioned[], curr: readonly Positioned[], alpha: number, out: Float32Array): Float32Array {
  const target = out.length >= curr.length * 2 ? out : new Float32Array(Math.max(curr.length * 2, out.length * 2, 64));
  let j = 0;
  for (let i = 0; i < curr.length; i++) {
    const item = curr[i];
    while (j < prev.length && prev[j].id < item.id) j++;
    const before = j < prev.length && prev[j].id === item.id ? prev[j] : null;
    target[i * 2] = before ? before.x + (item.x - before.x) * alpha : item.x;
    target[i * 2 + 1] = before ? before.y + (item.y - before.y) * alpha : item.y;
  }
  return target;
}
