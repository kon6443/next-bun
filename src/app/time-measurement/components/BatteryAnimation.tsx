
import styles from "./BatteryAnimation.module.css";

interface AnimationProps {
  progress: number; // 0 to 100
}

export default function BatteryAnimation({ progress }: AnimationProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const remaining = 100 - clampedProgress;

  let gradient = "linear-gradient(180deg, #34d399, #14b8a6)";
  if (remaining < 50) {
    gradient = "linear-gradient(180deg, #fbbf24, #f97316)";
  }
  if (remaining < 20) {
    gradient = "linear-gradient(180deg, #f87171, #ef4444)";
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.battery}>
        <div
          className={styles.level}
          style={{ height: `${remaining}%`, background: gradient }}
        />
        <div className={styles.glow} />
        <div className={styles.readout}>
          <span className={styles.percent}>{Math.round(clampedProgress)}%</span>
          <span className={styles.label}>charge</span>
        </div>
      </div>
    </div>
  );
}
