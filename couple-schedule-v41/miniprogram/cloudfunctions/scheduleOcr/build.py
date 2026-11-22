"""Build the Linux Python 3.11 CloudBase ZIP using official PaddleOCR ONNX models.

Run from Windows with ``py build.py``; uv must be on PATH. The output stays in
the system temporary directory, outside the mini program upload package.
"""

import os
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent
BUILD = pathlib.Path(tempfile.gettempdir()) / "claswee-schedule-ocr-rapid-build"
DEPS = BUILD / "deps"
MODELS = BUILD / "models"
OUTPUT = BUILD / "scheduleOcr.zip"
BASE = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/"
MODEL_NAMES = ("PP-OCRv5_mobile_det", "PP-OCRv5_mobile_rec")


def download_model(name):
    destination = MODELS / name
    if (destination / "inference.onnx").is_file() and (destination / "inference.yml").is_file():
        return
    destination.mkdir(parents=True, exist_ok=True)
    archive = BUILD / f"{name}.tar"
    if not archive.is_file():
        urllib.request.urlretrieve(BASE + name + "_onnx_infer.tar", archive)
    with tarfile.open(archive) as source:
        for member in source.getmembers():
            leaf = pathlib.PurePosixPath(member.name).name
            if leaf in ("inference.onnx", "inference.yml") and member.isfile():
                with source.extractfile(member) as stream:
                    (destination / leaf).write_bytes(stream.read())
    if not (destination / "inference.onnx").is_file() or not (destination / "inference.yml").is_file():
        raise RuntimeError(f"Incomplete official model: {name}")


def download_auxiliary():
    assets = {
        "ch_ppocr_mobile_v2.0_cls_mobile.onnx": "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv4/cls/ch_ppocr_mobile_v2.0_cls_mobile.onnx",
        "ppocrv5_dict.txt": "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/dict/ppocrv5_dict.txt",
    }
    for filename, url in assets.items():
        destination = MODELS / filename
        if not destination.is_file():
            urllib.request.urlretrieve(url, destination)


def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    if not (DEPS / "rapidocr").exists():
        subprocess.run([
            "uv", "pip", "install", "--python-platform", "x86_64-unknown-linux-gnu",
            "--python-version", "3.11", "--target", str(DEPS), "--only-binary", ":all:",
            "-r", str(ROOT / "requirements.txt"),
        ], check=True)
    # RapidOCR currently depends on the GUI OpenCV wheel. SCF has no libGL,
    # so replace that wheel with the matching headless build before packaging.
    if not any(DEPS.glob("opencv_python_headless-*.dist-info")):
        for name in ("cv2", "opencv_python.libs"):
            target = DEPS / name
            if target.exists():
                shutil.rmtree(target)
        for target in DEPS.glob("opencv_python-*.dist-info"):
            shutil.rmtree(target)
        subprocess.run([
            "uv", "pip", "install", "--python-platform", "x86_64-unknown-linux-gnu",
            "--python-version", "3.11", "--target", str(DEPS), "--only-binary", ":all:",
            "--no-deps", "opencv-python-headless==5.0.0.93",
        ], check=True)
    for name in MODEL_NAMES:
        download_model(name)
    download_auxiliary()
    entries = [(ROOT / "index.py", "index.py")]
    for folder, prefix in ((DEPS, ""), (MODELS, "models/")):
        for path in folder.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(folder)
            if any(part in ("test", "tests", "__pycache__") for part in relative.parts):
                continue
            if path.suffix in (".pyc", ".pyi"):
                continue
            entries.append((path, prefix + relative.as_posix()))
    uncompressed = sum(path.stat().st_size for path, _ in entries)
    if uncompressed > 500_000_000:
        raise RuntimeError(f"Uncompressed CloudBase package too large: {uncompressed} bytes")
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path, name in entries:
            archive.write(path, name)
    print(f"Built {OUTPUT} ({OUTPUT.stat().st_size // 1_000_000} MB compressed, {uncompressed // 1_000_000} MB uncompressed)")


if __name__ == "__main__":
    main()
