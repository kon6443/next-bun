
import styles from './SunMoonAnimation.module.css';

interface AnimationProps {
  progress: number; // 0 to 100
}

export default function SunMoonAnimation({ progress }: AnimationProps) {
  // Progress(0~100) to degree(0~180)
  const rotation = (progress / 100) * 180;
  // As progress increases, background gets darker
  const backgroundColor = `hsl(210, 50%, ${95 - progress / 2}%)`;
  // Sun color changes from yellow to orange
  const sunColor = `hsl(50, 100%, ${50 + progress / 5}%)`;

  return (
    <div className={styles.container} style={{ backgroundColor }}>
      <div className={styles.path} style={{ transform: `rotate(${rotation}deg)` }}>
        <div className={styles.sun} style={{ backgroundColor: sunColor }}></div>
      </div>
      <div className={styles.horizon}></div>
    </div>
  );
}
