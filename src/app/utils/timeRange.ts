/**
 * 시간 측정(/time-measurement) 계산 — 시작·종료 시각("HH:MM")과 현재 시각으로 진행 상태를 구한다
 *
 * 화면 표시와 분리된 순수 함수라 경계값(시작 전·종료 후·야간·시작=종료)을 테스트로 고정한다.
 */

/**
 * "H:MM" 또는 "HH:MM" → "HH:MM". 형식이 틀리거나 비어 있으면 null
 * (`<input type="time">`은 "09:00" 형식만 받아 "9:00"을 그대로 넣으면 빈칸으로 보인다)
 */
export function normalizeTimeValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export type TimeRangeState =
  /** 시작과 종료가 같아 구간을 만들 수 없다 */
  | { phase: 'invalid' }
  | { phase: 'before'; untilStartMs: number; totalMs: number }
  | { phase: 'running'; progress: number; remainingMs: number; elapsedMs: number; totalMs: number }
  | { phase: 'done'; totalMs: number };

/** 그날 자정 기준 "HH:MM" 시각 (로컬) */
function atTime(base: Date, hhmm: string, dayOffset = 0): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, m, 0, 0);
  return d.getTime();
}

/**
 * 현재 시각의 진행 상태
 * - 종료 ≤ 시작이면 야간 구간으로 보고 종료를 다음 날로 해석한다 (예: 22:00 → 06:00)
 * - 야간 구간은 자정을 넘긴 새벽(전날 시작한 구간 안)도 진행 중으로 본다
 * - 시작 = 종료는 invalid
 *
 * @param startTime "HH:MM" (normalizeTimeValue 통과 값)
 * @param endTime "HH:MM"
 */
export function computeTimeRangeState(now: Date, startTime: string, endTime: string): TimeRangeState {
  if (startTime === endTime) return { phase: 'invalid' };

  const nowMs = now.getTime();
  const isOvernight = endTime < startTime;
  const totalMs = atTime(now, endTime, isOvernight ? 1 : 0) - atTime(now, startTime);

  // 오늘 시작하는 구간과, 야간이면 어제 시작해 오늘 끝나는 구간
  const windows = [{ start: atTime(now, startTime), end: atTime(now, endTime, isOvernight ? 1 : 0) }];
  if (isOvernight) windows.unshift({ start: atTime(now, startTime, -1), end: atTime(now, endTime) });

  for (const { start, end } of windows) {
    if (nowMs >= start && nowMs < end) {
      const elapsedMs = nowMs - start;
      return {
        phase: 'running',
        progress: Math.min(100, Math.max(0, (elapsedMs / (end - start)) * 100)),
        remainingMs: end - nowMs,
        elapsedMs,
        totalMs: end - start,
      };
    }
  }

  const todayStart = atTime(now, startTime);
  if (nowMs < todayStart) return { phase: 'before', untilStartMs: todayStart - nowMs, totalMs };
  return { phase: 'done', totalMs };
}

/** ms → { hours, minutes, seconds } (내림, 음수는 0) */
export function splitDuration(ms: number): { hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}
