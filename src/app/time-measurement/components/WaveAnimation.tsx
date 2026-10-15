import styles from "./WaveAnimation.module.css";

interface AnimationProps {
  progress: number;
}

export default function WaveAnimation({ progress }: AnimationProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const amplitude = clamped / 100;

  // 막대 높이 비율(0~1)
  const bars = Array.from({ length: 5 }, (_, idx) => {
    const base = 0.25 + idx * 0.12;
    return (30 + amplitude * 70 * Math.abs(Math.sin(base * Math.PI))) / 100;
  });

  return (
    <div className={styles.waveBox}>
      <div className={styles.header}>
        <span className={styles.badge}>경과</span>
        <span className={styles.value}>{Math.round(clamped)}%</span>
      </div>
      <div className={styles.bars}>
        {bars.map((scale, idx) => (
          <span
            key={idx}
            className={styles.slot}
            style={{ transform: `scaleY(${scale})`, transitionDelay: `${idx * 40}ms` }}
          >
            <span className={styles.bar} />
          </span>
        ))}
      </div>
    </div>
  );
}

