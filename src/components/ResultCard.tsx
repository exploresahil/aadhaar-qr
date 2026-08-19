"use client";

import { useEffect, useMemo, useState } from "react";
import type { ParsedAadhaar } from "@/lib/aadhaar/parser";
import { decodeJp2kToDataUrl } from "@/utils/jp2k.util";
import styles from "./resultCard.module.scss";

interface ResultCardProps {
  readonly data: ParsedAadhaar;
  readonly rawText?: string;
  readonly onReset?: () => void;
}

/**
 * Calculates resident's age as raw number from DOB string
 */
function calculateAge(dob?: string): string | null {
  if (!dob) return null;
  const cleanDob = dob.trim();

  // Format: DD-MM-YYYY or DD/MM/YYYY
  const parts = cleanDob.split(/[-/]/);
  if (parts.length === 3) {
    const day = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10) - 1;
    const year = Number.parseInt(parts[2], 10);
    if (
      !Number.isNaN(year) &&
      year > 1900 &&
      year <= new Date().getFullYear()
    ) {
      const birthDate = new Date(year, month, day);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return String(age);
    }
  }

  // Format: YYYY
  if (/^\d{4}$/.test(cleanDob)) {
    const year = Number.parseInt(cleanDob, 10);
    const currentYear = new Date().getFullYear();
    if (year > 1900 && year <= currentYear) {
      return String(currentYear - year);
    }
  }

  return null;
}

export default function ResultCard({
  data,
  rawText,
  onReset,
}: ResultCardProps) {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const [asyncSigHash, setAsyncSigHash] = useState<string>("Calculating...");

  useEffect(() => {
    let isMounted = true;
    async function computeSha256() {
      const source = data.signatureHex || rawText || "";
      if (!source) {
        if (isMounted) setAsyncSigHash("N/A");
        return;
      }
      try {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest(
          "SHA-256",
          encoder.encode(source),
        );
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hex = hashArray
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (isMounted) setAsyncSigHash(hex);
      } catch {
        if (isMounted) setAsyncSigHash("N/A");
      }
    }
    computeSha256();
    return () => {
      isMounted = false;
    };
  }, [data.signatureHex, rawText]);

  const isXmlFormat = useMemo(() => {
    return data.version?.toLowerCase().includes("xml") ?? false;
  }, [data.version]);

  const maskedAadhaar = useMemo(() => {
    const ref = data.referenceId ? data.referenceId.trim() : "";
    if (!ref || ref === "UNVERIFIED") return "XXXX-XXXX-XXXX";

    if (isXmlFormat || /^\d{12}$/.test(ref)) {
      const last4 = ref.slice(-4);
      return `XXXX-XXXX-${last4}`;
    }

    const last4 = ref.slice(0, 4);
    return `XXXX-XXXX-${last4}`;
  }, [data.referenceId, isXmlFormat]);

  const ageDisplay = useMemo(() => {
    return calculateAge(data.dob);
  }, [data.dob]);

  const scanTimestampIst = useMemo(() => {
    return `${new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })} IST`;
  }, []);

  const photoUrl = useMemo(() => {
    if (!data.photo || data.photo.length === 0) return null;
    return decodeJp2kToDataUrl(data.photo);
  }, [data.photo]);

  const bitIndicatorLabel = useMemo(() => {
    switch (data.bitIndicator) {
      case 0:
        return "No Email / Mobile in Payload";
      case 1:
        return "Email Hash Present";
      case 2:
        return "Mobile Hash Present";
      case 3:
        return "Email & Mobile Hashes Present";
      default:
        return "Standard Payload";
    }
  }, [data.bitIndicator]);

  const genderDisplay = useMemo(() => {
    if (data.gender === "M") return "Male";
    if (data.gender === "F") return "Female";
    return data.gender || "—";
  }, [data.gender]);

  const fullAddress = useMemo(() => {
    const parts = [
      data.careOf ? `C/O: ${data.careOf}` : "",
      data.house,
      data.street,
      data.landmark,
      data.location,
      data.vtc,
      data.subDistrict,
      data.district,
      data.postOffice ? `PO: ${data.postOffice}` : "",
      data.state,
      data.pincode ? `PIN: ${data.pincode}` : "",
    ].filter(Boolean);
    return parts.join(", ");
  }, [data]);

  const handleCopyJson = async () => {
    try {
      const serializableData = {
        createdAt: scanTimestampIst,
        version: data.version || "V2/V3",
        maskedAadhaar,
        referenceId: data.referenceId,
        name: data.name,
        dob: data.dob,
        age: ageDisplay || "—",
        gender: genderDisplay,
        mobile: data.mobile || null,
        pincode: data.pincode,
        address: fullAddress,
        isVerified: data.isVerified !== false,
        signatureHex: data.signatureHex || null,
        signatureHash: asyncSigHash,
        hashMobile: data.hashMobile || null,
        hashEmail: data.hashEmail || null,
        rawPayload: rawText || null,
      };

      await navigator.clipboard.writeText(
        JSON.stringify(serializableData, null, 2),
      );
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleCopyPayload = async () => {
    if (!rawText) return;
    try {
      await navigator.clipboard.writeText(rawText);
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleCopyPlainText = async () => {
    try {
      const plainText = [
        `Name: ${data.name || "N/A"}`,
        `Format Version: ${data.version || "V2/V3"}`,
        `Aadhaar No: ${maskedAadhaar}`,
        `Reference ID: ${data.referenceId || "N/A"}`,
        `DOB: ${data.dob || "N/A"}`,
        `Age: ${ageDisplay || "N/A"}`,
        `Gender: ${genderDisplay}`,
        ...(data.mobile ? [`Mobile: ${data.mobile}`] : []),
        `PIN Code: ${data.pincode || "N/A"}`,
        `Address: ${fullAddress || "N/A"}`,
        `Verification: ${data.isVerified !== false ? "Verified Secure QR" : "Unverified QR"}`,
        `Digital Signature: ${data.signatureHex || "N/A"}`,
        `Signature Hash (SHA-256): ${asyncSigHash}`,
        `Scanned At: ${scanTimestampIst}`,
      ].join("\n");

      await navigator.clipboard.writeText(plainText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className={styles.container}>
      {/* Top Banner for Unverified / Unsecured QR */}
      {data.isVerified === false && (
        <div className={styles.unverifiedBanner}>
          <span className={styles.warningIcon}>⚠️</span>
          <div>
            <div className={styles.unverifiedTitle}>
              UNVERIFIED / UNSECURED AADHAAR QR
            </div>
            <div className={styles.unverifiedDesc}>
              This QR code uses legacy formatting or lacks UIDAI RSA digital
              signature verification. Data parsed below is not cryptographically
              authenticated.
            </div>
          </div>
        </div>
      )}

      {/* Hero Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.statusBadgeRow}>
            <span
              className={`${styles.badge} ${data.isVerified === false ? styles.badgeUnverified : styles.badgeVerified}`}
            >
              {data.isVerified === false
                ? `⚠️ UNVERIFIED (${data.version || "XML"})`
                : `✓ UIDAI SECURE VERIFIED (${data.version || "V2/V3"})`}
            </span>
            <span className={styles.timestampBadge}>
              🕒 {scanTimestampIst}
            </span>
          </div>

          <h2 className={styles.name}>{data.name || "Aadhaar Holder"}</h2>

          <div className={styles.refIdContainer}>
            <span className={styles.refIdLabel}>Aadhaar Number:</span>
            <code className={styles.refIdValue}>{maskedAadhaar}</code>
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopyJson}
          >
            {copiedJson ? "✓ Copied JSON" : "📋 Copy JSON"}
          </button>

          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopyPayload}
          >
            {copiedPayload ? "✓ Copied Payload" : "⚡ Copy Payload"}
          </button>

          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopyPlainText}
          >
            {copiedText ? "✓ Copied Text" : "📄 Copy Text"}
          </button>

          {onReset && (
            <button
              type="button"
              className={styles.resetBtn}
              onClick={onReset}
            >
              🔄 Scan Another
            </button>
          )}
        </div>
      </div>

      {/* Body 2-Column Grid */}
      <div className={styles.bodyGrid}>
        {/* Left Column: Resident Photo & Profile Cards */}
        <div className={styles.photoCol}>
          <div className={styles.photoFrame}>
            {photoUrl ? (
              // biome-ignore lint/performance/noImgElement: Data URL resident photo
              <img src={photoUrl} alt="Resident" className={styles.photoImg} />
            ) : (
              <div className={styles.photoFallback}>
                <div className={styles.photoIcon}>📷</div>
                <span>JP2000 Photo</span>
                <small>({data.photo?.length || 0} bytes stream)</small>
              </div>
            )}
          </div>

          <div className={styles.quickMetricsBox}>
            <div className={styles.metricPill}>
              <span className={styles.metricLabel}>GENDER</span>
              <span className={styles.metricVal}>{genderDisplay}</span>
            </div>
            <div className={styles.metricPill}>
              <span className={styles.metricLabel}>AGE</span>
              <span className={styles.metricVal}>
                {ageDisplay ? `${ageDisplay} Yrs` : "—"}
              </span>
            </div>
          </div>

          <div className={styles.indicatorBadge}>
            <span className={styles.indicatorDot} />
            {bitIndicatorLabel}
          </div>
        </div>

        {/* Right Column: Categorized Section Cards */}
        <div className={styles.infoCol}>
          {/* Section 1: Demographics */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardHeader}>
              <div className={styles.sectionIcon}>👤</div>
              <h3>Demographic Info</h3>
            </div>
            <div className={styles.fieldsGrid}>
              <div className={styles.fieldBox}>
                <span className={styles.fieldLabel}>Full Name</span>
                <span className={styles.fieldValue}>{data.name || "—"}</span>
              </div>
              <div className={styles.fieldBox}>
                <span className={styles.fieldLabel}>Date of Birth</span>
                <span className={styles.fieldValue}>{data.dob || "—"}</span>
              </div>
              <div className={styles.fieldBox}>
                <span className={styles.fieldLabel}>Age</span>
                <span className={styles.fieldValueHighlight}>
                  {ageDisplay ? `${ageDisplay} Years` : "—"}
                </span>
              </div>
              <div className={styles.fieldBox}>
                <span className={styles.fieldLabel}>Gender</span>
                <span className={styles.fieldValue}>{genderDisplay}</span>
              </div>
              {data.mobile && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>Mobile Number</span>
                  <span className={styles.fieldValueHighlight}>
                    {data.mobile}
                  </span>
                </div>
              )}
              <div className={styles.fieldBox}>
                <span className={styles.fieldLabel}>
                  {isXmlFormat
                    ? "Aadhaar UID (12-Digit)"
                    : "Reference ID"}
                </span>
                <code className={styles.fieldCode}>
                  {data.referenceId || "—"}
                </code>
              </div>
            </div>
          </div>

          {/* Section 2: Resident Address */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardHeader}>
              <div className={styles.sectionIcon}>📍</div>
              <h3>Resident Address</h3>
            </div>
            <div className={styles.fieldsGrid}>
              <div className={`${styles.fieldBox} ${styles.fullWidthField}`}>
                <span className={styles.fieldLabel}>Full Address</span>
                <span className={styles.fieldValue}>{fullAddress || "—"}</span>
              </div>
              {data.house && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>House / Flat No</span>
                  <span className={styles.fieldValue}>{data.house}</span>
                </div>
              )}
              {data.street && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>Street / Road</span>
                  <span className={styles.fieldValue}>{data.street}</span>
                </div>
              )}
              {data.landmark && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>Landmark</span>
                  <span className={styles.fieldValue}>{data.landmark}</span>
                </div>
              )}
              {data.location && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>Location</span>
                  <span className={styles.fieldValue}>{data.location}</span>
                </div>
              )}
              {data.vtc && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>City / VTC</span>
                  <span className={styles.fieldValue}>{data.vtc}</span>
                </div>
              )}
              {data.subDistrict && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>Sub-District</span>
                  <span className={styles.fieldValue}>{data.subDistrict}</span>
                </div>
              )}
              {data.district && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>District</span>
                  <span className={styles.fieldValue}>{data.district}</span>
                </div>
              )}
              {data.state && (
                <div className={styles.fieldBox}>
                  <span className={styles.fieldLabel}>State</span>
                  <span className={styles.fieldValue}>{data.state}</span>
                </div>
              )}
              <div className={styles.fieldBox}>
                <span className={styles.fieldLabel}>PIN Code</span>
                <span className={styles.fieldValueHighlight}>
                  {data.pincode || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Security & Cryptography */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardHeader}>
              <div className={styles.sectionIcon}>🔒</div>
              <h3>Security & Cryptography</h3>
            </div>
            <div className={styles.fieldsGrid}>
              <div className={`${styles.fieldBox} ${styles.fullWidthField}`}>
                <span className={styles.fieldLabel}>
                  SHA-256 Signature Hash (Client-Side)
                </span>
                <code className={styles.fieldCode}>{asyncSigHash}</code>
              </div>
              {data.signatureHex && (
                <div className={`${styles.fieldBox} ${styles.fullWidthField}`}>
                  <span className={styles.fieldLabel}>
                    UIDAI 256-Byte RSA Digital Signature
                  </span>
                  <code className={styles.fieldCodeScroll}>
                    {data.signatureHex}
                  </code>
                </div>
              )}
              {data.hashMobile && (
                <div className={`${styles.fieldBox} ${styles.fullWidthField}`}>
                  <span className={styles.fieldLabel}>Mobile Hash (SHA-256)</span>
                  <code className={styles.fieldCode}>{data.hashMobile}</code>
                </div>
              )}
              {data.hashEmail && (
                <div className={`${styles.fieldBox} ${styles.fullWidthField}`}>
                  <span className={styles.fieldLabel}>Email Hash (SHA-256)</span>
                  <code className={styles.fieldCode}>{data.hashEmail}</code>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics Accordion */}
      <div className={styles.diagnosticsSection}>
        <button
          type="button"
          className={`${styles.diagnosticsToggleBtn} ${
            showDiagnostics ? styles.diagnosticsActiveBtn : ""
          }`}
          onClick={() => setShowDiagnostics((prev) => !prev)}
        >
          <div className={styles.diagnosticsBtnLeft}>
            <div className={styles.diagnosticsIconBadge}>🔬</div>
            <div className={styles.diagnosticsBtnTitleGroup}>
              <span className={styles.diagnosticsBtnTitle}>
                Raw Payload & Technical Diagnostics
              </span>
              <span className={styles.diagnosticsVersionTag}>
                {data.version || "SECURE QR"}
              </span>
            </div>
          </div>

          <div className={styles.diagnosticsChevronBadge}>
            <span>{showDiagnostics ? "Collapse" : "Inspect Raw Payload"}</span>
            <svg
              className={`${styles.chevronSvg} ${
                showDiagnostics ? styles.chevronRotated : ""
              }`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="Toggle diagnostics chevron"
            >
              <title>Toggle diagnostics chevron</title>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        <div
          className={`${styles.diagnosticsAccordionWrapper} ${
            showDiagnostics ? styles.accordionOpen : styles.accordionClosed
          }`}
        >
          <div className={styles.diagnosticsAccordionInner}>
            <div className={styles.diagnosticsContent}>
              {rawText && (
                <div className={styles.rawTextCard}>
                  <div className={styles.rawTextHeader}>
                    <label htmlFor="diagnostics-raw-payload">
                      Raw QR Payload String ({rawText.length} Chars):
                    </label>
                    <button
                      type="button"
                      className={styles.rawCopyBtn}
                      onClick={handleCopyPayload}
                    >
                      {copiedPayload ? "✓ Copied Payload" : "📋 Copy Payload"}
                    </button>
                  </div>
                  <textarea
                    id="diagnostics-raw-payload"
                    readOnly
                    rows={4}
                    value={rawText}
                    className={styles.rawTextarea}
                  />
                </div>
              )}

              <div className={styles.fieldsTableWrapper}>
                <div className={styles.tableHeaderBar}>
                  <h4>Parsed Fields & Metadata Registry</h4>
                </div>
                <table className={styles.fieldsTable}>
                  <colgroup>
                    <col className={styles.colField} />
                    <col className={styles.colProperty} />
                    <col className={styles.colValue} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Field Name</th>
                      <th>Schema Property</th>
                      <th>Parsed Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <code>Header / Version</code>
                      </td>
                      <td>version</td>
                      <td>
                        <strong>{data.version || "V2/V3"}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>Bit Indicator</code>
                      </td>
                      <td>bitIndicator</td>
                      <td>{data.bitIndicator}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>Reference ID</code>
                      </td>
                      <td>referenceId</td>
                      <td>
                        <code>{data.referenceId || "—"}</code>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>Name</code>
                      </td>
                      <td>name</td>
                      <td>{data.name || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>DOB</code>
                      </td>
                      <td>dob</td>
                      <td>{data.dob || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>Gender</code>
                      </td>
                      <td>gender</td>
                      <td>{data.gender || "—"}</td>
                    </tr>
                    {data.mobile && (
                      <tr>
                        <td>
                          <code>Mobile</code>
                        </td>
                        <td>mobile</td>
                        <td>
                          <strong>{data.mobile}</strong>
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td>
                        <code>Care Of</code>
                      </td>
                      <td>careOf</td>
                      <td>{data.careOf || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>District</code>
                      </td>
                      <td>district</td>
                      <td>{data.district || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>Landmark</code>
                      </td>
                      <td>landmark</td>
                      <td>{data.landmark || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>House</code>
                      </td>
                      <td>house</td>
                      <td>{data.house || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>Location</code>
                      </td>
                      <td>location</td>
                      <td>{data.location || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>PIN Code</code>
                      </td>
                      <td>pincode</td>
                      <td>{data.pincode || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>Post Office</code>
                      </td>
                      <td>postOffice</td>
                      <td>{data.postOffice || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>State</code>
                      </td>
                      <td>state</td>
                      <td>{data.state || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>Street</code>
                      </td>
                      <td>street</td>
                      <td>{data.street || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>Sub District</code>
                      </td>
                      <td>subDistrict</td>
                      <td>{data.subDistrict || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>VTC</code>
                      </td>
                      <td>vtc</td>
                      <td>{data.vtc || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        <code>JP2000 Photo</code>
                      </td>
                      <td>photo</td>
                      <td>{data.photo?.length || 0} bytes binary stream</td>
                    </tr>
                    <tr>
                      <td>
                        <code>Signature Hash</code>
                      </td>
                      <td>signatureHash</td>
                      <td>
                        <code>{asyncSigHash}</code>
                        <small
                          style={{
                            display: "block",
                            color: "#6e6e73",
                            marginTop: "2px",
                          }}
                        >
                          (Computed client-side via SHA-256 for DB indexing)
                        </small>
                      </td>
                    </tr>
                    {data.signatureHex && (
                      <tr>
                        <td>
                          <code>RSA Signature</code>
                        </td>
                        <td>signatureHex</td>
                        <td>
                          <code>{data.signatureHex.slice(0, 40)}...</code>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
