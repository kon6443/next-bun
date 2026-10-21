/**
 * 그래픽 품질 — 그리기 시간이 예산을 2초 넘게 계속 넘으면 한 단계씩 낮춘다 (§F10)
 * 단계: 0 전부 → 1 데미지 숫자 끔 → 2 파티클 절반 → 3 DPR 1.5 → 4 DPR 1. 자동 모드는 올리지 않는다(깜빡임 방지 — 설정에서 다시 고른다)
 */

export type QualityLevel = { damageNumbers: boolean; particleScale: number; dprCap: number };

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { damageNumbers: true, particleScale: 1, dprCap: 2 },
  { damageNumbers: false, particleScale: 1, dprCap: 2 },
  { damageNumbers: false, particleScale: 0.5, dprCap: 2 },
  { damageNumbers: false, particleScale: 0.5, dprCap: 1.5 },
  { damageNumbers: false, particleScale: 0.5, dprCap: 1 },
];

export type QualityMode = 'auto' | 'high' | 'low';

/** 60Hz 프레임 16.6ms 중 그리기 몫 (§F10 예산) */
export const DRAW_BUDGET_MS = 7;
const OVER_BUDGET_HOLD_MS = 2000;
/** 그리기 시간 이동평균 가중치 */
const EMA_WEIGHT = 0.1;

export class QualityController {
  level = 0;
  /** 그리기 시간 이동평균 (ms) */
  average = 0;
  private overSince = -1;

  constructor(public mode: QualityMode = 'auto', public budgetMs = DRAW_BUDGET_MS) {
    this.setMode(mode);
  }

  setMode(mode: QualityMode): void {
    this.mode = mode;
    this.level = mode === 'low' ? QUALITY_LEVELS.length - 1 : 0;
    this.overSince = -1;
  }

  get current(): QualityLevel {
    return QUALITY_LEVELS[this.level];
  }

  /** 프레임마다 그리기 시간을 넣는다 — 단계가 바뀌었으면 true */
  record(drawMs: number, nowMs: number): boolean {
    this.average = this.average === 0 ? drawMs : this.average + (drawMs - this.average) * EMA_WEIGHT;
    if (this.mode !== 'auto' || this.level >= QUALITY_LEVELS.length - 1) return false;
    if (this.average <= this.budgetMs) {
      this.overSince = -1;
      return false;
    }
    if (this.overSince < 0) this.overSince = nowMs;
    if (nowMs - this.overSince < OVER_BUDGET_HOLD_MS) return false;
    this.level += 1;
    this.overSince = -1;
    this.average = 0; // 낮춘 단계에서 새로 잰다
    return true;
  }
}
