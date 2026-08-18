"use client";

import styles from "./header.module.scss";

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.logoMark}>
        <span className={styles.brandDot} />
        <span className={styles.brandTitle}>AADHAAR &#47;&#47; SECURE QR</span>
      </div>
    </header>
  );
}
