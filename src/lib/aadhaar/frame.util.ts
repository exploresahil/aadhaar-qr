export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_CAPTURE_MAX_DIMENSION = 1080;

export function captureFrame(
  video: HTMLVideoElement,
  crop: CropRect | null,
  maxDimension = DEFAULT_CAPTURE_MAX_DIMENSION,
): ImageData {
  const canvas = document.createElement("canvas");
  const srcWidth = video.videoWidth;
  const srcHeight = video.videoHeight;
  if (srcWidth === 0 || srcHeight === 0) {
    throw new Error("Video source not ready");
  }
  const region = crop
    ? clampCropRect(crop, srcWidth, srcHeight)
    : { x: 0, y: 0, width: srcWidth, height: srcHeight };
  const scale = Math.min(
    1,
    maxDimension / Math.max(region.width, region.height),
  );
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not create canvas 2d context");
  }
  context.drawImage(
    video,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    width,
    height,
  );
  return context.getImageData(0, 0, width, height);
}

export function imageFileToImageData(
  file: File,
  maxDimension = DEFAULT_CAPTURE_MAX_DIMENSION,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        resolve(downscaleImage(image, maxDimension));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    image.src = url;
  });
}

function downscaleImage(
  image: HTMLImageElement,
  maxDimension: number,
): ImageData {
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not create canvas 2d context");
  }
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export function clampCropRect(
  crop: CropRect,
  srcWidth: number,
  srcHeight: number,
): CropRect {
  const maxWidth = srcWidth - crop.x;
  const maxHeight = srcHeight - crop.y;
  const width = Math.max(1, Math.min(crop.width, maxWidth));
  const height = Math.max(1, Math.min(crop.height, maxHeight));
  return {
    x: Math.max(0, Math.min(crop.x, srcWidth - 1)),
    y: Math.max(0, Math.min(crop.y, srcHeight - 1)),
    width,
    height,
  };
}

export function zoomCropRect(base: CropRect, zoom: number): CropRect {
  const width = Math.max(1, Math.round(base.width / zoom));
  const height = Math.max(1, Math.round(base.height / zoom));
  return {
    x: Math.round(base.x + (base.width - width) / 2),
    y: Math.round(base.y + (base.height - height) / 2),
    width,
    height,
  };
}
