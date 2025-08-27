
import styles from './BatteryAnimation.module.css';

interface AnimationProps {
  progress: number; // 0 to 100
}

export default function BatteryAnimation({ progress }: AnimationProps) {
  const chargeLevel = 100 - progress;
  let chargeColor = '#4ade80'; // Green
  if (chargeLevel < 50) chargeColor = '#facc15'; // Yellow
  if (chargeLevel < 20) chargeColor = '#f87171'; // Red

  return (
    <div className={styles.battery}>
      <div className={styles.level} style={{ height: `${chargeLevel}%`, backgroundColor: chargeColor }}></div>
    </div>
  );
}
