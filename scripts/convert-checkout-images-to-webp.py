import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parent.parent
IMAGE_DIRECTORY = PROJECT_ROOT / "images" / "checkout" / "components"
THUMBNAIL_DIRECTORY = IMAGE_DIRECTORY / "thumbnails"
DOWNLOAD_MANIFEST = IMAGE_DIRECTORY / "download-manifest.json"
LOCAL_IMAGE_MAP = PROJECT_ROOT / "scripts" / "checkout-local-images.json"
SOURCE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
WEBP_QUALITY = 82
THUMBNAIL_QUALITY = 68
THUMBNAIL_SIZE = (360, 270)


def web_path(path: Path) -> str:
    return f"/images/checkout/components/{path.name}"


def encode_webp(source: Path, destination: Path) -> None:
    temporary = destination.with_name(f"{destination.name}.tmp")
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.save(
            temporary,
            format="WEBP",
            quality=WEBP_QUALITY,
            method=6,
            exact=True,
        )

    with Image.open(temporary) as verified:
        verified.load()
        if verified.width <= 0 or verified.height <= 0:
            raise ValueError(f"Converted image has invalid dimensions: {source.name}")

    if destination.exists() and destination.stat().st_size <= temporary.stat().st_size:
        temporary.unlink()
    else:
        temporary.replace(destination)


def encode_thumbnail(source: Path, destination: Path) -> None:
    temporary = destination.with_name(f"{destination.name}.tmp")
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
        image.save(
            temporary,
            format="WEBP",
            quality=THUMBNAIL_QUALITY,
            method=6,
            exact=True,
        )

    with Image.open(temporary) as verified:
        verified.load()
        if verified.width <= 0 or verified.height <= 0:
            raise ValueError(f"Thumbnail has invalid dimensions: {source.name}")

    temporary.replace(destination)


def update_download_manifest(replacements: dict[str, str]) -> None:
    if not DOWNLOAD_MANIFEST.exists():
        return

    manifest = json.loads(DOWNLOAD_MANIFEST.read_text(encoding="utf-8"))
    for item in manifest.get("items", []):
        current = item.get("localImage")
        replacement = replacements.get(current)
        if not replacement:
            continue
        image_path = PROJECT_ROOT / replacement.lstrip("/")
        contents = image_path.read_bytes()
        item["localImage"] = replacement
        item["mimeType"] = "image/webp"
        item["bytes"] = len(contents)
        item["sha256"] = hashlib.sha256(contents).hexdigest()

    DOWNLOAD_MANIFEST.write_text(
        f"{json.dumps(manifest, indent=2, ensure_ascii=False)}\n",
        encoding="utf-8",
    )


def update_local_image_map(replacements: dict[str, str]) -> None:
    if not LOCAL_IMAGE_MAP.exists():
        return

    mappings = json.loads(LOCAL_IMAGE_MAP.read_text(encoding="utf-8"))
    for item in mappings:
        current = f"/images/checkout/components/{item['file']}"
        replacement = replacements.get(current)
        if replacement:
            item["file"] = Path(replacement).name

    LOCAL_IMAGE_MAP.write_text(
        f"{json.dumps(mappings, indent=2, ensure_ascii=False)}\n",
        encoding="utf-8",
    )


def main() -> None:
    for temporary in IMAGE_DIRECTORY.glob("*.webp.tmp"):
        temporary.unlink()

    sources = sorted(
        path for path in IMAGE_DIRECTORY.iterdir()
        if path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS
    )
    original_bytes = sum(
        path.stat().st_size for path in IMAGE_DIRECTORY.iterdir()
        if path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS | {".webp"}
    )
    replacements: dict[str, str] = {}

    for source in sources:
        destination = source.with_suffix(".webp")
        if destination.exists():
            with Image.open(destination) as verified:
                verified.load()
                if verified.width <= 0 or verified.height <= 0:
                    raise ValueError(f"Existing WebP has invalid dimensions: {destination.name}")
        else:
            encode_webp(source, destination)
        replacements[web_path(source)] = web_path(destination)

    update_download_manifest(replacements)
    update_local_image_map(replacements)

    for source in sources:
        source.unlink()

    final_images = [
        path for path in IMAGE_DIRECTORY.iterdir()
        if path.is_file() and path.suffix.lower() == ".webp"
    ]
    THUMBNAIL_DIRECTORY.mkdir(exist_ok=True)
    expected_thumbnails = {path.name for path in final_images}
    for stale in THUMBNAIL_DIRECTORY.glob("*.webp"):
        if stale.name not in expected_thumbnails:
            stale.unlink()
    for temporary in THUMBNAIL_DIRECTORY.glob("*.webp.tmp"):
        temporary.unlink()
    for image in final_images:
        encode_thumbnail(image, THUMBNAIL_DIRECTORY / image.name)

    final_bytes = sum(path.stat().st_size for path in final_images)
    thumbnail_bytes = sum(path.stat().st_size for path in THUMBNAIL_DIRECTORY.glob("*.webp"))
    saved_bytes = original_bytes - final_bytes
    percent = (saved_bytes / original_bytes * 100) if original_bytes else 0
    print(json.dumps({
        "converted": len(sources),
        "webpImages": len(final_images),
        "beforeBytes": original_bytes,
        "afterBytes": final_bytes,
        "savedBytes": saved_bytes,
        "savedPercent": round(percent, 1),
        "thumbnails": len(expected_thumbnails),
        "thumbnailBytes": thumbnail_bytes,
    }))


if __name__ == "__main__":
    main()
