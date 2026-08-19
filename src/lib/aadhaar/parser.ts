export type BitIndicator = 0 | 1 | 2 | 3;

export interface ParsedAadhaar {
  bitIndicator: BitIndicator;
  referenceId: string;
  name: string;
  dob: string;
  gender: string;
  careOf: string;
  district: string;
  landmark: string;
  house: string;
  location: string;
  pincode: string;
  postOffice: string;
  state: string;
  street: string;
  subDistrict: string;
  vtc: string;
  photo: Uint8Array;
  hashEmail?: string;
  hashMobile?: string;
  mobile?: string;
  version?: string;
  signature?: Uint8Array;
  signatureHex?: string;
  isVerified?: boolean; // true = UIDAI Signed Secure QR, false = Legacy/Unverified QR
}

export class InvalidAadhaarQrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAadhaarQrError";
  }
}

const DELIMITER = 255;
const SIGNATURE_SIZE = 256;
const HASH_SIZE = 32;

const textDecoder = new TextDecoder("iso-8859-1");

function decodeText(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Parses legacy unverified XML Aadhaar QR payload (<PrintLetterBarcodeData ... />)
 */
export function parseLegacyXmlAadhaar(rawText: string): ParsedAadhaar | null {
  if (
    !rawText.includes("PrintLetterBarcodeData") &&
    !rawText.includes("uid=")
  ) {
    return null;
  }

  const getAttr = (attr: string): string => {
    const regex = new RegExp(`${attr}=(?:"|')([^"']*)(?:"|')`, "i");
    const match = regex.exec(rawText);
    return match ? match[1].trim() : "";
  };

  const uid = getAttr("uid");
  const name = getAttr("name");
  if (!name && !uid) return null;

  return {
    bitIndicator: 0,
    referenceId: uid || "UNVERIFIED",
    name: name || "Unknown Resident",
    dob: getAttr("dob") || getAttr("yob") || "—",
    gender: getAttr("gender") || "—",
    careOf: getAttr("co") || "—",
    district: getAttr("dist") || "—",
    landmark: getAttr("lm") || "—",
    house: getAttr("house") || "—",
    location: getAttr("loc") || "—",
    pincode: getAttr("pc") || getAttr("pincode") || "—",
    postOffice: getAttr("po") || "—",
    state: getAttr("state") || "—",
    street: getAttr("street") || "—",
    subDistrict: getAttr("subdist") || "—",
    vtc: getAttr("vtc") || "—",
    photo: new Uint8Array(0),
    version: "XML (Legacy)",
    isVerified: false, // Mark legacy XML as unverified
  };
}

/**
 * Parses binary V2/V3/V5 UIDAI Secure Aadhaar QR code
 */
export function parseAadhaarQr(data: Uint8Array): ParsedAadhaar {
  // 1. Find JPEG 2000 SOC marker (0xFF 0x4F) to locate photo start and separate text header
  let socIndex = -1;
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0xff && data[i + 1] === 0x4f) {
      socIndex = i;
      break;
    }
  }

  let textEnd = data.length;
  if (socIndex !== -1) {
    textEnd = data[socIndex - 1] === DELIMITER ? socIndex - 1 : socIndex;
  }

  const textBytes = data.subarray(0, textEnd);
  const segments: Uint8Array[] = [];
  let segmentStart = 0;

  for (let i = 0; i < textBytes.length; i++) {
    if (textBytes[i] === DELIMITER) {
      segments.push(textBytes.subarray(segmentStart, i));
      segmentStart = i + 1;
    }
  }
  if (segmentStart <= textBytes.length) {
    segments.push(textBytes.subarray(segmentStart));
  }

  if (segments.length === 0) {
    throw new InvalidAadhaarQrError("Empty Aadhaar QR payload text fields");
  }

  const firstField = decodeText(segments[0]).trim();
  const isV5 = firstField === "V5" || firstField.startsWith("V5");

  const version = isV5 ? "V5" : "V2/V3";
  const offset = isV5 ? 1 : 0; // Skip "V5" header field if present
  let bitIndicatorRaw = isV5
    ? segments.length > 1
      ? decodeText(segments[1])
      : "0"
    : firstField;

  // Fallback if bit indicator contains spaces or non-digit chars
  bitIndicatorRaw = bitIndicatorRaw.trim();
  if (!/^[0-3]$/.test(bitIndicatorRaw)) {
    bitIndicatorRaw = "0";
  }
  const bitIndicator = Number(bitIndicatorRaw) as BitIndicator;

  const getField = (idx: number): string => {
    return idx < segments.length ? decodeText(segments[idx]) : "";
  };

  const referenceId = getField(offset + 1);
  const name = getField(offset + 2);
  const dob = getField(offset + 3);
  const gender = getField(offset + 4);
  const careOf = getField(offset + 5);
  const district = getField(offset + 6);
  const landmark = getField(offset + 7);
  const house = getField(offset + 8);
  const location = getField(offset + 9);
  const pincode = getField(offset + 10);
  const postOffice = getField(offset + 11);
  const state = getField(offset + 12);
  const street = getField(offset + 13);
  const subDistrict = getField(offset + 14);
  const vtc = getField(offset + 15);
  const mobile =
    isV5 && segments.length > offset + 16 ? getField(offset + 16) : undefined;

  // 2. Signature and Hashes
  if (data.length < SIGNATURE_SIZE) {
    throw new InvalidAadhaarQrError(
      `Payload too short to contain digital signature: ${data.length} bytes`,
    );
  }

  const signature = data.subarray(data.length - SIGNATURE_SIZE);
  const signatureHex = toHex(signature);

  const hasEmail = bitIndicator === 1 || bitIndicator === 3;
  const hasMobile = bitIndicator === 2 || bitIndicator === 3;

  // 3. Photo Range Detection
  let photoStart = socIndex !== -1 ? socIndex : 0;
  if (socIndex === -1) {
    // Fallback: calculate photo start from delimiters count
    let delimsFound = 0;
    const targetDelimCount = isV5 ? 18 : 16;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === DELIMITER) {
        delimsFound++;
        if (delimsFound === targetDelimCount) {
          photoStart = i + 1;
          break;
        }
      }
    }
  }

  // Find JPEG 2000 EOC marker (0xFF 0xD9)
  let eocIndex = -1;
  if (photoStart > 0 || socIndex !== -1) {
    for (let i = photoStart; i < data.length - 1; i++) {
      if (data[i] === 0xff && data[i + 1] === 0xd9) {
        eocIndex = i;
        break;
      }
    }
  }

  let hashEnd = data.length - SIGNATURE_SIZE;
  const photoEndLimit = eocIndex !== -1 ? eocIndex + 2 : hashEnd;

  let hashMobile: string | undefined;
  let hashEmail: string | undefined;

  if (hasMobile && hashEnd - HASH_SIZE >= photoEndLimit) {
    hashMobile = toHex(data.subarray(hashEnd - HASH_SIZE, hashEnd));
    hashEnd -= HASH_SIZE;
  }
  if (hasEmail && hashEnd - HASH_SIZE >= photoEndLimit) {
    hashEmail = toHex(data.subarray(hashEnd - HASH_SIZE, hashEnd));
    hashEnd -= HASH_SIZE;
  }

  const finalPhotoEnd = eocIndex !== -1 ? eocIndex + 2 : hashEnd;
  const photo = data.subarray(photoStart, finalPhotoEnd);

  return {
    version,
    bitIndicator,
    referenceId,
    name,
    dob,
    gender,
    careOf,
    district,
    landmark,
    house,
    location,
    pincode,
    postOffice,
    state,
    street,
    subDistrict,
    vtc,
    mobile,
    photo,
    hashEmail,
    hashMobile,
    signature,
    signatureHex,
    isVerified: true,
  };
}
