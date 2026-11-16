import type { Quality } from "./backdrop";
import { createJankJudge } from "./jankJudge";

/** 그리기 시간 지수 평균이 이 ms를 넘는 프레임이 */
const SLOW_DRAW_MS = 8;
/** 이만큼 이어지면 품질을 낮춘다 */
const SLOW_FRAMES_TO_DROP = 90;

/**
 * 전장 품질 자동 하향 — 한 번 low가 되면 그 경기 동안 그대로
 * - 그리기 시간(지수 평균)으로 판단한다(저전력 모드처럼 프레임만 30Hz로 묶인 기기를 느린 기기로 오인하지 않게)
 * - 프레임 간격(jankJudge)으로도 본다(그리기는 짧은데 래스터·합성이 느린 기기). 후처리(glow)가 켜져 있으면 그것부터 끄라고(glowSlow) 알리고 판정을 새로 시작 —
 *   glow가 꺼진 뒤에도 밀리면 그때 전장 품질을 낮춘다
 */
export function createQualityJudge() {
  let quality: Quality = "high";
  let drawAvg = 0;
  let slowFrames = 0;
  let jank = createJankJudge();
  let glowSlow = false;
  return {
    get quality() {
      return quality;
    },
    /** 후처리가 켜진 동안 프레임이 밀렸다 — 다음 프레임에 후처리에 알린다 */
    get glowSlow() {
      return glowSlow;
    },
    /** 한 프레임을 그린 뒤 — gapMs는 지난 프레임과의 간격(첫 프레임은 null) */
    push({ drawMs, gapMs, hidden, glowOn }: { drawMs: number; gapMs: number | null; hidden: boolean; glowOn: boolean }): void {
      drawAvg = drawAvg * 0.95 + drawMs * 0.05;
      slowFrames = drawAvg > SLOW_DRAW_MS ? slowFrames + 1 : 0;
      if (slowFrames > SLOW_FRAMES_TO_DROP) quality = "low";
      if (gapMs !== null && !hidden && jank.push(gapMs)) {
        if (glowOn) {
          glowSlow = true;
          jank = createJankJudge();
        } else quality = "low";
      }
      if (!glowOn) glowSlow = false;
    },
  };
}
