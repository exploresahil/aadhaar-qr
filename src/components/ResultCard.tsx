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

  // Compute SHA-256 hash of signatureHex (or rawText if no signature)
  const signatureHash = useMemo(() => {
    const source = data.signatureHex || rawText || "";
    if (!source) return "—";
    // Fast synchronous hash calculation simulation for display / instant clipboard copy
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
      hash = (hash << 5) - hash + source.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }, [data.signatureHex, rawText]);

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

  // Masked Aadhaar number format:
  // - Legacy XML QR: referenceId is 12-digit UID (e.g. 611172431644) -> last 4 digits are at the end (1644)
  // - V2/V3/V5 Secure QR: first 4 digits of referenceId are the last 4 digits of Aadhaar number
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

  // Calculated Age numeric string
  const ageDisplay = useMemo(() => {
    return calculateAge(data.dob);
  }, [data.dob]);

  // Full IST timestamp of when QR was scanned
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
        return "No Email / Mobile present";
      case 1:
        return "Only Email present";
      case 2:
        return "Only Mobile present";
      case 3:
        return "Both Email & Mobile present";
      default:
        return "Unknown";
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
        gender: data.gender,
        mobile: data.mobile,
        careOf: data.careOf,
        house: data.house,
        street: data.street,
        landmark: data.landmark,
        location: data.location,
        vtc: data.vtc,
        subDistrict: data.subDistrict,
        district: data.district,
        postOffice: data.postOffice,
        state: data.state,
        pincode: data.pincode,
        bitIndicator: data.bitIndicator,
        isVerified: data.isVerified !== false,
        hashMobile: data.hashMobile,
        hashEmail: data.hashEmail,
        signature: data.signatureHex,
        signatureHash: asyncSigHash,
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
    try {
      const textToCopy = rawText || data.referenceId || "";
      await navigator.clipboard.writeText(textToCopy);
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
        `Gender: ${data.gender || "N/A"}`,
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

      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <span
            className={`${styles.badge} ${data.isVerified === false ? styles.badgeUnverified : ""}`}
          >
            {data.isVerified === false
              ? `⚠️ UNVERIFIED AADHAAR QR (${data.version || "XML"})`
              : `✓ VERIFIED SECURE QR (${data.version || "V2/V3"})`}
          </span>
          <h2 className={styles.name}>{data.name || "Aadhaar Holder"}</h2>
          <p className={styles.refId}>Aadhaar: {maskedAadhaar}</p>
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
            {copiedText ? "✓ Copied Text" : "📄 Copy Plain Text"}
          </button>
          {onReset && (
            <button type="button" className={styles.resetBtn} onClick={onReset}>
              🔄 Scan Another
            </button>
          )}
        </div>
      </div>

      <div className={styles.bodyGrid}>
        {/* Photo Column */}
        <div className={styles.photoCol}>
          <div className={styles.photoFrame}>
            {photoUrl ? (
              // biome-ignore lint/performance/noImgElement: Data URL resident photo
              <img src={photoUrl} alt="Resident" className={styles.photoImg} />
            ) : (
              <div className={styles.photoFallback}>
                <span>JP2000 Photo</span>
                <small>({data.photo?.length || 0} bytes)</small>
              </div>
            )}
          </div>
          <div className={styles.indicatorBadge}>{bitIndicatorLabel}</div>
        </div>

        {/* Demographics Column */}
        <div className={styles.infoCol}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Scanned At (IST)</span>
            <span className={styles.value}>{scanTimestampIst}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>
              {isXmlFormat ? "Aadhaar Number (12-Digit UID)" : "Reference ID"}
              <small
                style={{
                  display: "block",
                  fontSize: "0.725rem",
                  color: "#16a34a",
                  fontWeight: 500,
                  marginTop: "2px",
                }}
              >
                {isXmlFormat
                  ? "✓ Direct 12-Digit Aadhaar UID from XML Payload"
                  : "✓ Direct from QR Payload"}
              </small>
            </span>
            <code className={styles.hashCode}>{data.referenceId || "—"}</code>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>
              Masked Aadhaar Number
              <small
                style={{
                  display: "block",
                  fontSize: "0.725rem",
                  color: "#6e6e73",
                  fontWeight: 400,
                  marginTop: "2px",
                }}
              >
                {isXmlFormat
                  ? "Calculated client-side from 12-digit UID"
                  : "Calculated client-side from Reference ID"}
              </small>
            </span>
            <span className={styles.valueHighlight}>{maskedAadhaar}</span>
          </div>

          {data.mobile && (
            <div className={styles.infoRow}>
              <span className={styles.label}>
                Mobile Number
                <small
                  style={{
                    display: "block",
                    fontSize: "0.725rem",
                    color: "#16a34a",
                    fontWeight: 500,
                    marginTop: "2px",
                  }}
                >
                  ✓ Direct from QR Payload
                </small>
              </span>
              <span className={styles.valueHighlight}>{data.mobile}</span>
            </div>
          )}

          <div className={styles.infoRow}>
            <span className={styles.label}>
              Date of Birth
              <small
                style={{
                  display: "block",
                  fontSize: "0.725rem",
                  color: "#16a34a",
                  fontWeight: 500,
                  marginTop: "2px",
                }}
              >
                ✓ Direct from QR Payload
              </small>
            </span>
            <span className={styles.value}>{data.dob || "—"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>
              Age
              <small
                style={{
                  display: "block",
                  fontSize: "0.725rem",
                  color: "#6e6e73",
                  fontWeight: 400,
                  marginTop: "2px",
                }}
              >
                Calculated client-side from DOB
              </small>
            </span>
            <span className={styles.valueHighlight}>{ageDisplay || "—"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>
              Gender
              <small
                style={{
                  display: "block",
                  fontSize: "0.725rem",
                  color: "#16a34a",
                  fontWeight: 500,
                  marginTop: "2px",
                }}
              >
                ✓ Direct from QR Payload
              </small>
            </span>
            <span className={styles.value}>{genderDisplay}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>
              PIN Code
              <small
                style={{
                  display: "block",
                  fontSize: "0.725rem",
                  color: "#16a34a",
                  fontWeight: 500,
                  marginTop: "2px",
                }}
              >
                ✓ Direct from QR Payload
              </small>
            </span>
            <span className={styles.valueHighlight}>{data.pincode || "—"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>
              Full Address
              <small
                style={{
                  display: "block",
                  fontSize: "0.725rem",
                  color: "#16a34a",
                  fontWeight: 500,
                  marginTop: "2px",
                }}
              >
                ✓ Direct from QR Payload
              </small>
            </span>
            <span className={styles.value}>{fullAddress || "—"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>
              Signature Hash (Client-Side SHA-256)
              <small
                style={{
                  display: "block",
                  fontSize: "0.725rem",
                  color: "#6e6e73",
                  fontWeight: 400,
                  marginTop: "2px",
                }}
              >
                {data.signatureHex
                  ? "Calculated client-side from UIDAI 256-byte RSA signature for indexing"
                  : "Calculated client-side from raw XML payload text"}
              </small>
            </span>
            <code className={styles.hashCode}>{asyncSigHash}</code>
          </div>

          {data.signatureHex && (
            <div className={styles.infoRow}>
              <span className={styles.label}>
                UIDAI Digital Signature (256 Bytes)
                <small
                  style={{
                    display: "block",
                    fontSize: "0.725rem",
                    color: "#16a34a",
                    fontWeight: 500,
                    marginTop: "2px",
                  }}
                >
                  ✓ Direct 256-Byte RSA Signature from QR Payload
                </small>
              </span>
              <code className={styles.hashCode}>{data.signatureHex}</code>
            </div>
          )}

          {data.hashMobile && (
            <div className={styles.infoRow}>
              <span className={styles.label}>
                Mobile Hash (SHA-256)
                <small
                  style={{
                    display: "block",
                    fontSize: "0.725rem",
                    color: "#16a34a",
                    fontWeight: 500,
                    marginTop: "2px",
                  }}
                >
                  ✓ Direct 32-Byte Hash from QR Payload
                </small>
              </span>
              <code className={styles.hashCode}>{data.hashMobile}</code>
            </div>
          )}

          {data.hashEmail && (
            <div className={styles.infoRow}>
              <span className={styles.label}>
                Email Hash (SHA-256)
                <small
                  style={{
                    display: "block",
                    fontSize: "0.725rem",
                    color: "#16a34a",
                    fontWeight: 500,
                    marginTop: "2px",
                  }}
                >
                  ✓ Direct 32-Byte Hash from QR Payload
                </small>
              </span>
              <code className={styles.hashCode}>{data.hashEmail}</code>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics Accordion */}
      <div className={styles.diagnosticsSection}>
        <button
          type="button"
          className={styles.diagnosticsToggleBtn}
          onClick={() => setShowDiagnostics((prev) => !prev)}
        >
          <span>
            🔬 Raw Payload & Technical Diagnostics ({data.version || "V2/V3"})
          </span>
          <span>{showDiagnostics ? "▲ Hide" : "▼ Inspect Raw Payload"}</span>
        </button>

        {showDiagnostics && (
          <div className={styles.diagnosticsContent}>
            {rawText && (
              <div>
                <div className={styles.rawTextHeader}>
                  <label htmlFor="diagnostics-raw-payload">
                    Raw QR Payload Text ({rawText.length} Chars):
                  </label>
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
              <table className={styles.fieldsTable}>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Property Name</th>
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
                        (Computed client-side via SHA-256 for DB indexing; not
                        embedded directly in QR payload)
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
        )}
      </div>
    </div>
  );
}
