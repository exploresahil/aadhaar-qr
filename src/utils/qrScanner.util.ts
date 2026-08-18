"use client";

import {
  InvalidAadhaarQrError,
  type ParsedAadhaar,
  parseAadhaarQr,
  parseLegacyXmlAadhaar,
} from "@/lib/aadhaar/parser";
import QrScanner from "qr-scanner";

export interface ScanResult {
  rawText: string;
  bytes: Uint8Array;
  parsed?: ParsedAadhaar;
  error?: string;
}

export type ScannableSource =
  | Blob
  | File
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement;

/**
 * Pre-warms QR Scanner web worker
 */
export function prewarmScanner(): void {
  QrScanner.hasCamera().catch(() => {});
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
 * Supports both verified UIDAI Secure QR and unverified/legacy Aadhaar QR codes.
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

/**
 * Multi-pass smart image scanner for uploaded Aadhaar document images.
 * Yields main thread between passes to keep UI loading spinner animating smoothly.
 */
export async function scanAadhaarQr(
  source: ScannableSource,
): Promise<ScanResult> {
  const yieldThread = () => new Promise((resolve) => setTimeout(resolve, 50));

  // Pass 1: Direct Scan
  try {
    const res = await QrScanner.scanImage(source, {
      returnDetailedScanResult: true,
    });
    // biome-ignore lint/suspicious/noExplicitAny: QrScanner detailed scan result type
    const rawBytes = (res as any).bytes
      ? new Uint8Array((res as any).bytes)
      : undefined;
    return await processDecodedQrResult(res.data, rawBytes);
  } catch {
    // Continue to Pass 2 if source is Blob or File
  }

  if (
    typeof window === "undefined" ||
    !(source instanceof Blob || source instanceof File)
  ) {
    throw new InvalidAadhaarQrError(
      "Invalid QR Code: Scanned QR code is not a valid UIDAI Aadhaar QR code.",
    );
  }

  await yieldThread();

  // Load uploaded image into HTMLImageElement
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(source);
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new InvalidAadhaarQrError(
      "Invalid QR Code: Scanned QR code is not a valid UIDAI Aadhaar QR code.",
    );
  }

  const { width, height } = img;
  canvas.width = width;
  canvas.height = height;

  // Pass 2: High Contrast Grayscale Canvas Enhancement
  ctx.filter = "contrast(220%) brightness(110%) grayscale(100%)";
  ctx.drawImage(img, 0, 0, width, height);
  try {
    const res = await QrScanner.scanImage(canvas, {
      returnDetailedScanResult: true,
    });
    // biome-ignore lint/suspicious/noExplicitAny: QrScanner detailed scan result type
    const rawBytes = (res as any).bytes
      ? new Uint8Array((res as any).bytes)
      : undefined;
    return await processDecodedQrResult(res.data, rawBytes);
  } catch {
    // Continue to Pass 3
  }

  // Pass 3: Multi-Region Cropped Scan (4 Quadrants + Center 60% for full e-Aadhaar documents)
  const regions = [
    { x: 0, y: 0, w: width * 0.6, h: height * 0.6 }, // Top-Left
    { x: width * 0.4, y: 0, w: width * 0.6, h: height * 0.6 }, // Top-Right
    { x: 0, y: height * 0.4, w: width * 0.6, h: height * 0.6 }, // Bottom-Left
    { x: width * 0.4, y: height * 0.4, w: width * 0.6, h: height * 0.6 }, // Bottom-Right (standard e-Aadhaar QR location)
    { x: width * 0.2, y: height * 0.2, w: width * 0.6, h: height * 0.6 }, // Center 60%
  ];

  for (const r of regions) {
    await yieldThread();
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = r.w;
    cropCanvas.height = r.h;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) continue;

    cropCtx.filter = "contrast(200%) brightness(110%)";
    cropCtx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);

    try {
      const res = await QrScanner.scanImage(cropCanvas, {
        returnDetailedScanResult: true,
      });
      // biome-ignore lint/suspicious/noExplicitAny: QrScanner detailed scan result type
      const rawBytes = (res as any).bytes
        ? new Uint8Array((res as any).bytes)
        : undefined;
      return await processDecodedQrResult(res.data, rawBytes);
    } catch {
      // Try next quadrant
    }
  }

  throw new InvalidAadhaarQrError(
    "No QR Code Found: Could not detect any QR code pattern in the uploaded image. Please upload a clear image containing an Aadhaar QR code.",
  );
}

/**
 * Parses raw text input (BigInt base10 code or XML)
 */
export async function parseRawPayloadText(
  rawText: string,
): Promise<ScanResult> {
  return processDecodedQrResult(rawText);
}
