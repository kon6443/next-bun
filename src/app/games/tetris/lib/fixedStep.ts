/**
 * 고정 스텝 시계 — 화면 프레임(rAF) 시각을 쌓아 60Hz 논리 프레임 수로 바꾼다 (FE-23: 싱글·대전·두 재생기가 같은 규칙을 쓴다)
 * 쌓기만 맡는다 — 몇 틱을 어떻게 돌릴지(멈춤 조건·끝)는 루프마다 다르다: `while (clock.acc >= FRAME_MS && ...) { 틱; clock.acc -= FRAME_MS }`
 */
export type FixedStepClock = { last: number; acc: number };

export function createClock(): FixedStepClock {
  return { last: 0, acc: 0 };
}

/**
 * 지난 시간을 쌓는다 — 한 번에 maxCatchUpMs까지만(탭이 오래 잠들면 수천 틱을 돌지 않게), 배속은 그다음에 곱한다
 * 멈췄다 다시 돌면 첫 프레임은 0부터(resetClock)
 */
export function advanceClock(clock: FixedStepClock, timestamp: number, maxCatchUpMs: number, speed = 1): void {
  if (clock.last === 0) clock.last = timestamp;
  clock.acc += Math.min(timestamp - clock.last, maxCatchUpMs) * speed;
  clock.last = timestamp;
}

/** 멈춘 동안 — 다시 돌 때 멈춘 시간을 따라잡지 않게 */
export function resetClock(clock: FixedStepClock): void {
  clock.last = 0;
  clock.acc = 0;
}
