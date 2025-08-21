
import styles from './HourglassAnimation.module.css';

interface AnimationProps {
  progress: number; // 0 to 100
}

export default function HourglassAnimation({ progress }: AnimationProps) {
  const sandHeight = 100 - progress;

  return (
    <div className={styles.hourglass}>
      <div className={styles.top}>
        <div className={styles.sand} style={{ height: `${sandHeight}%` }}></div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.sand} style={{ height: `${progress}%` }}></div>
      </div>
    </div>
  );
}
