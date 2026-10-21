/**
 * 리플레이 입력 로그 [deltaFrame, code, ...] → 프레임별 동작 (재생기용)
 * 엔진에는 simulateReplay와 같은 방식으로 프레임마다 stepFrame에 넘긴다
 */
export type ReplayTimeline = {
  /** 입력 i의 절대 프레임 */
  frames: Int32Array;
  codes: Int32Array;
};

export function buildTimeline(inputs: readonly number[]): ReplayTimeline {
  const count = Math.floor(inputs.length / 2);
  const frames = new Int32Array(count);
  const codes = new Int32Array(count);
  let frame = 0;
  for (let i = 0; i < count; i++) {
    frame += inputs[i * 2];
    frames[i] = frame;
    codes[i] = inputs[i * 2 + 1];
  }
  return { frames, codes };
}

/** cursor부터 frame에 해당하는 동작을 out에 담고 다음 cursor를 돌려준다 */
export function collectActions(timeline: ReplayTimeline, cursor: number, frame: number, out: number[]): number {
  out.length = 0;
  let i = cursor;
  while (i < timeline.frames.length && timeline.frames[i] === frame) {
    out.push(timeline.codes[i]);
    i++;
  }
  return i;
}
