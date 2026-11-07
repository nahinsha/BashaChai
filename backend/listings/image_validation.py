from pathlib import Path
import warnings

from PIL import Image, UnidentifiedImageError
from rest_framework import serializers


MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
SUPPORTED_EXTENSIONS = {
    ".jpg": ("JPEG", "JPG"),
    ".jpeg": ("JPEG", "JPEG"),
    ".png": ("PNG", "PNG"),
    ".webp": ("WEBP", "WEBP"),
}


def validate_listing_image(uploaded_file):
    size = getattr(uploaded_file, "size", 0)
    if size < 1:
        raise serializers.ValidationError({"image": ["The image must not be empty."]})
    if size > MAX_IMAGE_SIZE_BYTES:
        raise serializers.ValidationError(
            {"image": ["The image must not exceed 5 MB (5,242,880 bytes)."]}
        )

    extension = Path(uploaded_file.name).suffix.lower()
    expected = SUPPORTED_EXTENSIONS.get(extension)
    if expected is None:
        raise serializers.ValidationError(
            {"image": ["Use a JPG, JPEG, PNG, or WebP image."]}
        )

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            uploaded_file.seek(0)
            with Image.open(uploaded_file) as image:
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise serializers.ValidationError(
                        {"image": ["The image must not exceed 25 megapixels."]}
                    )
                detected_format = (image.format or "").upper()
                image.verify()
            uploaded_file.seek(0)
            with Image.open(uploaded_file) as image:
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise serializers.ValidationError(
                        {"image": ["The image must not exceed 25 megapixels."]}
                    )
                image.load()
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as error:
        uploaded_file.seek(0)
        raise serializers.ValidationError(
            {"image": ["The uploaded file is not a valid image."]}
        ) from error
    finally:
        uploaded_file.seek(0)

    expected_format, stored_format = expected
    if detected_format != expected_format:
        raise serializers.ValidationError(
            {"image": ["The file extension does not match its image format."]}
        )
    return stored_format, size, extension
