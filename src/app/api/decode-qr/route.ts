import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { processDecodedQrResult } from "@/lib/aadhaar/decoder";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { readBarcodes } from "zxing-wasm/reader";

const execFileAsync = promisify(execFile);

/**
 * Scans uncropped full image via zxing-wasm.
 */
async function scanFullImageWasm(buffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const results = await readBarcodes(
      {
        data: new Uint8ClampedArray(
          data.buffer as ArrayBuffer,
          data.byteOffset,
          data.byteLength,
        ),
        width: info.width,
        height: info.height,
        colorSpace: "srgb" as const,
      },
      {
        formats: ["QRCode"],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
      },
    );

    if (results.length > 0 && results[0].text && results[0].text.length > 20) {
      return results[0].text;
    }
  } catch {
    // Ignore and proceed
  }
  return null;
}

/**
 * Generates 3x3 overlapping grid coordinates for document scans.
 */
function generateGridRegions(width: number, height: number) {
  const regions: Array<{ x: number; y: number; w: number; h: number }> = [];
  if (width <= 200 || height <= 200) return regions;

  for (const yRatio of [0.0, 0.25, 0.5]) {
    for (const xRatio of [0.0, 0.25, 0.5]) {
      const x = Math.round(width * xRatio);
      const y = Math.round(height * yRatio);
      const w = Math.min(width - x, Math.round(width * 0.55));
      const h = Math.min(height - y, Math.round(height * 0.55));
      if (w >= 50 && h >= 50) {
        regions.push({ x, y, w, h });
      }
    }
  }
  return regions;
}

/**
 * Scans a single cropped grid region at a specified upscale scale factor.
 */
async function scanGridCrop(
  buffer: Buffer,
  r: { x: number; y: number; w: number; h: number },
  scale: number,
): Promise<string | null> {
  try {
    const crop = sharp(buffer)
      .extract({ left: r.x, top: r.y, width: r.w, height: r.h })
      .resize(Math.round(r.w * scale), Math.round(r.h * scale), {
        kernel: "cubic",
      })
      .linear(1.8, -20)
      .extend({
        top: 30,
        bottom: 30,
        left: 30,
        right: 30,
        background: { r: 255, g: 255, b: 255 },
      });

    const { data, info } = await crop
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const results = await readBarcodes(
      {
        data: new Uint8ClampedArray(
          data.buffer as ArrayBuffer,
          data.byteOffset,
          data.byteLength,
        ),
        width: info.width,
        height: info.height,
        colorSpace: "srgb" as const,
      },
      {
        formats: ["QRCode"],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
      },
    );

    if (results.length > 0 && results[0].text && results[0].text.length > 20) {
      return results[0].text;
    }
  } catch {
    // Ignore individual crop failure
  }
  return null;
}

/**
 * Scans 3x3 pyramidal grid crops with scaling.
 */
async function scanPyramidalGridWasm(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<string | null> {
  const regions = generateGridRegions(width, height);
  for (const r of regions) {
    for (const scale of [2.0, 3.5]) {
      const text = await scanGridCrop(buffer, r, scale);
      if (text) return text;
    }
  }
  return null;
}

/**
 * Serverless WebAssembly fallback decoder using zxing-wasm & sharp.
 */
async function decodeWithWasmServerless(buffer: Buffer) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width || 480;
  const height = metadata.height || 640;

  let rawText = await scanFullImageWasm(buffer);

  if (!rawText) {
    rawText = await scanPyramidalGridWasm(buffer, width, height);
  }

  if (!rawText) {
    return {
      success: false,
      error: "No QR code pattern detected in uploaded image.",
    };
  }

  const scanRes = await processDecodedQrResult(rawText);
  if (!scanRes.parsed) {
    return {
      success: false,
      error: "Could not parse Aadhaar QR payload.",
    };
  }

  const photoBase64 =
    scanRes.parsed.photo && scanRes.parsed.photo.length > 0
      ? Buffer.from(scanRes.parsed.photo).toString("base64")
      : "";

  return {
    success: true,
    version: scanRes.parsed.version || "V2/V3",
    raw_text: rawText,
    raw_len: rawText.length,
    compressed_len: scanRes.bytes.length,
    decompressed_len: scanRes.bytes.length,
    parsed: scanRes.parsed,
    signatureHex: scanRes.parsed.signatureHex || "",
    photoLen: scanRes.parsed.photo?.length || 0,
    photoBase64,
  };
}

/**
 * Tries executing local Python decoder script.
 */
async function tryExecutePython(buffer: Buffer, fileName: string) {
  let tempFilePath: string | null = null;
  try {
    const tempDir = os.tmpdir();
    const fileExt = path.extname(fileName) || ".png";
    tempFilePath = path.join(
      tempDir,
      `aadhaar_qr_${Date.now()}_${randomUUID()}${fileExt}`,
    );

    await fs.promises.writeFile(tempFilePath, buffer);

    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "decode_aadhaar_qr.py",
    );

    const { stdout } = await execFileAsync("python", [
      scriptPath,
      tempFilePath,
    ]);

    const pythonResult = JSON.parse(stdout.trim());
    return pythonResult.success ? pythonResult : null;
  } catch {
    return null;
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.promises.unlink(tempFilePath);
      } catch {
        // Cleanup temp file
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request format. Expected multipart/form-data",
        },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No image file uploaded" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Try Python execution first
    const pythonResult = await tryExecutePython(buffer, file.name);
    if (pythonResult) {
      return NextResponse.json(pythonResult);
    }

    // Fallback to Vercel Serverless WebAssembly decoder (zxing-wasm + sharp)
    const wasmResult = await decodeWithWasmServerless(buffer);
    return NextResponse.json(wasmResult);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "QR decoder processing failed",
      },
      { status: 500 },
    );
  }
}
