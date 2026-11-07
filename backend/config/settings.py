import os
import secrets
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default):
    value = os.environ.get(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized not in {"true", "false", "1", "0", "yes", "no", "on", "off"}:
        raise ImproperlyConfigured(f"{name} must be a boolean value.")
    return normalized in {"true", "1", "yes", "on"}


def env_list(name, default=()):
    value = os.environ.get(name)
    if value is None:
        return list(default)
    return [item.strip() for item in value.split(",") if item.strip()]


def env_origins(name, default=()):
    origins = env_list(name, default)
    schemes = {"https"} if not DEBUG else {"http", "https"}
    for origin in origins:
        try:
            parsed = urlsplit(origin)
            valid_host = bool(parsed.hostname)
            parsed.port
        except ValueError:
            raise ImproperlyConfigured(
                f"{name} must contain explicit {', '.join(sorted(schemes)).upper()} origins without paths or wildcards."
            ) from None
        if (
            "*" in origin
            or parsed.scheme not in schemes
            or not valid_host
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            scheme_message = "HTTPS" if not DEBUG else "HTTP or HTTPS"
            raise ImproperlyConfigured(
                f"{name} must contain explicit {scheme_message} origins without paths or wildcards."
            )
    return [origin.rstrip("/") for origin in origins]


DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be configured when DEBUG is false.")
    SECRET_KEY = secrets.token_urlsafe(50)

ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    default=("127.0.0.1", "localhost") if DEBUG else (),
)
if any("*" in host for host in ALLOWED_HOSTS):
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must not contain a wildcard host.")

CORS_ALLOWED_ORIGINS = env_origins("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = False
CORS_URLS_REGEX = r"^/api/.*$"
CSRF_TRUSTED_ORIGINS = env_origins("CSRF_TRUSTED_ORIGINS")

SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = not DEBUG
SECURE_PROXY_SSL_HEADER = (
    ("HTTP_X_FORWARDED_PROTO", "https") if not DEBUG else None
)
SECURE_HSTS_SECONDS = int(
    os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "0" if DEBUG else "31536000")
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", False
)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", False)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",

    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "accounts.apps.AccountsConfig",
    "listings.apps.ListingsConfig",
    "shortlist.apps.ShortlistConfig",
    "messaging.apps.MessagingConfig",
    "viewing_requests.apps.ViewingRequestsConfig",
    "moderation.apps.ModerationConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

if not DEBUG:
    MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")

ROOT_URLCONF = "config.urls"
TEMPLATES = []
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

database_url = os.environ.get("DATABASE_URL", "").strip()
if database_url:
    DATABASES = {
        "default": dj_database_url.parse(database_url, conn_max_age=60),
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DB_NAME", "basachai"),
            "USER": os.environ.get("DB_USER", "basachai_app"),
            "PASSWORD": os.environ.get("DB_PASSWORD", ""),
            "HOST": os.environ.get("DB_HOST", "127.0.0.1"),
            "PORT": os.environ.get("DB_PORT", "5432"),
            "CONN_MAX_AGE": 60,
        }
    }

if not DEBUG:
    database_options = DATABASES["default"].setdefault("OPTIONS", {})
    sslmode = str(database_options.get("sslmode", "")).lower()
    if sslmode not in {"require", "verify-ca", "verify-full"}:
        database_options["sslmode"] = "require"

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]
# Django's auth.E003 check does not recognize the documented Lower(email)
# unique constraint as satisfying USERNAME_FIELD uniqueness.
SILENCED_SYSTEM_CHECKS = ["auth.E003"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Dhaka"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
MESSAGE_ATTACHMENT_ROOT = Path(
    os.environ.get("MESSAGE_ATTACHMENT_ROOT", BASE_DIR / "private_uploads" / "messages")
)
if not DEBUG:
    required_supabase_s3_settings = {
        "SUPABASE_S3_ACCESS_KEY_ID": os.environ.get("SUPABASE_S3_ACCESS_KEY_ID"),
        "SUPABASE_S3_SECRET_ACCESS_KEY": os.environ.get("SUPABASE_S3_SECRET_ACCESS_KEY"),
        "SUPABASE_S3_ENDPOINT_URL": os.environ.get("SUPABASE_S3_ENDPOINT_URL"),
    }
    missing_supabase_s3_settings = [
        name for name, value in required_supabase_s3_settings.items() if not value
    ]
    if missing_supabase_s3_settings:
        raise ImproperlyConfigured(
            "The following Supabase S3 settings are required when DEBUG is false: "
            + ", ".join(missing_supabase_s3_settings)
        )

    if not required_supabase_s3_settings["SUPABASE_S3_ENDPOINT_URL"].startswith(
        "https://"
    ):
        raise ImproperlyConfigured("SUPABASE_S3_ENDPOINT_URL must use HTTPS.")

    supabase_s3_storage_options = {
        "access_key": required_supabase_s3_settings["SUPABASE_S3_ACCESS_KEY_ID"],
        "secret_key": required_supabase_s3_settings["SUPABASE_S3_SECRET_ACCESS_KEY"],
        "endpoint_url": required_supabase_s3_settings["SUPABASE_S3_ENDPOINT_URL"],
        "region_name": "ap-south-1",
        "addressing_style": "path",
        "signature_version": "s3v4",
        "default_acl": None,
        "querystring_auth": False,
        "file_overwrite": False,
    }
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                **supabase_s3_storage_options,
                "bucket_name": "basachai-media",
            },
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
        "private_attachments": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                **supabase_s3_storage_options,
                "bucket_name": "basachai-private",
            },
        },
    }
else:
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
        "private_attachments": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {
                "location": MESSAGE_ATTACHMENT_ROOT,
                "file_permissions_mode": 0o640,
                "directory_permissions_mode": 0o750,
            },
        },
    }
MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
MESSAGE_ATTACHMENT_MAX_FILES = 5
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "3"))
PASSWORD_RESET_FRONTEND_URL = os.environ.get("PASSWORD_RESET_FRONTEND_URL")
if PASSWORD_RESET_FRONTEND_URL:
    PASSWORD_RESET_FRONTEND_URL = PASSWORD_RESET_FRONTEND_URL.strip()

if not PASSWORD_RESET_FRONTEND_URL:
    if not DEBUG:
        raise ImproperlyConfigured(
            "PASSWORD_RESET_FRONTEND_URL must be configured when DEBUG is false."
        )
    PASSWORD_RESET_FRONTEND_URL = "http://localhost:5173"

REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "accounts.exceptions.api_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "message_send": "10/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.environ.get("JWT_ACCESS_LIFETIME_MINUTES", "30"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.environ.get("JWT_REFRESH_LIFETIME_DAYS", "7"))
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "SIGNING_KEY": os.environ.get("JWT_SIGNING_KEY", SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
