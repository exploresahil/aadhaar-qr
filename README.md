# Ultra-Fast UIDAI Secure Aadhaar QR Code Scanner

High-performance, privacy-focused Web Application built with Next.js 16 (App Router), TypeScript, and WebRTC for scanning and decoding official UIDAI Secure Aadhaar QR Codes (V2 & V3) as well as legacy Aadhaar QR codes.

---

## Key Features

### 1. Live Camera Scanner
* **Smart Camera Lens Selection**: Automatically bypasses blurry 0.5x ultra-wide or macro lenses to lock onto the main back camera.
* **3.0x Macro Zoom**: Magnifies small 2cm paper Aadhaar card QRs from a comfortable 25–30cm distance without forcing users to bring the phone uncomfortably close.
* **Hardware Tap-to-Focus**: Tap anywhere on the 60FPS camera viewfinder to trigger hardware autofocus via WebRTC constraints.
* **Auto-Enhance Contrast Filter**: Real-time WebKit GPU-accelerated contrast and brightness boosting for faded, shadowed, or low-light physical paper QRs.
* **Yellow Torch Recommendation Overlay**: Detects if flashlight previously improved scan success on your device and provides a non-intrusive tip to turn on flash.

### 2. Smart Local Device Preference Memory
* Learns and persists your optimal camera configuration (selected lens, zoom level, auto-enhance state, flashlight state) in `localStorage` upon successful QR scans.
* Automatically applies or suggests these settings on subsequent visits for instant scan speeds.

### 3. Multi-Pass Document Image Upload Scanner
* **3-Pass Enhancement Pipeline**: Handles full A4 e-Aadhaar PDFs, cropped photos, and WhatsApp images.
* **5-Region Quadrant Cropping**: Automatically crops uploaded documents into 5 overlapping regions (Top-Left, Top-Right, Bottom-Left, Bottom-Right e-Aadhaar QR location, and Center) to detect small embedded QRs.
* **Non-Blocking Thread Yields**: Uses asynchronous event loop ticks to ensure 60FPS UI loading spinner animation during heavy canvas processing.

### 4. Comprehensive UIDAI Payload Parsing
* **Verified vs Unverified QR Badges**:
  * `✓ VERIFIED SECURE QR` (Green): Cryptographically authenticated V2/V3 UIDAI binary payload with 256-byte RSA digital signature.
  * `⚠️ UNVERIFIED / UNSECURED AADHAAR QR` (Amber/Red): Unencrypted legacy XML payload or unverified signature.
* **Extracted Demographics**:
  * Resident Name
  * Masked Aadhaar Number (`XXXX-XXXX-1234`)
  * Reference ID
  * Calculated Age (exact number derived from DOB)
  * Date of Birth & Gender
  * Full Postal Address (Care Of, House, Street, Landmark, Location, VTC, District, State, PIN Code)
  * Decompressed JP2000 Resident Photo
  * 256-Byte UIDAI Digital Signature
  * SHA-256 Mobile & Email Hashes
* **1-Click Export Handlers**: Copy verified data as formatted `JSON`, `Plain Text`, or `Raw Payload`.

---

## Tech Stack

* **Framework**: Next.js 16 (App Router)
* **Language**: TypeScript (Strict Mode)
* **Styling**: SCSS Modules (Vanilla CSS Tokens, Responsive Design System)
* **QR Engine**: `@yudiel/react-qr-scanner` & `qr-scanner`
* **Formatting & Linting**: Biome

---

## Getting Started

### 1. Installation

```bash
npm install
```

### 2. Development Server

Run standard development server:

```bash
npm run dev
```

For mobile device camera testing over local HTTPS (WebRTC requires HTTPS/localhost):

```bash
npm run dev:https
```

Open `https://localhost:3000` or your local IP address on mobile devices.

### 3. Production Build

```bash
npm run build
npm run start
```

---

## Architecture Overview

```
src/
├── app/
│   └── (client)/
│       └── page.tsx              # Main application page
├── components/
│   ├── Scanner.tsx               # Live camera viewport & tab controls
│   ├── ResultCard.tsx            # Demographics display & export buttons
│   ├── scanner.module.scss       # Viewport & controls styling
│   └── resultCard.module.scss    # Verification card styling
├── lib/
│   └── aadhaar/
│       └── parser.ts             # Binary V2/V3 & XML legacy parser
└── utils/
    ├── qrScanner.util.ts         # Multi-pass image enhancement pipeline
    └── jp2k.util.ts              # OpenJPEG / JP2000 photo decoder
```

---

## License

MIT License
