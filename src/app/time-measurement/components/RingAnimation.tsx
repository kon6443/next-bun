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
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
        </defs>
        <circle
          className={styles.track}
          cx="80"
          cy="80"
          r={radius}
          strokeWidth="10"
        />
        <circle
          className={styles.progress}
          cx="80"
          cy="80"
          r={radius}
          strokeWidth="10"
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

