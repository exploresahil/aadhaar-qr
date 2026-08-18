"use client";

import { JpxImage } from "jpeg2000";

/**
 * Ensures input Uint8Array has Node Buffer methods required by jpeg2000 decoder
 */
function toDecoderBuffer(bytes: Uint8Array): Uint8Array {
  // If global Buffer is available
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  // Fallback polyfill for Buffer methods required by jpeg2000 library
  const buf = new Uint8Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ) as Uint8Array & {
    readUInt16BE?: (offset: number) => number;
    readUInt32BE?: (offset: number) => number;
    readUInt8?: (offset: number) => number;
  };

  buf.readUInt16BE ??= function (offset: number) {
    return (this[offset] << 8) | this[offset + 1];
  };

  buf.readUInt32BE ??= function (offset: number) {
    return (
      this[offset] * 0x1000000 +
      ((this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3])
    );
  };

  buf.readUInt8 ??= function (offset: number) {
    return this[offset];
  };

  return buf;
}

function copyPlanarRgb(
  imgData: ImageData,
  // biome-ignore lint/suspicious/noExplicitAny: tile components inspection
  components: any[],
  totalPixels: number,
): void {
  const rComp = components[0].items || components[0];
  const gComp = components[1].items || components[1];
  const bComp = components[2].items || components[2];

  let pixelIndex = 0;
  for (let i = 0; i < totalPixels; i++) {
    imgData.data[pixelIndex] = rComp[i];
    imgData.data[pixelIndex + 1] = gComp[i];
    imgData.data[pixelIndex + 2] = bComp[i];
    imgData.data[pixelIndex + 3] = 255;
    pixelIndex += 4;
  }
}

function copyPackedRgbOrGrayscale(
  imgData: ImageData,
  items: Uint8Array,
  totalPixels: number,
): void {
  let pixelIndex = 0;
  if (items.length >= totalPixels * 3) {
    let srcIdx = 0;
    for (let i = 0; i < totalPixels; i++) {
      imgData.data[pixelIndex] = items[srcIdx];
      imgData.data[pixelIndex + 1] = items[srcIdx + 1];
      imgData.data[pixelIndex + 2] = items[srcIdx + 2];
      imgData.data[pixelIndex + 3] = 255;
      pixelIndex += 4;
      srcIdx += 3;
    }
  } else {
    for (let i = 0; i < totalPixels; i++) {
      const val = items[i];
      imgData.data[pixelIndex] = val;
      imgData.data[pixelIndex + 1] = val;
      imgData.data[pixelIndex + 2] = val;
      imgData.data[pixelIndex + 3] = 255;
      pixelIndex += 4;
    }
  }
}

/**
 * Decodes JP2000 (JPEG 2000) byte array from Aadhaar QR payload to PNG Data URL.
 * Handles planar 3-component, interleaved RGB, and 1-component grayscale formats cleanly.
 */
export function decodeJp2kToDataUrl(jp2kBytes: Uint8Array): string | null {
  if (!jp2kBytes || jp2kBytes.length === 0) return null;

  try {
    const jpx = new JpxImage();
    const decBuf = toDecoderBuffer(jp2kBytes);
    jpx.parse(decBuf);

    const width = jpx.width;
    const height = jpx.height;
    if (!width || !height) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imgData = ctx.createImageData(width, height);
    // biome-ignore lint/suspicious/noExplicitAny: tile structural inspection
    const tile = jpx.tiles?.[0] as any;
    if (!tile) return null;

    const totalPixels = width * height;

    if (tile.components?.length === 3) {
      copyPlanarRgb(imgData, tile.components, totalPixels);
    } else if (tile.items) {
      copyPackedRgbOrGrayscale(imgData, tile.items as Uint8Array, totalPixels);
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
