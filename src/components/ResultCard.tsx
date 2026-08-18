"use client";

import type { ParsedAadhaar } from "@/lib/aadhaar/parser";
import { decodeJp2kToDataUrl } from "@/utils/jp2k.util";
import { useMemo, useState } from "react";
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

  // Masked Aadhaar number format (First 4 digits of referenceId = last 4 digits of Aadhaar number: XXXX-XXXX-1234)
  const maskedAadhaar = useMemo(() => {
    const ref = data.referenceId ? data.referenceId.trim() : "";
    const last4 = ref ? ref.slice(0, 4) : "XXXX";
    return `XXXX-XXXX-${last4}`;
  }, [data.referenceId]);

  // Calculated Age numeric string
  const ageDisplay = useMemo(() => {
    return calculateAge(data.dob);
  }, [data.dob]);

  // Full IST timestamp of when QR was scanned
  const scanTimestampIst = useMemo(() => {
    return (
      new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }) + " IST"
    );
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
        maskedAadhaar,
        referenceId: data.referenceId,
        name: data.name,
        dob: data.dob,
        age: ageDisplay || "—",
        gender: data.gender,
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
        `Aadhaar No: ${maskedAadhaar}`,
        `Reference ID: ${data.referenceId || "N/A"}`,
        `DOB: ${data.dob || "N/A"}`,
        `Age: ${ageDisplay || "N/A"}`,
        `Gender: ${data.gender || "N/A"}`,
        `PIN Code: ${data.pincode || "N/A"}`,
        `Address: ${fullAddress || "N/A"}`,
        `Verification: ${data.isVerified !== false ? "Verified Secure QR" : "Unverified QR"}`,
        `Digital Signature: ${data.signatureHex || "N/A"}`,
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
              ? "⚠️ UNVERIFIED AADHAAR QR"
              : "✓ VERIFIED SECURE QR"}
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
              Scan Another
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
            <span className={styles.label}>Reference ID</span>
            <code className={styles.hashCode}>{data.referenceId || "—"}</code>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Masked Aadhaar Number</span>
            <span className={styles.valueHighlight}>{maskedAadhaar}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Date of Birth</span>
            <span className={styles.value}>{data.dob || "—"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Age</span>
            <span className={styles.valueHighlight}>{ageDisplay || "—"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Gender</span>
            <span className={styles.value}>{genderDisplay}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>PIN Code</span>
            <span className={styles.valueHighlight}>{data.pincode || "—"}</span>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.label}>Full Address</span>
            <span className={styles.value}>{fullAddress || "—"}</span>
          </div>

          {data.signatureHex && (
            <div className={styles.infoRow}>
              <span className={styles.label}>
                UIDAI Digital Signature (256 Bytes)
              </span>
              <code className={styles.hashCode}>{data.signatureHex}</code>
            </div>
          )}

          {data.hashMobile && (
            <div className={styles.infoRow}>
              <span className={styles.label}>Mobile Hash (SHA-256)</span>
              <code className={styles.hashCode}>{data.hashMobile}</code>
            </div>
          )}

          {data.hashEmail && (
            <div className={styles.infoRow}>
              <span className={styles.label}>Email Hash (SHA-256)</span>
              <code className={styles.hashCode}>{data.hashEmail}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
