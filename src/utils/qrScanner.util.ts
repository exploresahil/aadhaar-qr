"use client";

import {
  InvalidAadhaarQrError,
  type ParsedAadhaar,
  parseAadhaarQr,
  parseLegacyXmlAadhaar,
} from "@/lib/aadhaar/parser";
import { BarcodeDetector } from "barcode-detector";
import QrScanner from "qr-scanner";

import {
  type ScanResult,
  bigIntStringToBytes,
  decompressPayload,
  processDecodedQrResult,
} from "@/lib/aadhaar/decoder";

export type ScannableSource =
  | Blob
  | File
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement;

export {
  type ScanResult,
  bigIntStringToBytes,
  decompressPayload,
  processDecodedQrResult,
};

/**
 * Helper to scan an image or canvas source using BarcodeDetector (ZXing Engine)
 */
async function scanWithBarcodeDetector(
  // biome-ignore lint/suspicious/noExplicitAny: BarcodeDetector source type
  source: any,
): Promise<ScanResult | null> {
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const results = await detector.detect(source);
    if (results && results.length > 0 && results[0].rawValue) {
      const rawText = results[0].rawValue;
      // biome-ignore lint/suspicious/noExplicitAny: ZXing raw byte property
      const rawBytes = (results[0] as any).rawBytes
        ? new Uint8Array((results[0] as any).rawBytes)
        : undefined;
      return await processDecodedQrResult(rawText, rawBytes);
    }
  } catch {
    // Return null to allow fallback
  }
  return null;
}

/**
 * Helper to scan an image or canvas source using QrScanner (jsQR Engine)
 */
async function scanWithQrScanner(
  source: ScannableSource,
): Promise<ScanResult | null> {
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
    return null;
  }
}

/**
 * Multi-pass smart image scanner for uploaded Aadhaar document images.
 * Uses BarcodeDetector (ZXing Engine) and QrScanner (jsQR) for high-density QR decoding.
 */
export async function scanAadhaarQr(
  source: ScannableSource,
): Promise<ScanResult> {
  const yieldThread = () => new Promise((resolve) => setTimeout(resolve, 50));

  // Pass 1: Direct Scan via BarcodeDetector (ZXing) & QrScanner
  const bdDirect = await scanWithBarcodeDetector(source);
  if (bdDirect) return bdDirect;

  const qsDirect = await scanWithQrScanner(source);
  if (qsDirect) return qsDirect;

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
  ctx.filter = "contrast(200%) brightness(110%) grayscale(100%)";
  ctx.drawImage(img, 0, 0, width, height);

  const bdCanvas = await scanWithBarcodeDetector(canvas);
  if (bdCanvas) return bdCanvas;

  const qsCanvas = await scanWithQrScanner(canvas);
  if (qsCanvas) return qsCanvas;

  // Pass 3: Pyramidal Multi-Region Cropped & Upscaled Scan (Full e-Aadhaar cards & document scans)
  const gridRegions: Array<{ x: number; y: number; w: number; h: number }> = [];

  if (width > 200 && height > 200) {
    for (const yRatio of [0.0, 0.25, 0.5]) {
      for (const xRatio of [0.0, 0.25, 0.5]) {
        const x = Math.round(width * xRatio);
        const y = Math.round(height * yRatio);
        const w = Math.min(width - x, Math.round(width * 0.55));
        const h = Math.min(height - y, Math.round(height * 0.55));
        if (w > 50 && h > 50) {
          gridRegions.push({ x, y, w, h });
        }
      }
    }
  }

  for (const r of gridRegions) {
    for (const scale of [2.0, 3.0, 4.0]) {
      await yieldThread();
      const padding = 30;

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.round(r.w * scale + padding * 2);
      cropCanvas.height = Math.round(r.h * scale + padding * 2);

      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) continue;

      // Preserve crisp module edges during upscaling
      cropCtx.imageSmoothingEnabled = false;

      // Fill white background for Quiet Zone padding
      cropCtx.fillStyle = "#ffffff";
      cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

      cropCtx.filter = "contrast(180%) brightness(110%)";
      cropCtx.drawImage(
        img,
        r.x,
        r.y,
        r.w,
        r.h,
        padding,
        padding,
        r.w * scale,
        r.h * scale,
      );

      const bdCrop = await scanWithBarcodeDetector(cropCanvas);
      if (bdCrop) return bdCrop;

      const qsCrop = await scanWithQrScanner(cropCanvas);
      if (qsCrop) return qsCrop;
    }
  }

  // Pass 4: Automatic Server-Side Python Backend Fallback Pass (/api/decode-qr)
  if (
    typeof window !== "undefined" &&
    typeof source === "object" &&
    source !== null &&
    "size" in source
  ) {
    try {
      const formData = new FormData();
      formData.append("file", source as Blob);

      const pyResponse = await fetch("/api/decode-qr", {
        method: "POST",
        body: formData,
      });

      if (pyResponse.ok) {
        const pyJson = await pyResponse.json();
        if (pyJson.success && pyJson.raw_text) {
          const rawBytes = pyJson.raw_text
            ? new TextEncoder().encode(pyJson.raw_text)
            : undefined;
          const scanRes = await processDecodedQrResult(
            pyJson.raw_text,
            rawBytes,
          );
          if (pyJson.photoBase64 && scanRes.parsed) {
            scanRes.parsed.photo = Uint8Array.from(
              atob(pyJson.photoBase64),
              (c) => c.charCodeAt(0),
            );
          }
          return scanRes;
        }
      }
    } catch {
      // Fallback ignored, proceeding to final error message
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
