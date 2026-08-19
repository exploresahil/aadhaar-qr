"use client";

import type { ScanResult } from "@/utils/qrScanner.util";
import styles from "./header.module.scss";

interface HeaderProps {
  readonly activeResult?: ScanResult | null;
}

export default function Header({ activeResult }: HeaderProps) {
  const isVerified = activeResult?.parsed?.isVerified;
  const version = activeResult?.parsed?.version;

  return (
    <header className={styles.headerContainer}>
      {/* Top Security Status Banner across whole app */}
      <div
        className={`${styles.securityBar} ${
          activeResult
            ? isVerified === false
              ? styles.securityUnverified
              : styles.securityVerified
            : styles.securityDefault
        }`}
      >
        <span className={styles.securityIcon}>
          {activeResult ? (isVerified === false ? "⚠️" : "🔒") : "🛡️"}
        </span>
        <div className={styles.securityTextGroup}>
          <span className={styles.securityTitle}>
            {activeResult
              ? isVerified === false
                ? `UNSECURED / UNVERIFIED AADHAAR QR (${version || "LEGACY XML"})`
                : `SECURED AADHAAR QR CODE (${version || "V2/V3/V5"})`
              : "UIDAI SECURE QR VERIFIER SYSTEM"}
          </span>
          <span className={styles.securityDesc}>
            {activeResult
              ? isVerified === false
                ? "Warning: Legacy payload or missing UIDAI RSA digital signature verification."
                : "✓ UIDAI 256-Byte RSA Cryptographic Digital Signature Verified & Authenticated."
              : "Automatic RSA Signature & Decompression Verification Active"}
          </span>
        </div>
      </div>

      <div className={styles.navRow}>
        <div className={styles.logoMark}>
          <span className={styles.brandDot} />
          <span className={styles.brandTitle}>
            AADHAAR &#47;&#47; SECURE QR
          </span>
        </div>
        <nav className={styles.nav}>
          <a href="#scanner" className={styles.navLink}>
            Scanner
          </a>
          <a href="#spec" className={styles.navLink}>
            Technical Specs
          </a>
        </nav>
      </div>
    </header>
  );
}
