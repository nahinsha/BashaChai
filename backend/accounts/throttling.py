import hashlib
import hmac
import ipaddress
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import DatabaseError, transaction
from django.utils import timezone
from rest_framework.throttling import BaseThrottle

from .models import AuthRateLimitBucket


class PersistentAuthRateThrottle(BaseThrottle):
    """Database-backed rate limit suitable for multi-worker Render services."""

    def __init__(self, scope, identity):
        self.scope = scope
        self.identity = identity
        self.wait_seconds = None

    def _identity_value(self, request):
        if self.identity == "ip":
            # Render supplies the original client address as the first XFF entry.
            forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
            candidate = forwarded_for.split(",", 1)[0].strip()
            if candidate:
                try:
                    return str(ipaddress.ip_address(candidate))
                except ValueError:
                    pass
            remote_addr = request.META.get("REMOTE_ADDR", "unknown")
            try:
                return str(ipaddress.ip_address(remote_addr))
            except ValueError:
                return "unknown"

        try:
            email = request.data.get("email", "")
        except Exception:
            email = ""
        return str(email).strip().casefold() or "unknown"

    def allow_request(self, request, view):
        limit, duration = settings.AUTH_THROTTLE_RATES[self.scope]
        if not limit:
            return True

        identity_value = self._identity_value(request)
        key = hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            f"basachai:{self.scope}:{identity_value}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        now = timezone.now()

        try:
            with transaction.atomic():
                bucket, _created = AuthRateLimitBucket.objects.get_or_create(
                    key=key,
                    defaults={
                        "window_started_at": now,
                        "expires_at": now + timedelta(seconds=duration),
                        "count": 0,
                    },
                )
                bucket = AuthRateLimitBucket.objects.select_for_update().get(pk=key)

                if bucket.expires_at <= now:
                    bucket.window_started_at = now
                    bucket.expires_at = now + timedelta(seconds=duration)
                    bucket.count = 0

                if bucket.count >= limit:
                    self.wait_seconds = max(1, int((bucket.expires_at - now).total_seconds()))
                    allowed = False
                else:
                    bucket.count += 1
                    bucket.save(
                        update_fields=("window_started_at", "expires_at", "count")
                    )
                    allowed = True

                # Bound stale rows without a scheduled job or a Redis service.
                if secrets.randbelow(100) == 0:
                    expired_keys = AuthRateLimitBucket.objects.filter(
                        expires_at__lte=now
                    ).order_by("expires_at").values("key")[:500]
                    AuthRateLimitBucket.objects.filter(key__in=expired_keys).delete()

                return allowed
        except DatabaseError:
            # Authentication and registration must fail closed if limits cannot
            # be checked against the production database.
            self.wait_seconds = 60
            return False

    def wait(self):
        return self.wait_seconds
