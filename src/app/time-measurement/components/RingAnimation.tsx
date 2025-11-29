import styles from "./RingAnimation.module.css";

interface AnimationProps {
  progress: number;
}

export default function RingAnimation({ progress }: AnimationProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={styles.ring}>
      <svg viewBox="0 0 160 160" className={styles.svg}>
        <circle
          className={styles.track}
          cx="80"
          cy="80"
          r={radius}
          strokeWidth="12"
        />
        <circle
          className={styles.progress}
          cx="80"
          cy="80"
          r={radius}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={styles.text}>
        <p className={styles.percent}>{Math.round(clamped)}%</p>
        <p className={styles.caption}>focus</p>
      </div>
    </div>
  );
}

