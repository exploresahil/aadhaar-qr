import sys
import os
import json
import zlib
import numpy as np
from PIL import Image

def decode_qr_image(image_path):
    """
    Decodes Aadhaar QR code image using OpenCV multi-pass pipeline.
    Returns JSON dictionary with raw payload, decompressed bytes, parsed fields, and signature.
    """
    import cv2

    abs_path = os.path.abspath(image_path)
    if not os.path.exists(abs_path):
        return {"success": False, "error": f"Image file not found: {abs_path}"}

    try:
        pil_img = Image.open(abs_path).convert("RGB")
        img = np.array(pil_img)[:, :, ::-1]  # RGB to BGR
    except Exception as e:
        return {"success": False, "error": f"Could not load image: {str(e)}"}

    detector = cv2.QRCodeDetector()
    raw_text = ""

    # Check if zxingcpp is available
    zxingcpp_module = None
    try:
        import zxingcpp

        zxingcpp_module = zxingcpp
    except ImportError:
        pass

    def try_decode(target_img):
        nonlocal raw_text
        if raw_text:
            return True

        # Try zxingcpp first if available
        if zxingcpp_module:
            try:
                results = zxingcpp_module.read_barcodes(
                    target_img,
                    try_rotate=True,
                    try_downscale=True,
                    try_invert=True,
                )
                for r in results:
                    if r.text and len(r.text.strip()) > 20:
                        raw_text = r.text.strip()
                        return True
            except Exception:
                pass

        # Try OpenCV QRCodeDetector
        try:
            data, _, _ = detector.detectAndDecode(target_img)
            if data and len(data.strip()) > 20:
                raw_text = data.strip()
                return True
        except Exception:
            pass

        return False

    h, w = img.shape[:2]

    # Build image region passes (full image + 3x3 sub-region crops for full document Aadhaar cards)
    region_crops = [img]

    if h > 200 and w > 200:
        for y_ratio in [0.0, 0.25, 0.5]:
            for x_ratio in [0.0, 0.25, 0.5]:
                y1 = int(h * y_ratio)
                y2 = int(h * min(1.0, y_ratio + 0.55))
                x1 = int(w * x_ratio)
                x2 = int(w * min(1.0, x_ratio + 0.55))
                if y2 > y1 + 50 and x2 > x1 + 50:
                    region_crops.append(img[y1:y2, x1:x2])

    for crop in region_crops:
        if raw_text:
            break

        ch, cw = crop.shape[:2]

        # Multi-pass detection pipeline per crop
        passes = [
            crop,
            cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY),
            cv2.convertScaleAbs(crop, alpha=1.8, beta=10),
        ]

        # Add white padding border (Quiet Zone)
        padded = cv2.copyMakeBorder(
            crop, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=[255, 255, 255]
        )
        passes.append(padded)

        # Scale passes (up to 4.0x for low-res full document crops)
        for scale in [1.5, 2.0, 3.0, 4.0]:
            if cw * scale <= 3500 and ch * scale <= 3500:
                up_crop = cv2.resize(
                    crop,
                    (0, 0),
                    fx=scale,
                    fy=scale,
                    interpolation=cv2.INTER_CUBIC,
                )
                passes.append(
                    cv2.copyMakeBorder(
                        up_crop,
                        30,
                        30,
                        30,
                        30,
                        cv2.BORDER_CONSTANT,
                        value=[255, 255, 255],
                    )
                )

        for p_img in passes:
            if try_decode(p_img):
                break

    if not raw_text:
        return {
            "success": False,
            "error": "No QR code pattern detected in full image or cropped regions via Python QR detector.",
        }

    clean_str = raw_text.replace(" ", "").strip()
    is_bigint = clean_str.isdigit()

    if (
        clean_str.startswith("{")
        or clean_str.startswith("[")
        or "hidn" in raw_text
        or "hid" in raw_text
        or "health" in raw_text
    ):
        return {
            "success": False,
            "error": "Invalid QR Code: Scanned QR code is not a valid UIDAI Aadhaar QR code.",
        }

    import re
    if "PrintLetterBarcodeData" in raw_text or "uid=" in raw_text or "<?xml" in raw_text:
        def get_attr(attr):
            m = re.search(r'' + attr + r'=(?:"|\')([^"\']*)(?:"|\')', raw_text, re.IGNORECASE)
            return m.group(1).strip() if m else ""

        ref_id = get_attr("uid")
        name = get_attr("name")
        if not ref_id and not name:
            return {
                "success": False,
                "error": "Invalid QR Code: Scanned QR code is not a valid UIDAI Aadhaar QR code.",
            }

        parsed = {
            "version": "XML (Legacy)",
            "bitIndicator": 0,
            "referenceId": ref_id,
            "name": name,
            "dob": get_attr("dob") or get_attr("yob"),
            "gender": get_attr("gender"),
            "careOf": get_attr("co") or get_attr("gname"),
            "district": get_attr("dist"),
            "landmark": get_attr("lm"),
            "house": get_attr("house"),
            "location": get_attr("loc"),
            "pincode": get_attr("pc") or get_attr("pincode"),
            "postOffice": get_attr("po"),
            "state": get_attr("state"),
            "street": get_attr("street"),
            "subDistrict": get_attr("subdist"),
            "vtc": get_attr("vtc"),
            "mobile": None,
            "isVerified": False
        }
        return {
            "success": True,
            "version": "XML (Legacy)",
            "raw_text": raw_text,
            "raw_len": len(raw_text),
            "compressed_len": len(raw_text),
            "decompressed_len": len(raw_text),
            "fields": [raw_text],
            "parsed": parsed,
            "signatureHex": "", # XML QR code has NO RSA digital signature
            "photoLen": 0,
            "photoBase64": "",
            "isVerified": False
        }

    if is_bigint:
        big_num = int(clean_str)
        hex_str = hex(big_num)[2:]
        if len(hex_str) % 2 != 0:
            hex_str = "0" + hex_str
        raw_bytes = bytes.fromhex(hex_str)

        try:
            decompressed = zlib.decompress(raw_bytes, 15 + 32)
        except Exception:
            try:
                decompressed = zlib.decompress(raw_bytes, 15)
            except Exception:
                decompressed = raw_bytes
    else:
        decompressed = raw_text.encode("iso-8859-1")

    # Locate photo SOC marker (0xFF 0x4F)
    soc_pos = decompressed.find(b"\xff\x4f")
    text_end = len(decompressed)
    if soc_pos != -1:
        text_end = soc_pos - 1 if decompressed[soc_pos - 1] == 255 else soc_pos

    text_bytes = decompressed[:text_end]
    parts = text_bytes.split(b"\xff")
    fields = [p.decode("iso-8859-1", errors="replace") for p in parts]

    first_field = fields[0].strip() if fields else ""
    is_v5 = first_field == "V5" or first_field.startswith("V5")
    version = "V5" if is_v5 else "V2/V3"
    offset = 1 if is_v5 else 0

    bit_indicator_raw = fields[1] if is_v5 and len(fields) > 1 else (fields[0] if fields else "0")
    bit_indicator = int(bit_indicator_raw) if bit_indicator_raw.strip().isdigit() else 0

    def get_field(idx):
        return fields[idx] if idx < len(fields) else ""

    parsed_name = get_field(offset + 2).strip()
    parsed_ref_id = get_field(offset + 1).strip()

    if not parsed_name and not parsed_ref_id:
        return {
            "success": False,
            "error": "Invalid QR Code: Scanned QR code is not a valid UIDAI Aadhaar QR code.",
        }

    parsed = {
        "version": version,
        "bitIndicator": bit_indicator,
        "referenceId": parsed_ref_id,
        "name": parsed_name,
        "dob": get_field(offset + 3),
        "gender": get_field(offset + 4),
        "careOf": get_field(offset + 5),
        "district": get_field(offset + 6),
        "landmark": get_field(offset + 7),
        "house": get_field(offset + 8),
        "location": get_field(offset + 9),
        "pincode": get_field(offset + 10),
        "postOffice": get_field(offset + 11),
        "state": get_field(offset + 12),
        "street": get_field(offset + 13),
        "subDistrict": get_field(offset + 14),
        "vtc": get_field(offset + 15),
        "mobile": get_field(offset + 16) if is_v5 and len(fields) > offset + 16 else None,
    }

    sig_size = 256
    sig_hex = decompressed[-sig_size:].hex() if len(decompressed) >= sig_size else ""

    import base64

    eoc_pos = decompressed.find(b"\xff\xd9", soc_pos if soc_pos != -1 else 0)
    photo_end = eoc_pos + 2 if eoc_pos != -1 else len(decompressed) - sig_size
    photo_bytes = decompressed[soc_pos:photo_end] if soc_pos != -1 else b""
    photo_base64 = base64.b64encode(photo_bytes).decode("ascii") if photo_bytes else ""

    return {
        "success": True,
        "version": version,
        "raw_text": raw_text,
        "raw_len": len(raw_text),
        "compressed_len": len(raw_bytes) if is_bigint else len(raw_text),
        "decompressed_len": len(decompressed),
        "fields": fields,
        "parsed": parsed,
        "signatureHex": sig_hex,
        "photoLen": len(photo_bytes),
        "photoBase64": photo_base64,
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: python decode_aadhaar_qr.py <image_path>"}))
        sys.exit(1)

    result = decode_qr_image(sys.argv[1])
    print(json.dumps(result, indent=2))
