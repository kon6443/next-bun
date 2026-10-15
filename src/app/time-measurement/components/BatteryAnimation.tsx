import styles from "./BatteryAnimation.module.css";

interface AnimationProps {
  progress: number; // 0 to 100 (경과)
}

/** 남은 비율에 따른 색 단계 — 그라데이션은 transition 되지 않아 단계별 레이어를 opacity 로 교차한다 */
function levelTone(remaining: number): "high" | "mid" | "low" {
  if (remaining < 20) return "low";
  if (remaining < 50) return "mid";
  return "high";
}

export default function BatteryAnimation({ progress }: AnimationProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  // 배터리는 남은 양을 보여 준다 — 채움과 숫자가 같은 값을 가리킨다
  const remaining = 100 - clampedProgress;
  const tone = levelTone(remaining);

  return (
    <div className={styles.wrapper}>
      <div className={styles.battery}>
        {/* 높이 대신 clip-path 로 잘라 매 초 레이아웃을 다시 계산하지 않는다 */}
        <div className={styles.level} style={{ clipPath: `inset(${100 - remaining}% 0 0 0 round 18px)` }}>
          <div className={`${styles.tone} ${styles.toneHigh}`} style={{ opacity: tone === "high" ? 1 : 0 }} />
          <div className={`${styles.tone} ${styles.toneMid}`} style={{ opacity: tone === "mid" ? 1 : 0 }} />
          <div className={`${styles.tone} ${styles.toneLow}`} style={{ opacity: tone === "low" ? 1 : 0 }} />
        </div>
        <div className={styles.glow} />
        <div className={styles.readout}>
          <span className={styles.percent}>{Math.round(remaining)}%</span>
          <span className={styles.label}>남음</span>
        </div>
      </div>
    </div>
  );
}
