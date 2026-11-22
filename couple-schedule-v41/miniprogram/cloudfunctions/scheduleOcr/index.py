"""Private CloudBase event function: PaddleOCR text boxes and readable crops."""

import base64
from concurrent.futures import ThreadPoolExecutor
import io
import hmac
import math
import os

from PIL import Image, ImageOps

_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        from rapidocr import EngineType, ModelType, OCRVersion, RapidOCR

        model_root = os.environ.get("SCHEDULE_OCR_MODEL_DIR") or os.path.join(os.path.dirname(__file__), "models")
        det = os.path.join(model_root, "PP-OCRv5_mobile_det")
        rec = os.path.join(model_root, "PP-OCRv5_mobile_rec")
        options = {
            "Global.use_cls": False,
            "Global.model_root_dir": str(model_root),
            "Global.log_level": "error",
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.ocr_version": OCRVersion.PPOCRV5,
            "Det.model_type": ModelType.MOBILE,
            "Det.model_path": os.path.join(det, "inference.onnx"),
            "Cls.model_path": os.path.join(model_root, "ch_ppocr_mobile_v2.0_cls_mobile.onnx"),
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_type": ModelType.MOBILE,
            "Rec.model_path": os.path.join(rec, "inference.onnx"),
            "Rec.rec_keys_path": os.path.join(model_root, "ppocrv5_dict.txt"),
        }
        _pipeline = RapidOCR(params=options)
    return _pipeline


def _bands(height):
    count = min(4, max(1, math.ceil(height / 1250)))
    return [(max(0, round(i * height / count) - (35 if i else 0)),
             min(height, round((i + 1) * height / count) + (35 if i < count - 1 else 0)))
            for i in range(count)]


def _recognize_band(image, top, pipeline):
    import numpy as np

    result = pipeline(np.asarray(image)[:, :, ::-1].copy())
    if result.boxes is None or result.txts is None or result.scores is None:
        return []
    lines = []
    for text, score, points in zip(result.txts, result.scores, result.boxes):
        if not text or float(score) < 0.35:
            continue
        x1, y1 = np.min(points, axis=0)
        x2, y2 = np.max(points, axis=0)
        lines.append({"text": str(text)[:100], "score": round(float(score), 3),
                      "box": [int(x1), int(y1) + top, int(x2), int(y2) + top]})
    return lines


def _unique_lines(lines):
    kept = []
    for line in sorted(lines, key=lambda item: (item["box"][1], item["box"][0], -item["score"])):
        if any(old["text"] == line["text"] and abs(old["box"][0] - line["box"][0]) < 12
               and abs(old["box"][1] - line["box"][1]) < 12 for old in kept):
            continue
        line["id"] = f"t{len(kept) + 1}"
        kept.append(line)
        if len(kept) >= 500:
            break
    return kept


def _process_band(image, top, bottom, pipeline, include_crop):
    crop = image.crop((0, top, image.width, bottom))
    lines = _recognize_band(crop, top, pipeline)
    if not include_crop:
        return lines, None
    output = io.BytesIO()
    crop.save(output, format="JPEG", quality=82, optimize=True)
    return lines, {"top": top, "bottom": bottom,
                   "image": "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")}


def main_handler(event, context):
    expected_token = os.environ.get("SCHEDULE_OCR_SERVICE_KEY", "")
    supplied_token = event.get("token", "") if isinstance(event, dict) else ""
    if not expected_token or not isinstance(supplied_token, str) or not hmac.compare_digest(supplied_token, expected_token):
        raise PermissionError("private OCR function")
    image_url = event.get("image", "") if isinstance(event, dict) else ""
    if not isinstance(image_url, str) or not image_url.startswith("data:image/") or ";base64," not in image_url:
        raise ValueError("invalid image")
    encoded = image_url.split(",", 1)[1]
    if len(encoded) > 4 * 1024 * 1024 + 100:
        raise ValueError("image too large")
    raw = base64.b64decode(encoded, validate=True)
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    width, height = image.size
    if width < 40 or height < 40 or width * height > 40_000_000:
        raise ValueError("invalid image dimensions")
    pipeline = _get_pipeline()
    bands = _bands(height)
    lines, crops = [], []
    workers = max(1, min(4, int(os.environ.get("SCHEDULE_OCR_WORKERS", "4")), len(bands)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(lambda band: _process_band(image, band[0], band[1], pipeline, len(bands) > 1), bands))
    for band_lines, crop in results:
        lines.extend(band_lines)
        if crop:
            crops.append(crop)
    return {"width": width, "height": height, "lines": _unique_lines(lines), "crops": crops}
