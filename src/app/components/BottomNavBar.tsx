import Link from "next/link";
import styles from "./BottomNavBar.module.css";

const BottomNavBar = () => {
  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.link}>
        Home
      </Link>
      <Link href="/teams" className={styles.link}>
        Teams
      </Link>
      <Link href="/services" className={styles.link}>
        Services
      </Link>
      <Link href="/mypage" className={styles.link}>
        My page
      </Link>
    </nav>
  );
};

export default BottomNavBar;
