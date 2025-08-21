
import styles from './WindowAnimation.module.css';

interface AnimationProps {
  progress: number; // 0 to 100
}

export default function WindowAnimation({ progress }: AnimationProps) {
  // Simple gradient change from day to night
  const skyColor1 = `hsl(210, 100%, ${90 - progress * 0.4}%)`; // Light blue to dark blue
  const skyColor2 = `hsl(280, 100%, ${80 - progress * 0.7}%)`; // Light purple to dark purple
  const opacity = progress / 100;

  return (
    <div className={styles.windowFrame}>
      <div className={styles.view} style={{ background: `linear-gradient(to bottom, ${skyColor1}, ${skyColor2})` }}>
        <div className={styles.cityscape} style={{ opacity: opacity }}></div>
      </div>
    </div>
  );
}
