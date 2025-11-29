import styles from "./OrbitAnimation.module.css";

interface AnimationProps {
  progress: number;
}

export default function OrbitAnimation({ progress }: AnimationProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const angle = (clamped / 100) * 360;

  return (
    <div className={styles.scene}>
      <div className={styles.orbit} style={{ transform: `rotate(${angle}deg)` }}>
        <span className={styles.satellite} />
      </div>
      <div className={styles.core}>
        <span className={styles.percent}>{Math.round(clamped)}%</span>
        <span className={styles.label}>orbit</span>
      </div>
    </div>
  );
}

