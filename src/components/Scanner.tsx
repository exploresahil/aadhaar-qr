"use client";

import {
  type ScanResult,
  parseRawPayloadText,
  processDecodedQrResult,
  scanAadhaarQr,
} from "@/utils/qrScanner.util";
import { Scanner as ReactQrScanner } from "@yudiel/react-qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";
import ResultCard from "./ResultCard";
import styles from "./scanner.module.scss";

interface ScannerProps {
  readonly onScanSuccess?: (result: ScanResult | null) => void;
}

const STORAGE_KEY_DEVICE_ID = "aadhaar_qr_preferred_device_id";
const STORAGE_KEY_ZOOM = "aadhaar_qr_preferred_zoom_level";
const STORAGE_KEY_ENHANCE = "aadhaar_qr_preferred_auto_enhance";
const STORAGE_KEY_TORCH = "aadhaar_qr_preferred_torch_state";

const DEFAULT_INVALID_QR_MSG =
  "Invalid QR Code: Scanned QR code is not a valid UIDAI Aadhaar QR code.";

/**
 * Plays custom beep audio sound on successful QR recognition
 */
function playBeepSound() {
  try {
    const audio = new Audio("/beep.mp3");
    audio.play().catch(() => {});
  } catch {
    // Ignore browser autoplay restrictions
  }
}

/**
 * Selects the optimal main back camera lens (bypassing ultra-wide 0.5x blurry macro lenses)
 */
function selectMainBackCamera(videoInputs: MediaDeviceInfo[]): string | null {
  const validInputs = videoInputs.filter(
    (d) => d.deviceId && d.deviceId.trim() !== "",
  );
  if (validInputs.length === 0) return null;

  const mainBackCam =
    validInputs.find((d) => {
      const lbl = d.label.toLowerCase();
      return (
        (lbl.includes("back") ||
          lbl.includes("rear") ||
          lbl.includes("environment") ||
          lbl.includes("facing back")) &&
        !lbl.includes("ultra") &&
        !lbl.includes("0.5") &&
        !lbl.includes("wide-angle")
      );
    }) ||
    validInputs.find((d) => {
      const lbl = d.label.toLowerCase();
      return (
        lbl.includes("back") ||
        lbl.includes("rear") ||
        lbl.includes("facing back") ||
        lbl.includes("camera 0") ||
        lbl.includes("camera2 0")
      );
    }) ||
    validInputs[0];

  return mainBackCam?.deviceId?.trim() || null;
}

/**
 * Reads user's stored camera preferences from device localStorage
 */
function loadStoredPreferences() {
  if (typeof window === "undefined") return {};
  try {
    const savedZoom = localStorage.getItem(STORAGE_KEY_ZOOM);
    const parsedZoom = savedZoom ? Number.parseFloat(savedZoom) : null;
    const validZoom =
      parsedZoom &&
      !Number.isNaN(parsedZoom) &&
      parsedZoom >= 1.0 &&
      parsedZoom <= 4.0
        ? parsedZoom
        : null;

    const savedDeviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    const savedEnhance = localStorage.getItem(STORAGE_KEY_ENHANCE);
    const savedTorch = localStorage.getItem(STORAGE_KEY_TORCH);

    return {
      zoom: validZoom,
      deviceId: savedDeviceId,
      autoEnhance: savedEnhance !== null ? savedEnhance === "true" : null,
      wasTorchPreferred: savedTorch === "true", // Only true if flash was ON during a successful scan on this device
    };
  } catch {
    return {};
  }
}

/**
 * Saves user's successful camera configuration to device localStorage
 */
function saveStoredPreferences(
  deviceId: string | null,
  zoom: number,
  enhance: boolean,
  torch: boolean,
) {
  if (typeof window === "undefined") return;
  try {
    if (deviceId) {
      localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    }
    localStorage.setItem(STORAGE_KEY_ZOOM, String(zoom));
    localStorage.setItem(STORAGE_KEY_ENHANCE, String(enhance));
    // Device-specific flash history: true if flash was ON during successful scan, false if OFF
    localStorage.setItem(STORAGE_KEY_TORCH, String(torch));
  } catch {
    // Ignore storage quota errors
  }
}

/* Sub-component: Open Camera Placeholder */
function CameraPlaceholder({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <div className={styles.openCameraPlaceholder}>
      <div className={styles.openCameraContent}>
        <div className={styles.cameraIconCircle}>
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            role="img"
            aria-label="Camera icon"
          >
            <title>Camera icon</title>
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
        <h3>Ultra-Fast Live Aadhaar QR Scanner</h3>
        <p>
          Tap below to launch 60FPS instant hardware-accelerated camera scan
        </p>
        <button type="button" className={styles.openCameraBtn} onClick={onOpen}>
          📷 Open Camera
        </button>
      </div>
    </div>
  );
}

/* Sub-component: File Upload Tab */
function UploadTab({
  isUploading,
  onFileUpload,
}: {
  readonly isUploading: boolean;
  readonly onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  if (isUploading) {
    return (
      <div className={styles.uploadLoadingBox}>
        <svg
          className={styles.uploadSpinnerSvg}
          viewBox="0 0 50 50"
          width="48"
          height="48"
          role="img"
          aria-label="Loading spinner"
        >
          <title>Loading spinner</title>
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="rgba(185, 28, 28, 0.2)"
            strokeWidth="4"
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="#b91c1c"
            strokeWidth="4"
            strokeDasharray="80 50"
            strokeLinecap="round"
          />
        </svg>
        <h3>Enhancing & Scanning Image...</h3>
        <p>
          Running multi-pass contrast enhancement and document region detection
        </p>
      </div>
    );
  }

  return (
    <div className={styles.uploadBox}>
      <label htmlFor="qr-file-input" className={styles.dropZone}>
        <div className={styles.dropZoneContent}>
          <svg
            className={styles.uploadIcon}
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            role="img"
            aria-label="Upload icon"
          >
            <title>Upload icon</title>
            <path d="M12 16v-8m0 0l-3 3m3-3l3 3M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1" />
          </svg>
          <h3>Upload Aadhaar QR Image</h3>
          <p>Drag & drop or click to select image file (PNG, JPG, WebP, PDF)</p>
        </div>
        <input
          id="qr-file-input"
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={onFileUpload}
        />
      </label>
    </div>
  );
}

/* Sub-component: Sample/Raw Text Payload Tab */
function SampleTab({
  value,
  onChange,
  onSubmit,
}: {
  readonly value: string;
  readonly onChange: (val: string) => void;
  readonly onSubmit: (e: React.SyntheticEvent) => void;
}) {
  return (
    <form className={styles.sampleBox} onSubmit={onSubmit}>
      <label htmlFor="raw-payload" className={styles.inputLabel}>
        Paste Raw UIDAI Secure QR Text / Base10 Code / XML:
      </label>
      <textarea
        id="raw-payload"
        rows={5}
        placeholder="e.g. 14033960887471219569966966334463..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.textArea}
      />
      <button type="submit" className={styles.submitBtn}>
        Decode Payload
      </button>
    </form>
  );
}

/* Sub-component: Python OpenCV QR Inspector Tab */
function PythonTab({
  isProcessing,
  onPythonUpload,
}: {
  readonly isProcessing: boolean;
  readonly onPythonUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  if (isProcessing) {
    return (
      <div className={styles.uploadLoadingBox}>
        <svg
          className={styles.uploadSpinnerSvg}
          viewBox="0 0 50 50"
          width="48"
          height="48"
          role="img"
          aria-label="Loading spinner"
        >
          <title>Loading spinner</title>
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="rgba(185, 28, 28, 0.2)"
            strokeWidth="4"
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="#b91c1c"
            strokeWidth="4"
            strokeDasharray="80 50"
            strokeLinecap="round"
          />
        </svg>
        <h3>Processing via Python OpenCV Engine...</h3>
        <p>
          Running multi-pass adaptive thresholding & scale grid detection in
          Python backend
        </p>
      </div>
    );
  }

  return (
    <div className={styles.uploadBox}>
      <label htmlFor="python-qr-file-input" className={styles.dropZone}>
        <div className={styles.dropZoneContent}>
          <span style={{ fontSize: "2.5rem" }}>🐍</span>
          <h3>Upload Image for Python OpenCV QR Inspector</h3>
          <p>
            Uses server-side Python OpenCV multi-pass grid engine to detect and
            decode challenging Aadhaar QRs
          </p>
          <div
            style={{
              marginTop: "0.85rem",
              padding: "0.5rem 0.75rem",
              background: "rgba(0, 0, 0, 0.04)",
              borderRadius: "8px",
              fontSize: "0.75rem",
              color: "#525252",
              lineHeight: "1.35",
            }}
          >
            <strong>💡 Architecture Note:</strong> Executed natively via Python
            3 + OpenCV in local dev mode (<code>npm run dev</code>). On Vercel
            free-tier serverless deployments, automatically falls back to
            WebAssembly serverless engine.
          </div>
        </div>
        <input
          id="python-qr-file-input"
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={onPythonUpload}
        />
      </label>
    </div>
  );
}

/* Sub-component: Camera Selector & Zoom Controls Grid */
function CameraControls({
  videoDevices,
  selectedDeviceId,
  onSelectDevice,
  zoomLevel,
  onZoomChange,
  autoEnhance,
  onToggleEnhance,
  isTorchOn,
  onToggleTorch,
  onStop,
}: {
  readonly videoDevices: MediaDeviceInfo[];
  readonly selectedDeviceId: string | null;
  readonly onSelectDevice: (id: string | null) => void;
  readonly zoomLevel: number;
  readonly onZoomChange: (zoom: number) => void;
  readonly autoEnhance: boolean;
  readonly onToggleEnhance: () => void;
  readonly isTorchOn: boolean;
  readonly onToggleTorch: () => void;
  readonly onStop: () => void;
}) {
  return (
    <div className={styles.controlsBarGrid}>
      {videoDevices.length > 1 && (
        <div className={styles.cameraSelectWrapper}>
          <label htmlFor="camera-select" className={styles.cameraSelectLabel}>
            Select Camera:
          </label>
          <select
            id="camera-select"
            aria-label="Select camera"
            className={styles.cameraSelect}
            value={selectedDeviceId || ""}
            onChange={(e) => onSelectDevice(e.target.value || null)}
          >
            {videoDevices.map((dev, idx) => (
              <option key={dev.deviceId} value={dev.deviceId}>
                Camera - {idx + 1}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.zoomControlsWrapper}>
        <div className={styles.zoomPresetsRow}>
          {[1.5, 2.0, 2.5, 3.0].map((preset) => (
            <button
              key={preset}
              type="button"
              className={`${styles.zoomPill} ${zoomLevel === preset ? styles.zoomActive : ""}`}
              onClick={() => onZoomChange(preset)}
            >
              {preset}x{preset === 3.0 ? " (Auto)" : ""}
            </button>
          ))}
        </div>

        <div className={styles.zoomStepRow}>
          <button
            type="button"
            className={styles.zoomStepBtn}
            disabled={zoomLevel <= 1.0}
            onClick={() =>
              onZoomChange(
                Math.max(1.0, Math.round((zoomLevel - 0.2) * 10) / 10),
              )
            }
            aria-label="Zoom out"
          >
            ➖ Zoom Out
          </button>
          <button
            type="button"
            className={styles.zoomStepBtn}
            disabled={zoomLevel >= 4.0}
            onClick={() =>
              onZoomChange(
                Math.min(4.0, Math.round((zoomLevel + 0.2) * 10) / 10),
              )
            }
            aria-label="Zoom in"
          >
            ➕ Zoom In
          </button>
        </div>
      </div>

      <div className={styles.actionButtons}>
        <div className={styles.primaryActionRow}>
          <button
            type="button"
            className={`${styles.contrastBtn} ${autoEnhance ? styles.contrastActive : ""}`}
            onClick={onToggleEnhance}
          >
            ⚡ Auto-Enhance ({autoEnhance ? "ON" : "OFF"})
          </button>

          <button
            type="button"
            className={`${styles.torchBtn} ${isTorchOn ? styles.torchActive : ""}`}
            onClick={onToggleTorch}
          >
            🔦 Flash ({isTorchOn ? "ON" : "OFF"})
          </button>
        </div>

        <button type="button" className={styles.stopCameraBtn} onClick={onStop}>
          Stop
        </button>
      </div>
    </div>
  );
}

/* Sub-component: Premium Apple-Grade Error Alert Card */
function ErrorAlertCard({
  message,
  onDismiss,
  isOverlay = false,
}: {
  readonly message: string;
  readonly onDismiss: () => void;
  readonly isOverlay?: boolean;
}) {
  const isAyushman =
    message.includes("Ayushman") ||
    message.toLowerCase().includes("ayushman") ||
    message.includes("hidn");

  return (
    <div
      className={`${styles.errorCardContainer} ${
        isOverlay ? styles.errorCardOverlay : styles.errorCardInline
      }`}
    >
      <div className={styles.errorCardHeader}>
        <div className={styles.errorIconBadge}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Alert icon"
          >
            <title>Alert icon</title>
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className={styles.errorCardTextContent}>
          <h4 className={styles.errorCardTitle}>Invalid QR Code Detected</h4>
          <p className={styles.errorCardBody}>{message}</p>
        </div>
        <button
          type="button"
          className={styles.errorCardCloseBtn}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss error"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Close icon"
          >
            <title>Close icon</title>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className={styles.errorCardFooter}>
        <div className={styles.errorCardTipPill}>
          <span className={styles.tipIcon}>💡</span>
          <span>
            {isAyushman
              ? "Ayushman Bharat / ABHA health QR codes are not valid Aadhaar cards."
              : "Only UIDAI Aadhaar QR codes (binary Secure QR or legacy XML) are supported."}
          </span>
        </div>
        <button
          type="button"
          className={styles.errorCardRetryBtn}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

export default function Scanner({ onScanSuccess }: ScannerProps) {
  const [activeTab, setActiveTab] = useState<
    "camera" | "upload" | "sample" | "python"
  >("camera");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerKey, setScannerKey] = useState<number>(0);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [scanSuccessFlash, setScanSuccessFlash] = useState<boolean>(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleDismissError = useCallback(() => {
    setScanError(null);
    setIsResetting(true);
    setScannerKey((prev) => prev + 1);
  }, []);

  // Monitor camera video stream readiness: keep loader visible until video actually starts playing
  useEffect(() => {
    if (!isCameraActive || (!isResetting && !isStartingCamera)) return;

    let checkInterval: NodeJS.Timeout | null = null;
    let fallbackTimeout: NodeJS.Timeout | null = null;

    const hideLoader = () => {
      setIsResetting(false);
      setIsStartingCamera(false);
      if (checkInterval) clearInterval(checkInterval);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
    };

    const checkVideoPlaying = () => {
      const videoEl = document.querySelector<HTMLVideoElement>("video");
      if (videoEl) {
        if (!videoEl.paused && videoEl.readyState >= 2 && videoEl.currentTime > 0) {
          hideLoader();
          return true;
        }
        videoEl.addEventListener("playing", hideLoader, { once: true });
        videoEl.addEventListener("canplay", hideLoader, { once: true });
      }
      return false;
    };

    if (!checkVideoPlaying()) {
      checkInterval = setInterval(() => {
        checkVideoPlaying();
      }, 100);
    }

    // Safety fallback: if video playing event doesn't fire within 4 seconds, hide loader
    fallbackTimeout = setTimeout(() => {
      hideLoader();
    }, 4000);

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
    };
  }, [isCameraActive, isResetting, isStartingCamera, scannerKey]);

  // Mobile camera device selection, Torch, Auto Enhance & Auto Zoom
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [autoEnhance, setAutoEnhance] = useState<boolean>(true);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [wasTorchPreferred, setWasTorchPreferred] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(3.0); // Default 3.0x Macro Zoom for small paper Aadhaar QRs
  const [rawPayloadInput, setRawPayloadInput] = useState("");
  const [focusRipple, setFocusRipple] = useState<{
    x: number;
    y: number;
    id: number;
  } | null>(null);

  const isProcessingRef = useRef(false);
  const resultRef = useRef<ScanResult | null>(null);

  // Load stored preferences on initial mount
  useEffect(() => {
    const prefs = loadStoredPreferences();
    if (prefs.zoom !== undefined && prefs.zoom !== null)
      setZoomLevel(prefs.zoom);
    if (prefs.deviceId) setSelectedDeviceId(prefs.deviceId);
    if (prefs.autoEnhance !== undefined && prefs.autoEnhance !== null) {
      setAutoEnhance(prefs.autoEnhance);
    }
    if (prefs.wasTorchPreferred) {
      setWasTorchPreferred(true);
    }
  }, []);

  // Synchronize resultRef with state
  const updateResult = useCallback(
    (res: ScanResult | null) => {
      resultRef.current = res;
      setResult(res);
      onScanSuccess?.(res);
    },
    [onScanSuccess],
  );

  // Enumerate cameras & smart select main wide lens or saved preferred lens
  const enumerateCameras = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(
        (d) => d.kind === "videoinput" && d.deviceId && d.deviceId.trim() !== "",
      );
      setVideoDevices(videoInputs);

      if (videoInputs.length > 0) {
        setSelectedDeviceId((prevId) => {
          if (prevId && videoInputs.some((d) => d.deviceId === prevId)) {
            return prevId;
          }
          const prefs = loadStoredPreferences();
          if (
            prefs.deviceId &&
            videoInputs.some((d) => d.deviceId === prefs.deviceId)
          ) {
            return prefs.deviceId;
          }
          return selectMainBackCamera(videoInputs);
        });
      }
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    if (isCameraActive) {
      enumerateCameras();
    }
  }, [isCameraActive, enumerateCameras]);

  const handleSelectDevice = useCallback(
    (deviceId: string | null) => {
      setSelectedDeviceId(deviceId);
      saveStoredPreferences(deviceId, zoomLevel, autoEnhance, isTorchOn);
    },
    [zoomLevel, autoEnhance, isTorchOn],
  );

  const startCamera = () => {
    setScanError(null);
    setScanSuccessFlash(false);
    setIsTorchOn(false); // Do not turn flash on by default
    isProcessingRef.current = false;
    resultRef.current = null;
    setIsStartingCamera(true);
    setIsCameraActive(true);
  };

  const stopCamera = useCallback(() => {
    isProcessingRef.current = false;
    setIsCameraActive(false);
    setIsStartingCamera(false);
    setIsResetting(false);
    setScanSuccessFlash(false);
    setIsTorchOn(false);
  }, []);

  // Toggle Hardware Camera Flashlight / Torch
  const toggleTorch = async () => {
    try {
      const videoEl = document.querySelector<HTMLVideoElement>("video");
      const stream = videoEl?.srcObject as MediaStream;
      const track = stream?.getVideoTracks()?.[0];
      if (track) {
        const nextState = !isTorchOn;
        // biome-ignore lint/suspicious/noExplicitAny: WebRTC torch capability inspection
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setIsTorchOn(nextState);
      }
    } catch {
      // Torch not supported on current camera
    }
  };

  // Hardware Camera Tap-to-Focus
  const handleTapToFocus = async (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setFocusRipple({ x, y, id: Date.now() });
    setTimeout(() => setFocusRipple(null), 750);

    try {
      const videoEl = document.querySelector<HTMLVideoElement>("video");
      const stream = videoEl?.srcObject as MediaStream;
      const track = stream?.getVideoTracks()?.[0];
      if (track) {
        // biome-ignore lint/suspicious/noExplicitAny: WebRTC Focus capability inspection
        const capabilities = (track as any).getCapabilities?.();
        if (capabilities?.focusMode) {
          let mode: string | null = null;
          if (capabilities.focusMode.includes("single-shot")) {
            mode = "single-shot";
          } else if (capabilities.focusMode.includes("continuous")) {
            mode = "continuous";
          }

          if (mode) {
            // biome-ignore lint/suspicious/noExplicitAny: WebRTC Focus constraints
            await (track as any).applyConstraints({
              advanced: [{ focusMode: mode }],
            });
          }
        }
      }
    } catch {
      // Focus constraint fallback
    }
  };

  // Handle Tab Switch
  useEffect(() => {
    if (activeTab !== "camera") {
      stopCamera();
    }
  }, [activeTab, stopCamera]);

  // Handle Scan Callback from @yudiel/react-qr-scanner
  const handleScan = useCallback(
    async (detected: Array<{ rawValue: string }>) => {
      if (!detected || detected.length === 0) return;
      if (resultRef.current || isProcessingRef.current) return;

      const rawText = detected[0]?.rawValue;
      if (!rawText) return;

      try {
        isProcessingRef.current = true;
        const scanRes = await processDecodedQrResult(rawText);
        if (!scanRes.parsed || (!scanRes.parsed.name && !scanRes.parsed.referenceId)) {
          setScanError(DEFAULT_INVALID_QR_MSG);
          return;
        }

        // Save device-specific flash preference: true if flash was ON during success, false if OFF
        saveStoredPreferences(
          selectedDeviceId,
          zoomLevel,
          autoEnhance,
          isTorchOn,
        );
        setScanError(null);
        setScanSuccessFlash(true);
        playBeepSound();

        setTimeout(() => {
          updateResult(scanRes);
          stopCamera();
          onScanSuccess?.(scanRes);
        }, 400);
      } catch (err) {
        setScanError(
          err instanceof Error ? err.message : DEFAULT_INVALID_QR_MSG,
        );
      } finally {
        isProcessingRef.current = false;
      }
    },
    [
      onScanSuccess,
      updateResult,
      stopCamera,
      selectedDeviceId,
      zoomLevel,
      autoEnhance,
      isTorchOn,
    ],
  );

  // Handle Image File Upload with Multi-pass smart scanning
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setIsUploading(true);
    try {
      const scanRes = await scanAadhaarQr(file);
      if (!scanRes.parsed || (!scanRes.parsed.name && !scanRes.parsed.referenceId)) {
        setScanError(DEFAULT_INVALID_QR_MSG);
        return;
      }
      playBeepSound();
      updateResult(scanRes);
      onScanSuccess?.(scanRes);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : DEFAULT_INVALID_QR_MSG);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  // Handle Raw Text/Base10 Payload Submission
  const handleSampleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!rawPayloadInput.trim()) return;
    setScanError(null);
    try {
      const scanRes = await parseRawPayloadText(rawPayloadInput);
      if (!scanRes.parsed || (!scanRes.parsed.name && !scanRes.parsed.referenceId)) {
        setScanError(DEFAULT_INVALID_QR_MSG);
        return;
      }
      playBeepSound();
      updateResult(scanRes);
      onScanSuccess?.(scanRes);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : DEFAULT_INVALID_QR_MSG);
    }
  };

  // Handle Python Backend Image Decoding
  const handlePythonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/decode-qr", {
        method: "POST",
        body: formData,
      });

      const json = await response.json();
      if (!json.success || !json.parsed || (!json.parsed.name && !json.parsed.referenceId)) {
        setScanError(
          json.error ||
            DEFAULT_INVALID_QR_MSG,
        );
        return;
      }

      playBeepSound();

      const photoBytes = json.photoBase64
        ? Uint8Array.from(atob(json.photoBase64), (c) => c.charCodeAt(0))
        : new Uint8Array(0);

      const scanRes: ScanResult = {
        rawText: json.raw_text,
        bytes: new TextEncoder().encode(json.raw_text),
        parsed: {
          ...json.parsed,
          photo: photoBytes,
          signatureHex: json.signatureHex,
        },
      };

      updateResult(scanRes);
      onScanSuccess?.(scanRes);
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : "Python QR processing failed",
      );
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  // Reset Scanner when user clicks "Scan Another"
  const handleReset = () => {
    updateResult(null);
    handleDismissError();
    setScanSuccessFlash(false);
    isProcessingRef.current = false;
    if (activeTab === "camera") {
      startCamera();
    }
  };

  if (result?.parsed) {
    return (
      <ResultCard
        data={result.parsed}
        rawText={result.rawText}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className={styles.scannerWrapper}>
      {/* Mode Selector Tabs */}
      <div className={styles.tabHeader}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "camera" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("camera")}
        >
          📷 Live Scan
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "upload" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("upload")}
        >
          📁 Upload Image
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "sample" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("sample")}
        >
          ⚡ Payload Test
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "python" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("python")}
        >
          🐍 Python Inspector
        </button>
      </div>

      {/* Tab Contents */}
      <div className={styles.tabBody}>
        {activeTab === "camera" && (
          <div className={styles.cameraBox}>
            {!isCameraActive ? (
              <CameraPlaceholder onOpen={startCamera} />
            ) : (
              <div
                className={styles.videoViewportSquare}
                onClick={handleTapToFocus}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleTapToFocus(e as unknown as React.MouseEvent<HTMLElement>);
                  }
                }}
                tabIndex={0}
                role="region"
                aria-label="Camera viewport - tap anywhere to focus"
              >
                <ReactQrScanner
                  key={`${selectedDeviceId || "default-camera"}_${scannerKey}`}
                  onScan={handleScan}
                  onError={(err) => {
                    if (err instanceof Error) setScanError(err.message);
                  }}
                  scanDelay={150}
                  allowMultiple={false}
                  formats={["qr_code"]}
                  constraints={
                    selectedDeviceId && selectedDeviceId.trim() !== ""
                      ? {
                          deviceId: { ideal: selectedDeviceId },
                          width: { ideal: 1920 },
                          height: { ideal: 1080 },
                        }
                      : {
                          facingMode: { ideal: "environment" },
                          width: { ideal: 1920 },
                          height: { ideal: 1080 },
                        }
                  }
                  styles={{
                    container: {
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      borderRadius: "18px",
                      overflow: "hidden",
                    },
                    video: {
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: `scale(${zoomLevel}) translateZ(0)`,
                      WebkitTransform: `scale(${zoomLevel}) translateZ(0)`,
                      transition: "transform 0.3s ease",
                    },
                  }}
                  components={{
                    finder: false,
                    zoom: true,
                  }}
                />
                <div className={styles.squareViewfinderOverlay}>
                  <div className={styles.targetFrame}>
                    <div className={styles.reticleCornerTopLeft} />
                    <div className={styles.reticleCornerTopRight} />
                    <div className={styles.reticleCornerBottomLeft} />
                    <div className={styles.reticleCornerBottomRight} />
                    <div className={styles.scanLaser} />
                  </div>
                </div>

                {/* Top Tap to Focus Overlay Pill */}
                {!scanError && !scanSuccessFlash && (
                  <div className={styles.tapToFocusTipOverlay}>
                    🎯 Tap to focus
                  </div>
                )}

                {/* Animated Focus Pulse Ring when viewport is tapped */}
                {focusRipple && (
                  <div
                    key={focusRipple.id}
                    className={styles.focusRippleRing}
                    style={{ left: focusRipple.x, top: focusRipple.y }}
                  />
                )}

                {/* Floating Yellow Flash Tip Overlay shown ONLY if flash was ON during a previous successful scan on this device */}
                {wasTorchPreferred &&
                  !isTorchOn &&
                  !scanError &&
                  !scanSuccessFlash && (
                    <button
                      type="button"
                      className={styles.viewportTorchTipOverlay}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTorch();
                      }}
                    >
                      💡 Turn On Flash for Faster Scan
                    </button>
                  )}

                {scanError && !scanSuccessFlash && !isResetting && !isStartingCamera && (
                  <ErrorAlertCard
                    message={scanError}
                    onDismiss={handleDismissError}
                    isOverlay={true}
                  />
                )}

                {(isStartingCamera || isResetting) && (
                  <div className={styles.viewportResetLoadingOverlay}>
                    <svg
                      className={styles.uploadSpinnerSvg}
                      viewBox="0 0 50 50"
                      width="28"
                      height="28"
                      role="img"
                      aria-label="Opening camera scanner"
                    >
                      <title>Opening camera scanner</title>
                      <circle
                        cx="25"
                        cy="25"
                        r="20"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.25)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="25"
                        cy="25"
                        r="20"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="4"
                        strokeDasharray="80 50"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>
                      {isStartingCamera
                        ? "📷 Opening Camera Scanner..."
                        : "Re-initializing Scanner..."}
                    </span>
                  </div>
                )}

                {scanSuccessFlash && (
                  <div className={styles.viewportSuccessOverlay}>
                    <div className={styles.successBadgeCircle}>
                      <svg
                        className={styles.successCheckSvg}
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        role="img"
                        aria-label="Success checkmark"
                      >
                        <title>Success checkmark</title>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className={styles.successTextGroup}>
                      <h3 className={styles.successTitle}>Aadhaar QR Verified</h3>
                      <p className={styles.successSubtitle}>UIDAI Digital Signature Validated</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isCameraActive && (
              <CameraControls
                videoDevices={videoDevices}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={handleSelectDevice}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                autoEnhance={autoEnhance}
                onToggleEnhance={() => setAutoEnhance((prev) => !prev)}
                isTorchOn={isTorchOn}
                onToggleTorch={toggleTorch}
                onStop={stopCamera}
              />
            )}
          </div>
        )}

        {activeTab === "upload" && (
          <UploadTab
            isUploading={isUploading}
            onFileUpload={handleFileUpload}
          />
        )}

        {activeTab === "sample" && (
          <SampleTab
            value={rawPayloadInput}
            onChange={setRawPayloadInput}
            onSubmit={handleSampleSubmit}
          />
        )}

        {activeTab === "python" && (
          <PythonTab
            isProcessing={isUploading}
            onPythonUpload={handlePythonUpload}
          />
        )}

        {activeTab !== "camera" && scanError && (
          <ErrorAlertCard
            message={scanError}
            onDismiss={handleDismissError}
            isOverlay={false}
          />
        )}
      </div>
    </div>
  );
}
