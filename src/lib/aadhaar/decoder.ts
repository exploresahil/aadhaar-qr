import {
  InvalidAadhaarQrError,
  type ParsedAadhaar,
  parseAadhaarQr,
  parseLegacyXmlAadhaar,
} from "./parser";

export interface ScanResult {
  rawText: string;
  bytes: Uint8Array;
  parsed?: ParsedAadhaar;
  error?: string;
}

/**
 * Decompress gzip or deflate bytes
 */
export async function decompressPayload(
  compressedBytes: Uint8Array,
): Promise<Uint8Array> {
  // Try gzip first via DecompressionStream if available
  if (typeof DecompressionStream !== "undefined") {
    try {
      const blob = new Blob([compressedBytes.buffer as ArrayBuffer]);
      const stream = new Response(blob).body?.pipeThrough(
        new DecompressionStream("gzip"),
      );
      if (stream) {
        const buffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(buffer);
      }
    } catch {
      // try deflate if gzip failed
      try {
        const blob = new Blob([compressedBytes.buffer as ArrayBuffer]);
        const stream = new Response(blob).body?.pipeThrough(
          new DecompressionStream("deflate"),
        );
        if (stream) {
          const buffer = await new Response(stream).arrayBuffer();
          return new Uint8Array(buffer);
        }
      } catch {
        // Fallback to raw bytes
      }
    }
  }
  return compressedBytes;
}

/**
 * BigInt base10 numeric string to Uint8Array (UIDAI spec section 3.2 step 1-2)
 */
export function bigIntStringToBytes(base10Str: string): Uint8Array {
  const cleanStr = base10Str.replace(/\s+/g, "").trim();
  const bigNum = BigInt(cleanStr);
  const hex = bigNum.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(paddedHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Processes decoded raw QR text or bytes and parses Aadhaar payload.
 * Universal function compatible with both Server Route Handlers and Client Browser.
 */
export async function processDecodedQrResult(
  rawText: string,
  rawBytes?: Uint8Array,
): Promise<ScanResult> {
  let payloadBytes = rawBytes;
  const cleanText = rawText.replace(/\s+/g, "").trim();

  if (/^\d{50,}$/.test(cleanText)) {
    payloadBytes = bigIntStringToBytes(cleanText);
  } else {
    payloadBytes ??= new TextEncoder().encode(rawText);
  }

  const decompressed = await decompressPayload(payloadBytes);

  try {
    const parsed = parseAadhaarQr(decompressed);
    return {
      rawText,
      bytes: decompressed,
      parsed,
    };
  } catch {
    // Try parsing as legacy unverified XML Aadhaar QR code
    const legacyParsed = parseLegacyXmlAadhaar(rawText);
    if (legacyParsed) {
      return {
        rawText,
        bytes: payloadBytes,
        parsed: legacyParsed,
      };
    }

    throw new InvalidAadhaarQrError(
      "Invalid QR Code: Scanned QR code is not a valid UIDAI Aadhaar QR code.",
    );
  }
}
