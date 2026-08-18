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

const TEXT_FIELDS = [
  "bitIndicator",
  "referenceId",
  "name",
  "dob",
  "gender",
  "careOf",
  "district",
  "landmark",
  "house",
  "location",
  "pincode",
  "postOffice",
  "state",
  "street",
  "subDistrict",
  "vtc",
] as const;

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
    isVerified: false, // Mark legacy XML as unverified
  };
}

/**
 * Parses binary V2/V3 UIDAI Secure Aadhaar QR code
 */
export function parseAadhaarQr(data: Uint8Array): ParsedAadhaar {
  const segments: Uint8Array[] = [];
  let segmentStart = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === DELIMITER) {
      segments.push(data.subarray(segmentStart, i));
      segmentStart = i + 1;
      if (segments.length === TEXT_FIELDS.length) {
        break;
      }
    }
  }
  segments.push(data.subarray(segmentStart));

  if (segments.length < TEXT_FIELDS.length) {
    throw new InvalidAadhaarQrError(
      `Expected at least ${TEXT_FIELDS.length} delimiter-separated fields, got ${segments.length}`,
    );
  }

  const bitIndicatorRaw = decodeText(segments[0]);
  if (!/^[0-3]$/.test(bitIndicatorRaw)) {
    throw new InvalidAadhaarQrError(
      `Invalid bit indicator value: ${bitIndicatorRaw}`,
    );
  }
  const bitIndicator = Number(bitIndicatorRaw) as BitIndicator;

  if (data.length < SIGNATURE_SIZE + 2 * HASH_SIZE) {
    throw new InvalidAadhaarQrError(
      `Payload too short to contain photo, hashes and signature: ${data.length} bytes`,
    );
  }

  const fields: Record<(typeof TEXT_FIELDS)[number], string> = {
    bitIndicator: bitIndicatorRaw,
  } as never;
  for (let i = 1; i < TEXT_FIELDS.length; i++) {
    fields[TEXT_FIELDS[i]] = decodeText(segments[i]);
  }

  const hasEmail = bitIndicator === 1 || bitIndicator === 3;
  const hasMobile = bitIndicator === 2 || bitIndicator === 3;

  const signature = data.subarray(data.length - SIGNATURE_SIZE);
  const signatureHex = toHex(signature);

  let hashEnd = data.length - SIGNATURE_SIZE;
  const hashMobile = hasMobile
    ? toHex(data.subarray(hashEnd - HASH_SIZE, hashEnd))
    : undefined;
  hashEnd -= hasMobile ? HASH_SIZE : 0;
  const hashEmail = hasEmail
    ? toHex(data.subarray(hashEnd - HASH_SIZE, hashEnd))
    : undefined;
  hashEnd -= hasEmail ? HASH_SIZE : 0;

  const photo = data.subarray(segmentStart, hashEnd);

  return {
    bitIndicator,
    referenceId: fields.referenceId,
    name: fields.name,
    dob: fields.dob,
    gender: fields.gender,
    careOf: fields.careOf,
    district: fields.district,
    landmark: fields.landmark,
    house: fields.house,
    location: fields.location,
    pincode: fields.pincode,
    postOffice: fields.postOffice,
    state: fields.state,
    street: fields.street,
    subDistrict: fields.subDistrict,
    vtc: fields.vtc,
    photo,
    hashEmail,
    hashMobile,
    signature,
    signatureHex,
    isVerified: true, // Signed secure UIDAI QR
  };
}
