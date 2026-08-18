"use client";

import Header from "@/components/Header";
import Scanner from "@/components/Scanner";
import styles from "./page.module.scss";

export default function Home() {
  return (
    <div className={styles.container}>
      <div className={styles.glassOrb} />
      <Header />

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroTag}>UIDAI MARCH 2019 SPECIFICATION</div>
        <h1 className={styles.heroTitle}>
          Secure Aadhaar QR Code Reader & Demographic Extractor.
        </h1>
        <p className={styles.heroSubtitle}>
          Scan offline Aadhaar QR codes from e-Aadhaar PDFs or physical cards.
          Extract demographic data, resident JPEG 2000 photograph, and digital
          signature hashes directly in browser.
        </p>
      </section>

      {/* Scanner Section */}
      <section id="scanner" className={styles.scannerSection}>
        <Scanner />
      </section>

      {/* Technical Spec Section */}
      <section id="spec" className={styles.specSection}>
        <div className={styles.specHeader}>
          <h2>Technical Architecture & Data Pipeline</h2>
        </div>
        <div className={styles.specGrid}>
          <div className={styles.specCard}>
            <h3>01. DECOMPRESSION</h3>
            <p>
              Converts base10 BigInteger raw text payloads into decompressed
              byte arrays via GZIP / Deflate streams.
            </p>
          </div>
          <div className={styles.specCard}>
            <h3>02. DEMOGRAPHICS</h3>
            <p>
              Parses ISO-8859-1 byte array delimited by byte value 255 to
              extract Name, DoB, Gender, and 11 address fields.
            </p>
          </div>
          <div className={styles.specCard}>
            <h3>03. JP2000 PHOTO</h3>
            <p>
              Decodes embedded JPEG 2000 binary image stream directly to HTML5
              canvas and PNG data URL without external server calls.
            </p>
          </div>
          <div className={styles.specCard}>
            <h3>04. VERIFICATION</h3>
            <p>
              Extracts 256-byte UIDAI RSA digital signature and SHA-256
              mobile/email verification hashes for offline authenticity.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span>UIDAI SECURE QR VERIFIER &#47;&#47; CLIENT-SIDE ONLY</span>
        <span>Developed by Sahil Satpute</span>
      </footer>
    </div>
  );
}
