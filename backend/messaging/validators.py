from pathlib import Path
import warnings
import zipfile

from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx"}
IMAGE_FORMATS = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
}


def validate_message_attachment(upload):
    extension = Path(upload.name or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationError("Attach a JPG, JPEG, PNG, WebP, PDF, DOC, or DOCX file.")
    if upload.size > settings.MESSAGE_ATTACHMENT_MAX_BYTES:
        limit_mb = settings.MESSAGE_ATTACHMENT_MAX_BYTES // (1024 * 1024)
        raise ValidationError(f"Each attachment must be {limit_mb} MB or smaller.")

    try:
        if extension in IMAGE_FORMATS:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(upload) as image:
                    if image.format != IMAGE_FORMATS[extension]:
                        raise ValidationError("The image content does not match its file extension.")
                    image.verify()
        elif extension == ".pdf":
            if not upload.read(5).startswith(b"%PDF-"):
                raise ValidationError("The PDF content does not match its file extension.")
        elif extension == ".doc":
            if upload.read(8) != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
                raise ValidationError("The Word document content does not match its file extension.")
        else:
            with zipfile.ZipFile(upload) as document:
                entries = document.infolist()
                names = {entry.filename for entry in entries}
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    raise ValidationError("The DOCX content does not match its file extension.")
                if len(entries) > 2000 or sum(entry.file_size for entry in entries) > 100 * 1024 * 1024:
                    raise ValidationError("The DOCX contains too much uncompressed data.")
                if document.getinfo("[Content_Types].xml").file_size > 64 * 1024:
                    raise ValidationError("The DOCX content does not match its file extension.")
                content_types = document.read("[Content_Types].xml")
                if (
                    b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" not in content_types
                    or b"macroEnabled" in content_types
                ):
                    raise ValidationError("The DOCX content does not match its file extension.")
    except (
        UnidentifiedImageError,
        OSError,
        zipfile.BadZipFile,
        zipfile.LargeZipFile,
        RuntimeError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as error:
        raise ValidationError("This file is not a valid supported attachment.") from error
    finally:
        upload.seek(0)

    return upload
