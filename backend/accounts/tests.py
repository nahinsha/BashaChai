import os
from pathlib import Path
import runpy
from datetime import timedelta
from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import ImproperlyConfigured
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.deletion import ProtectedError
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
from PIL import Image
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.test import APIClient, APITransactionTestCase, APITestCase

from .exceptions import api_exception_handler
from .models import RoleMembership
from .managers import UserManager
from .serializers import LoginSerializer, ProfileUpdateSerializer, RegistrationSerializer

User = get_user_model()


def make_profile_picture(filename="profile.jpg", image_format="JPEG"):
    stream = BytesIO()
    Image.new("RGB", (8, 8), color="teal").save(stream, format=image_format)
    content_type = "image/jpeg" if image_format == "JPEG" else f"image/{image_format.lower()}"
    return SimpleUploadedFile(filename, stream.getvalue(), content_type=content_type)


class RegistrationTests(APITestCase):
    endpoint = "/api/v1/auth/register/"

    def register(self, roles=None, email="seeker@example.com"):
        return self.client.post(
            self.endpoint,
            {
                "email": email,
                "password": "A-strong-random-password-42!",
                "full_name": "A BasaChai User",
                "roles": roles or [RoleMembership.Role.HOME_SEEKER],
            },
            format="json",
        )

    def test_registration_creates_one_or_both_public_roles(self):
        response = self.register(
            roles=[
                RoleMembership.Role.HOME_SEEKER,
                RoleMembership.Role.PROPERTY_OWNER,
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="seeker@example.com")
        self.assertTrue(user.check_password("A-strong-random-password-42!"))
        self.assertCountEqual(
            user.roles,
            [RoleMembership.Role.HOME_SEEKER, RoleMembership.Role.PROPERTY_OWNER],
        )
        self.assertNotIn("password", response.data)

    def test_public_registration_rejects_admin_role(self):
        response = self.register(roles=[RoleMembership.Role.ADMIN_MODERATOR])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.exists())

    def test_email_is_unique_without_case_sensitivity(self):
        self.register(email="Seeker@Example.com")

        response = self.register(email="seeker@example.com")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(User.objects.count(), 1)

    def test_backend_controlled_fields_are_ignored(self):
        response = self.client.post(
            self.endpoint,
            {
                "email": "attacker@example.com",
                "password": "A-strong-random-password-42!",
                "full_name": "Attacker",
                "roles": [RoleMembership.Role.HOME_SEEKER],
                "is_staff": True,
                "is_superuser": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="attacker@example.com")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)


class SessionAndProfileTests(APITestCase):
    refresh_cookie_name = "basachai_refresh"

    def setUp(self):
        self.user = User.objects.create_user(
            email="owner@example.com",
            password="A-strong-random-password-42!",
            full_name="An Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )

    @override_settings(JWT_REFRESH_COOKIE_SECURE=True, JWT_REFRESH_COOKIE_SAMESITE="None")
    def test_login_returns_access_token_and_sets_http_only_refresh_cookie(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": "OWNER@example.com", "password": "A-strong-random-password-42!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn(self.refresh_cookie_name, response.cookies)
        self.assertTrue(response.cookies[self.refresh_cookie_name]["httponly"])
        self.assertTrue(response.cookies[self.refresh_cookie_name]["secure"])
        self.assertEqual(response.cookies[self.refresh_cookie_name]["samesite"], "None")
        self.assertEqual(response.data["user"]["roles"], [RoleMembership.Role.PROPERTY_OWNER])

    def test_login_uses_a_generic_failure(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": "owner@example.com", "password": "wrong-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["error"]["code"], "invalid_credentials")
        self.assertEqual(response.data["error"]["message"], "Email or password is incorrect.")

    def test_refresh_rotates_and_revokes_the_previous_token(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "owner@example.com", "password": "A-strong-random-password-42!"},
            format="json",
        )
        old_refresh = login.cookies[self.refresh_cookie_name].value

        refreshed = self.client.post("/api/v1/auth/token/refresh/", {}, format="json")
        rotated_refresh = refreshed.cookies[self.refresh_cookie_name].value
        self.client.cookies[self.refresh_cookie_name] = old_refresh
        reused = self.client.post("/api/v1/auth/token/refresh/", {}, format="json")

        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)
        self.assertIn("access", refreshed.data)
        self.assertNotIn("refresh", refreshed.data)
        self.assertNotEqual(rotated_refresh, old_refresh)
        self.assertEqual(reused.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(reused.data["error"]["code"], "invalid_token")

    def test_refresh_and_logout_reject_body_refresh_tokens(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "owner@example.com", "password": "A-strong-random-password-42!"},
            format="json",
        )
        old_refresh = login.cookies[self.refresh_cookie_name].value
        self.client.cookies.pop(self.refresh_cookie_name)

        body_refresh = self.client.post(
            "/api/v1/auth/token/refresh/", {"refresh": old_refresh}, format="json"
        )
        body_logout = self.client.post(
            "/api/v1/auth/logout/", {"refresh": old_refresh}, format="json"
        )

        self.assertEqual(body_refresh.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(body_logout.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.cookies[self.refresh_cookie_name] = old_refresh
        cookie_refresh = self.client.post("/api/v1/auth/token/refresh/", {}, format="json")
        self.assertEqual(cookie_refresh.status_code, status.HTTP_200_OK)
        self.assertNotIn("refresh", cookie_refresh.data)

    def test_logout_blacklists_refresh_without_access_authentication(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "owner@example.com", "password": "A-strong-random-password-42!"},
            format="json",
        )
        refresh = login.cookies[self.refresh_cookie_name].value

        logout = self.client.post("/api/v1/auth/logout/", {}, format="json")
        self.client.cookies[self.refresh_cookie_name] = refresh
        refresh_after_logout = self.client.post(
            "/api/v1/auth/token/refresh/", {}, format="json"
        )

        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(logout.cookies[self.refresh_cookie_name]["max-age"], "0")
        self.assertEqual(refresh_after_logout.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(refresh_after_logout.data["error"]["code"], "invalid_token")

    @override_settings(
        CSRF_TRUSTED_ORIGINS=["https://frontend.example"],
        CORS_ALLOWED_ORIGINS=["https://frontend.example"],
    )
    def test_login_refresh_and_logout_require_csrf_tokens(self):
        client = APIClient(enforce_csrf_checks=True)
        login_payload = {
            "email": "owner@example.com",
            "password": "A-strong-random-password-42!",
        }
        denied = client.post("/api/v1/auth/login/", login_payload, format="json")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        csrf = client.get("/api/v1/auth/csrf/")
        csrf_token = csrf.data["csrfToken"]
        self.assertTrue(csrf.cookies["csrftoken"]["httponly"])
        headers = {
            "HTTP_X_CSRFTOKEN": csrf_token,
            "HTTP_ORIGIN": "https://frontend.example",
        }
        login = client.post(
            "/api/v1/auth/login/", login_payload, format="json", **headers
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

        denied_refresh = client.post(
            "/api/v1/auth/token/refresh/",
            {},
            format="json",
            HTTP_ORIGIN="https://frontend.example",
        )
        self.assertEqual(denied_refresh.status_code, status.HTTP_403_FORBIDDEN)
        untrusted_origin = client.post(
            "/api/v1/auth/token/refresh/",
            {},
            format="json",
            HTTP_ORIGIN="https://attacker.example",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(untrusted_origin.status_code, status.HTTP_403_FORBIDDEN)
        refreshed = client.post(
            "/api/v1/auth/token/refresh/", {}, format="json", **headers
        )
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)

        denied_logout = client.post(
            "/api/v1/auth/logout/",
            {},
            format="json",
            HTTP_ORIGIN="https://frontend.example",
        )
        self.assertEqual(denied_logout.status_code, status.HTTP_403_FORBIDDEN)
        logout = client.post("/api/v1/auth/logout/", {}, format="json", **headers)
        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)

    @override_settings(
        CORS_ALLOWED_ORIGINS=["https://frontend.example"],
        CORS_ALLOW_CREDENTIALS=True,
    )
    def test_cors_preflight_allows_cookie_auth_headers_for_configured_origin(self):
        response = APIClient().options(
            "/api/v1/auth/token/refresh/",
            HTTP_ORIGIN="https://frontend.example",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type,x-csrftoken",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Access-Control-Allow-Origin"], "https://frontend.example"
        )
        self.assertEqual(response["Access-Control-Allow-Credentials"], "true")
        allowed_headers = response["Access-Control-Allow-Headers"].lower()
        self.assertIn("authorization", allowed_headers)
        self.assertIn("x-csrftoken", allowed_headers)

    def test_me_requires_authentication_and_adds_only_a_public_role(self):
        anonymous = self.client.get("/api/v1/me/")
        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.user)
        changed = self.client.patch(
            "/api/v1/me/",
            {"add_role": RoleMembership.Role.HOME_SEEKER},
            format="json",
        )

        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.assertCountEqual(
            changed.data["roles"],
            [RoleMembership.Role.HOME_SEEKER, RoleMembership.Role.PROPERTY_OWNER],
        )

    def test_me_ignores_backend_controlled_and_read_only_fields(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            "/api/v1/me/",
            {
                "full_name": "Updated Owner",
                "email": "changed@example.com",
                "roles": [RoleMembership.Role.ADMIN_MODERATOR],
                "password": "changed-password",
                "is_active": False,
                "is_staff": True,
                "is_superuser": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "owner@example.com")
        self.assertEqual(self.user.full_name, "Updated Owner")
        self.assertTrue(self.user.is_active)
        self.assertFalse(self.user.is_staff)
        self.assertFalse(self.user.is_superuser)
        self.assertEqual(self.user.roles, [RoleMembership.Role.PROPERTY_OWNER])

    def test_me_accepts_a_request_containing_only_ignored_read_only_fields(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            "/api/v1/me/",
            {"email": "changed@example.com", "is_staff": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "owner@example.com")


@override_settings(
    AUTH_THROTTLE_RATES={
        "auth_login_ip": (100, 3600),
        "auth_login_email": (1, 3600),
        "auth_register_ip": (1, 3600),
        "auth_register_email": (10, 3600),
        "auth_password_reset_ip": (1, 3600),
        "auth_password_reset_email": (10, 3600),
    }
)
class AuthRateLimitTests(APITestCase):
    def assert_throttled(self, response):
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data["error"]["code"], "throttled")
        self.assertEqual(
            response.data["error"]["message"],
            "Too many requests in a short time. Please wait before trying again.",
        )

    def test_login_is_limited_by_email_even_when_client_ip_changes(self):
        first = self.client.post(
            "/api/v1/auth/login/",
            {"email": "limited@example.com", "password": "wrong"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/auth/login/",
            {"email": "LIMITED@example.com", "password": "wrong"},
            format="json",
            REMOTE_ADDR="192.0.2.4",
        )

        self.assertEqual(first.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assert_throttled(second)

    def test_registration_is_limited_by_client_ip(self):
        payload = {
            "email": "first@example.com",
            "password": "A-strong-random-password-42!",
            "full_name": "First Account",
            "roles": [RoleMembership.Role.HOME_SEEKER],
        }
        first = self.client.post("/api/v1/auth/register/", payload, format="json")
        payload["email"] = "second@example.com"
        second = self.client.post("/api/v1/auth/register/", payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assert_throttled(second)

    def test_password_reset_is_limited_by_client_ip(self):
        first = self.client.post(
            "/api/v1/auth/password-reset/",
            {"email": "first@example.com"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/auth/password-reset/",
            {"email": "second@example.com"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(
            first.data["message"],
            "If an account exists for that email, password recovery instructions will be sent.",
        )
        self.assert_throttled(second)

class ProfilePictureAPITests(APITransactionTestCase):
    def setUp(self):
        self.media_dir = TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.media_dir.cleanup)

        self.owner = User.objects.create_user(
            email="picture-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Picture Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        self.seeker = User.objects.create_user(
            email="picture-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Picture Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        self.other_owner = User.objects.create_user(
            email="picture-other-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Other Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        self.owner_client = APIClient()
        self.owner_client.force_authenticate(self.owner)
        self.seeker_client = APIClient()
        self.seeker_client.force_authenticate(self.seeker)
        self.other_owner_client = APIClient()
        self.other_owner_client.force_authenticate(self.other_owner)

    def upload_picture(self, client):
        return client.post(
            "/api/v1/me/profile-picture/",
            {"image": make_profile_picture()},
            format="multipart",
        )

    def test_account_owner_can_upload_change_and_remove_one_picture(self):
        anonymous_upload = APIClient().post(
            "/api/v1/me/profile-picture/",
            {"image": make_profile_picture()},
            format="multipart",
        )
        self.assertEqual(anonymous_upload.status_code, status.HTTP_401_UNAUTHORIZED)

        first = self.upload_picture(self.seeker_client)
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        first_url = first.data["profile_picture_url"]
        self.assertTrue(first_url)
        first_key = User.objects.get(pk=self.seeker.pk).profile_picture.name

        first_response = self.seeker_client.get(first_url)
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        b"".join(first_response.streaming_content)
        self.assertEqual(APIClient().get(first_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.owner_client.get(first_url).status_code,
            status.HTTP_404_NOT_FOUND,
        )

        changed = self.upload_picture(self.seeker_client)
        self.assertEqual(changed.status_code, status.HTTP_200_OK, changed.data)
        self.assertNotEqual(
            User.objects.get(pk=self.seeker.pk).profile_picture.name,
            first_key,
        )

        removed = self.seeker_client.delete("/api/v1/me/profile-picture/")
        self.assertEqual(removed.status_code, status.HTTP_200_OK, removed.data)
        self.assertIsNone(removed.data["profile_picture_url"])
        self.assertFalse(User.objects.get(pk=self.seeker.pk).profile_picture)

    def test_conversation_and_viewing_request_participants_can_see_each_others_pictures(self):
        from listings.models import Listing
        from messaging.models import Conversation
        from viewing_requests.models import ViewingRequest

        listing = Listing.objects.create(
            owner=self.owner,
            title="A published home",
            location="Dhaka",
            property_type="Flat",
            monthly_rent="20000.00",
            bedrooms=2,
            bathrooms=1,
            lifecycle_status="PUBLISHED",
            availability_status="AVAILABLE",
            availability_confirmed_at=timezone.now(),
        )
        conversation = Conversation.objects.create(listing=listing, seeker=self.seeker)
        seeker_picture = self.upload_picture(self.seeker_client)
        self.assertEqual(seeker_picture.status_code, status.HTTP_200_OK, seeker_picture.data)
        seeker_url = seeker_picture.data["profile_picture_url"]

        conversation_data = self.owner_client.get(
            f"/api/v1/conversations/{conversation.pk}/"
        ).data
        self.assertEqual(conversation_data["seeker"]["profile_picture_url"], seeker_url)
        seeker_resp = self.owner_client.get(seeker_url)
        self.assertEqual(seeker_resp.status_code, status.HTTP_200_OK)
        b"".join(seeker_resp.streaming_content)
        self.assertEqual(self.other_owner_client.get(seeker_url).status_code, status.HTTP_404_NOT_FOUND)

        viewing_seeker = User.objects.create_user(
            email="picture-viewing-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Viewing Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        viewing_client = APIClient()
        viewing_client.force_authenticate(viewing_seeker)
        viewing_picture = self.upload_picture(viewing_client)
        self.assertEqual(viewing_picture.status_code, status.HTTP_200_OK, viewing_picture.data)
        viewing_request = ViewingRequest.objects.create(
            listing=listing,
            seeker=viewing_seeker,
            preferred_at=timezone.now() + timedelta(days=2),
        )
        viewing_response = self.owner_client.get("/api/v1/viewing-requests/")
        shared_request = next(
            item for item in viewing_response.data["results"] if item["id"] == viewing_request.pk
        )
        self.assertEqual(
            shared_request["seeker"]["profile_picture_url"],
            viewing_picture.data["profile_picture_url"],
        )
        self.assertEqual(shared_request["owner"]["id"], self.owner.pk)
        viewing_resp = self.owner_client.get(viewing_picture.data["profile_picture_url"])
        self.assertEqual(
            viewing_resp.status_code,
            status.HTTP_200_OK,
        )
        b"".join(viewing_resp.streaming_content)
        self.assertEqual(
            self.other_owner_client.get(viewing_picture.data["profile_picture_url"]).status_code,
            status.HTTP_404_NOT_FOUND,
        )


class PasswordRecoveryTests(APITestCase):
    request_endpoint = "/api/v1/auth/password-reset/"
    confirm_endpoint = "/api/v1/auth/password-reset/confirm/"

    def setUp(self):
        self.user = User.objects.create_user(
            email="recover@example.com",
            password="A-strong-random-password-42!",
            full_name="Account Owner",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )

    def request_reset(self, email="recover@example.com"):
        return self.client.post(self.request_endpoint, {"email": email}, format="json")

    def reset_token_from_email(self):
        reset_url = next(
            line for line in mail.outbox[-1].body.splitlines() if line.startswith("http")
        )
        return parse_qs(urlparse(reset_url).fragment)["token"][0]

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        PASSWORD_RESET_FRONTEND_URL="https://basachai.example",
    )
    def test_request_is_generic_for_known_and_unknown_emails(self):
        known = self.request_reset("RECOVER@example.com")
        unknown = self.request_reset("unknown@example.com")

        self.assertEqual(known.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(unknown.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(
            known.data["message"],
            "If an account exists for that email, password recovery instructions will be sent.",
        )
        self.assertEqual(len(mail.outbox), 1)
        reset_url = next(
            line for line in mail.outbox[0].body.splitlines() if line.startswith("http")
        )
        self.assertEqual(urlparse(reset_url).scheme, "https")
        self.assertEqual(urlparse(reset_url).netloc, "basachai.example")
        self.assertEqual(urlparse(reset_url).path, "/reset-password")
        self.assertEqual(urlparse(reset_url).query, "")
        self.assertIn("token=", urlparse(reset_url).fragment)
        self.assertNotIn("recover@example.com", reset_url)
        self.assertEqual(User.objects.count(), 1)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_valid_token_changes_password_and_cannot_be_reused(self):
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.user.email, "password": "A-strong-random-password-42!"},
            format="json",
        )
        old_refresh = login.cookies["basachai_refresh"].value
        old_access = login.data["access"]
        self.request_reset()
        token = self.reset_token_from_email()

        response = self.client.post(
            self.confirm_endpoint,
            {"token": token, "new_password": "A-different-password-87!"},
            format="json",
        )
        reused = self.client.post(
            self.confirm_endpoint,
            {"token": token, "new_password": "Another-password-87!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.content, b"")
        self.assertEqual(response.cookies["basachai_refresh"]["max-age"], "0")
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("A-different-password-87!"))
        self.assertFalse(self.user.check_password("A-strong-random-password-42!"))
        self.assertEqual(reused.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(reused.data["error"]["code"], "invalid_token")

        self.client.cookies["basachai_refresh"] = old_refresh
        revoked_refresh = self.client.post("/api/v1/auth/token/refresh/", {}, format="json")
        self.assertEqual(revoked_refresh.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(revoked_refresh.data["error"]["code"], "invalid_token")

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
        existing_access = self.client.get("/api/v1/me/")
        self.assertEqual(existing_access.status_code, status.HTTP_200_OK)

    def test_invalid_and_expired_tokens_are_rejected(self):
        invalid = self.client.post(
            self.confirm_endpoint,
            {"token": "not-a-valid-token", "new_password": "A-new-password-42!"},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(invalid.data["error"]["code"], "invalid_token")

        with override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"):
            self.request_reset()
        expired_token = self.reset_token_from_email()
        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            expired = self.client.post(
                self.confirm_endpoint,
                {"token": expired_token, "new_password": "A-new-password-42!"},
                format="json",
            )
        self.assertEqual(expired.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(expired.data["error"]["code"], "invalid_token")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_weak_password_returns_field_validation_error_without_consuming_token(self):
        self.request_reset()
        token = self.reset_token_from_email()

        weak = self.client.post(
            self.confirm_endpoint,
            {"token": token, "new_password": "recover@example.com"},
            format="json",
        )
        valid = self.client.post(
            self.confirm_endpoint,
            {"token": token, "new_password": "A-different-password-87!"},
            format="json",
        )

        self.assertEqual(weak.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", weak.data["error"]["fields"])
        self.assertEqual(valid.status_code, status.HTTP_204_NO_CONTENT)

    def test_request_validation_and_email_failure_keep_safe_responses(self):
        invalid = self.client.post(self.request_endpoint, {"email": "not-an-email"}, format="json")
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", invalid.data["error"]["fields"])

        with patch("accounts.services.send_mail", side_effect=OSError("mail unavailable")):
            response = self.request_reset()
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(
            response.data["message"],
            "If an account exists for that email, password recovery instructions will be sent.",
        )


class PublicOwnerProfileTests(APITestCase):
    endpoint = "/api/v1/owners/"

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            email="public-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Public Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        cls.dual_role_owner = User.objects.create_user(
            email="dual-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Dual Role Owner",
            roles=[
                RoleMembership.Role.HOME_SEEKER,
                RoleMembership.Role.PROPERTY_OWNER,
            ],
        )
        cls.seeker = User.objects.create_user(
            email="public-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Home Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        cls.admin = User.objects.create_superuser(
            email="public-admin@example.com",
            password="A-strong-random-password-42!",
            full_name="Admin Moderator",
        )

    def test_owner_profile_is_public_and_contains_only_approved_fields(self):
        response = self.client.get(
            f"{self.endpoint}{self.owner.pk}/",
            HTTP_AUTHORIZATION="Bearer expired-token",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            set(response.data),
            {"id", "full_name", "role_labels", "profile_picture_url", "date_joined"},
        )
        self.assertEqual(response.data["id"], self.owner.pk)
        self.assertEqual(response.data["full_name"], "Public Owner")
        self.assertEqual(response.data["role_labels"], ["Property Owner"])
        self.assertIsNone(response.data["profile_picture_url"])
        self.assertTrue(response.data["date_joined"])
        self.assertNotIn("email", response.data)
        self.assertNotIn("phone", response.data)

    def test_dual_role_owner_profile_includes_both_public_role_labels(self):
        response = self.client.get(f"{self.endpoint}{self.dual_role_owner.pk}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data["role_labels"],
            ["Home Seeker", "Property Owner"],
        )

    def test_non_owner_missing_and_invalid_ids_return_api_not_found(self):
        for owner_id in (self.seeker.pk, self.admin.pk, 99999999, "not-an-id", 0):
            with self.subTest(owner_id=owner_id):
                response = self.client.get(f"{self.endpoint}{owner_id}/")

                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
                self.assertEqual(response.data["error"]["code"], "not_found")


class HomeSeekerProfileTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from listings.models import Listing
        from messaging.models import Conversation
        from viewing_requests.models import ViewingRequest

        cls.seeker = User.objects.create_user(
            email="seeker-profile@example.com",
            password="A-strong-random-password-42!",
            full_name="Seeking Renter",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        cls.owner = User.objects.create_user(
            email="owner-partner@example.com",
            password="A-strong-random-password-42!",
            full_name="Partner Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        cls.other_owner = User.objects.create_user(
            email="other-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Other Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        cls.listing = Listing.objects.create(
            owner=cls.owner,
            title="Dhanmondi Flat",
            property_type="Flat / Apartment",
            bedrooms=2,
            bathrooms=2,
            monthly_rent=25000,
            location="Dhanmondi, Dhaka",
            lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
            availability_status=Listing.AvailabilityStatus.AVAILABLE,
            availability_confirmed_at=timezone.now(),
        )
        cls.conversation = Conversation.objects.create(
            listing=cls.listing,
            seeker=cls.seeker,
        )

    def test_seeker_profile_defaults_to_private_for_phone_and_address(self):
        self.assertFalse(self.seeker.show_seeker_phone_number_publicly)
        self.assertFalse(self.seeker.show_seeker_present_address_publicly)
        self.assertFalse(self.seeker.show_seeker_age_publicly)
        self.assertFalse(self.seeker.show_seeker_about_me_publicly)
        self.assertFalse(self.seeker.show_seeker_profession_publicly)

    def test_seeker_updates_profile_fields_and_visibility(self):
        self.client.force_authenticate(self.seeker)
        response = self.client.patch(
            "/api/v1/me/",
            {
                "seeker_age": 28,
                "seeker_profession": "Software Engineer",
                "seeker_about_me": "Looking for a quiet home close to work.",
                "seeker_phone_number": "+8801700000000",
                "seeker_present_address": "Mirpur 10, Dhaka",
                "show_seeker_age_publicly": True,
                "show_seeker_profession_publicly": True,
                "show_seeker_about_me_publicly": True,
                "show_seeker_phone_number_publicly": False,
                "show_seeker_present_address_publicly": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["seeker_age"], 28)
        self.assertEqual(response.data["seeker_profession"], "Software Engineer")
        self.assertEqual(response.data["seeker_about_me"], "Looking for a quiet home close to work.")
        self.assertEqual(response.data["seeker_phone_number"], "+8801700000000")
        self.assertEqual(response.data["seeker_present_address"], "Mirpur 10, Dhaka")
        self.assertTrue(response.data["show_seeker_age_publicly"])
        self.assertTrue(response.data["show_seeker_profession_publicly"])
        self.assertTrue(response.data["show_seeker_about_me_publicly"])
        self.assertFalse(response.data["show_seeker_phone_number_publicly"])
        self.assertFalse(response.data["show_seeker_present_address_publicly"])

    def test_owner_interacting_with_seeker_sees_only_public_non_empty_fields(self):
        # Configure seeker with some public and some private fields
        self.seeker.seeker_age = 29
        self.seeker.show_seeker_age_publicly = True
        self.seeker.seeker_profession = "Doctor"
        self.seeker.show_seeker_profession_publicly = True
        self.seeker.seeker_about_me = "Friendly tenant looking for 2-year lease."
        self.seeker.show_seeker_about_me_publicly = True
        self.seeker.seeker_phone_number = "+8801711111111"
        self.seeker.show_seeker_phone_number_publicly = False  # Private!
        self.seeker.seeker_present_address = "Gulshan 1"
        self.seeker.show_seeker_present_address_publicly = False  # Private!
        self.seeker.save()

        # Interacting owner can view seeker profile
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/api/v1/seekers/{self.seeker.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["id"], self.seeker.pk)
        self.assertEqual(response.data["full_name"], "Seeking Renter")
        self.assertEqual(response.data["role"], "Home Seeker")
        self.assertEqual(response.data["age"], 29)
        self.assertEqual(response.data["profession"], "Doctor")
        self.assertEqual(response.data["about_me"], "Friendly tenant looking for 2-year lease.")
        # Private fields must NEVER be exposed
        self.assertNotIn("phone_number", response.data)
        self.assertNotIn("present_address", response.data)

        # Now enable public phone number and present address
        self.seeker.show_seeker_phone_number_publicly = True
        self.seeker.show_seeker_present_address_publicly = True
        self.seeker.save()

        response2 = self.client.get(f"/api/v1/seekers/{self.seeker.pk}/")
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        self.assertEqual(response2.data["phone_number"], "+8801711111111")
        self.assertEqual(response2.data["present_address"], "Gulshan 1")

    def test_unrelated_owner_and_unauthenticated_cannot_access_seeker_profile(self):
        # Anonymous request
        self.client.logout()
        anon_response = self.client.get(f"/api/v1/seekers/{self.seeker.pk}/")
        self.assertEqual(anon_response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Non-interacting owner
        self.client.force_authenticate(self.other_owner)
        unrelated_response = self.client.get(f"/api/v1/seekers/{self.seeker.pk}/")
        self.assertEqual(unrelated_response.status_code, status.HTTP_404_NOT_FOUND)

        # Seeker themselves can access their profile
        self.client.force_authenticate(self.seeker)
        self_response = self.client.get(f"/api/v1/seekers/{self.seeker.pk}/")
        self.assertEqual(self_response.status_code, status.HTTP_200_OK)


class ControlledAdminProvisioningTests(APITestCase):
    def test_createsuperuser_adds_the_controlled_admin_membership(self):
        admin = User.objects.create_superuser(
            email="admin@example.com",
            password="A-strong-random-password-42!",
            full_name="Controlled Admin",
        )

        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertEqual(admin.roles, [RoleMembership.Role.ADMIN_MODERATOR])


class FoundationPolicyTests(SimpleTestCase):
    def test_public_creation_requires_valid_public_roles(self):
        self.assertEqual(
            UserManager._normalize_public_roles(
                [RoleMembership.Role.HOME_SEEKER, RoleMembership.Role.PROPERTY_OWNER]
            ),
            [RoleMembership.Role.HOME_SEEKER, RoleMembership.Role.PROPERTY_OWNER],
        )
        with self.assertRaises(ValueError):
            UserManager._normalize_public_roles([])
        with self.assertRaises(ValueError):
            UserManager._normalize_public_roles([RoleMembership.Role.ADMIN_MODERATOR])

    def test_user_hard_deletion_is_blocked_on_instance_and_queryset(self):
        with self.assertRaises(ProtectedError):
            User(email="user@example.com", full_name="User").delete()
        with self.assertRaises(ProtectedError):
            User.objects.all().delete()

    def test_date_joined_uses_a_database_now_default(self):
        from django.db.models.functions import Now

        self.assertIsInstance(User._meta.get_field("date_joined").db_default, Now)

    def test_registration_ignores_only_documented_backend_fields(self):
        serializer = RegistrationSerializer()
        filtered = serializer.filter_ignored_input_fields(
            {
                "email": "user@example.com",
                "id": 7,
                "is_staff": True,
                "date_joined": "2000-01-01T00:00:00Z",
            }
        )
        self.assertEqual(filtered, {"email": "user@example.com"})

    def test_profile_ignores_only_documented_read_only_fields(self):
        serializer = ProfileUpdateSerializer()
        filtered = serializer.filter_ignored_input_fields(
            {"full_name": "User", "is_superuser": True, "email": "x@example.com"}
        )
        self.assertEqual(filtered, {"full_name": "User"})

    def test_profile_request_with_only_ignored_fields_is_a_valid_no_op(self):
        serializer = ProfileUpdateSerializer(
            data={"email": "x@example.com", "is_staff": True},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data, {})

    def test_undocumented_input_fields_remain_invalid(self):
        with self.assertRaises(DRFValidationError):
            LoginSerializer().to_internal_value(
                {"email": "user@example.com", "password": "x", "extra": "value"}
            )

    def test_method_not_allowed_uses_documented_error_envelope(self):
        response = api_exception_handler(MethodNotAllowed("GET"), {})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(
            response.data,
            {
                "error": {
                    "code": "method_not_allowed",
                    "message": "This method is not allowed for the requested resource.",
                }
            },
        )

    def test_unexpected_exception_returns_generic_server_error(self):
        response = api_exception_handler(RuntimeError("private implementation detail"), {})
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data["error"]["code"], "server_error")
        self.assertNotIn("private implementation detail", str(response.data))


class SeekerProfilePolicyTests(SimpleTestCase):
    def test_seeker_field_defaults_are_strictly_private(self):
        self.assertFalse(User._meta.get_field("show_seeker_phone_number_publicly").default)
        self.assertFalse(User._meta.get_field("show_seeker_present_address_publicly").default)
        self.assertFalse(User._meta.get_field("show_seeker_age_publicly").default)
        self.assertFalse(User._meta.get_field("show_seeker_about_me_publicly").default)
        self.assertFalse(User._meta.get_field("show_seeker_profession_publicly").default)

    def test_serializer_empty_seeker_age_becomes_none(self):
        serializer = ProfileUpdateSerializer()
        internal = serializer.to_internal_value({"seeker_age": ""})
        self.assertIsNone(internal["seeker_age"])

    def test_public_seeker_serializer_strictly_enforces_privacy(self):
        from accounts.serializers import PublicHomeSeekerProfileSerializer

        seeker = User(
            id=123,
            full_name="Secret Seeker",
            date_joined=timezone.now(),
            seeker_age=25,
            seeker_profession="Designer",
            seeker_about_me="Quiet tenant",
            seeker_phone_number="+8801700000000",
            seeker_present_address="Dhanmondi, Dhaka",
            show_seeker_age_publicly=False,
            show_seeker_profession_publicly=False,
            show_seeker_about_me_publicly=False,
            show_seeker_phone_number_publicly=False,
            show_seeker_present_address_publicly=False,
        )

        data = PublicHomeSeekerProfileSerializer(seeker).data
        self.assertEqual(data["id"], 123)
        self.assertEqual(data["full_name"], "Secret Seeker")
        self.assertEqual(data["role"], "Home Seeker")
        self.assertNotIn("age", data)
        self.assertNotIn("profession", data)
        self.assertNotIn("about_me", data)
        self.assertNotIn("phone_number", data)
        self.assertNotIn("present_address", data)
        self.assertNotIn("email", data)

        # Enable phone and present address
        seeker.show_seeker_phone_number_publicly = True
        seeker.show_seeker_present_address_publicly = True
        seeker.show_seeker_age_publicly = True

        data2 = PublicHomeSeekerProfileSerializer(seeker).data
        self.assertEqual(data2["phone_number"], "+8801700000000")
        self.assertEqual(data2["present_address"], "Dhanmondi, Dhaka")
        self.assertEqual(data2["age"], 25)

        # If public but empty, it must be hidden
        seeker.seeker_phone_number = ""
        seeker.seeker_present_address = ""
        seeker.seeker_age = None
        data3 = PublicHomeSeekerProfileSerializer(seeker).data
        self.assertNotIn("phone_number", data3)
        self.assertNotIn("present_address", data3)
        self.assertNotIn("age", data3)


class PasswordResetConfigurationTests(SimpleTestCase):
    settings_path = Path(__file__).resolve().parent.parent / "config" / "settings.py"

    def _load_settings(self, extra_env=None):
        env = os.environ.copy()
        env.pop("BASACHAI_ENV", None)
        if extra_env:
            for key, val in extra_env.items():
                if val is None:
                    env.pop(key, None)
                else:
                    env[key] = val
        with patch.dict(os.environ, env, clear=True):
            return runpy.run_path(str(self.settings_path))

    def test_local_dotenv_load_requires_explicit_development_opt_in(self):
        with patch("dotenv.load_dotenv") as load_dotenv:
            self._load_settings(
                {"BASACHAI_ENV": "development", "DJANGO_DEBUG": "true"}
            )

        load_dotenv.assert_called_once_with(
            self.settings_path.parent.parent / ".env", override=False
        )

    def test_dotenv_is_not_loaded_without_development_opt_in(self):
        with patch("dotenv.load_dotenv") as load_dotenv:
            self._load_settings({"DJANGO_DEBUG": "true"})

        load_dotenv.assert_not_called()

    def test_production_still_requires_an_explicit_secret_key(self):
        with patch("dotenv.load_dotenv") as load_dotenv:
            with self.assertRaises(ImproperlyConfigured) as ctx:
                self._load_settings(
                    {"DJANGO_DEBUG": "false", "DJANGO_SECRET_KEY": None}
                )

        self.assertIn(
            "DJANGO_SECRET_KEY must be configured when DEBUG is false.",
            str(ctx.exception),
        )
        load_dotenv.assert_not_called()

    def test_default_url_in_debug_mode(self):
        env = self._load_settings(
            {"DJANGO_DEBUG": "true", "PASSWORD_RESET_FRONTEND_URL": None}
        )
        self.assertEqual(env["PASSWORD_RESET_FRONTEND_URL"], "http://localhost:5173")

    def test_custom_url_in_debug_mode(self):
        env = self._load_settings(
            {
                "DJANGO_DEBUG": "true",
                "PASSWORD_RESET_FRONTEND_URL": "http://localhost:3000",
            }
        )
        self.assertEqual(env["PASSWORD_RESET_FRONTEND_URL"], "http://localhost:3000")

    def test_smtp_settings_can_be_configured_from_environment(self):
        env = self._load_settings(
            {
                "DJANGO_DEBUG": "true",
                "EMAIL_HOST": "smtp.example.invalid",
                "EMAIL_PORT": "587",
                "EMAIL_HOST_USER": "mailer",
                "EMAIL_USE_TLS": "true",
                "EMAIL_USE_SSL": "false",
                "DEFAULT_FROM_EMAIL": "BasaChai <noreply@example.invalid>",
            }
        )

        self.assertEqual(env["EMAIL_HOST"], "smtp.example.invalid")
        self.assertEqual(env["EMAIL_PORT"], 587)
        self.assertEqual(env["EMAIL_HOST_USER"], "mailer")
        self.assertTrue(env["EMAIL_USE_TLS"])
        self.assertFalse(env["EMAIL_USE_SSL"])
        self.assertEqual(env["DEFAULT_FROM_EMAIL"], "BasaChai <noreply@example.invalid>")

    def test_smtp_tls_modes_cannot_be_enabled_together(self):
        with self.assertRaises(ImproperlyConfigured):
            self._load_settings(
                {
                    "DJANGO_DEBUG": "true",
                    "EMAIL_USE_TLS": "true",
                    "EMAIL_USE_SSL": "true",
                }
            )

    def test_production_cookie_and_origin_defaults(self):
        env = self._load_settings(
            {
                "DJANGO_DEBUG": "false",
                "DJANGO_SECRET_KEY": "test-only-not-a-production-secret",
                "SUPABASE_S3_ACCESS_KEY_ID": "test-access-key",
                "SUPABASE_S3_SECRET_ACCESS_KEY": "test-secret-key",
                "SUPABASE_S3_ENDPOINT_URL": "https://storage.example.invalid",
                "PASSWORD_RESET_FRONTEND_URL": "https://frontend.example",
                "CORS_ALLOWED_ORIGINS": "https://frontend.example",
            }
        )

        self.assertTrue(env["CORS_ALLOW_CREDENTIALS"])
        self.assertEqual(env["CSRF_TRUSTED_ORIGINS"], ["https://frontend.example"])
        self.assertTrue(env["JWT_REFRESH_COOKIE_SECURE"])
        self.assertEqual(env["JWT_REFRESH_COOKIE_SAMESITE"], "None")
        self.assertTrue(env["CSRF_COOKIE_SECURE"])
        self.assertTrue(env["CSRF_COOKIE_HTTPONLY"])

    def test_production_mode_requires_password_reset_frontend_url(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            self._load_settings(
                {
                    "DJANGO_DEBUG": "false",
                    "DJANGO_SECRET_KEY": "test-production-secret-key",
                    "SUPABASE_S3_ACCESS_KEY_ID": "test-access-key",
                    "SUPABASE_S3_SECRET_ACCESS_KEY": "test-secret-key",
                    "SUPABASE_S3_ENDPOINT_URL": "https://storage.example.invalid",
                    "PASSWORD_RESET_FRONTEND_URL": None,
                }
            )
        self.assertIn(
            "PASSWORD_RESET_FRONTEND_URL must be configured when DEBUG is false.",
            str(ctx.exception),
        )

    def test_production_mode_rejects_empty_password_reset_frontend_url(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            self._load_settings(
                {
                    "DJANGO_DEBUG": "false",
                    "DJANGO_SECRET_KEY": "test-production-secret-key",
                    "SUPABASE_S3_ACCESS_KEY_ID": "test-access-key",
                    "SUPABASE_S3_SECRET_ACCESS_KEY": "test-secret-key",
                    "SUPABASE_S3_ENDPOINT_URL": "https://storage.example.invalid",
                    "PASSWORD_RESET_FRONTEND_URL": "   ",
                }
            )
        self.assertIn(
            "PASSWORD_RESET_FRONTEND_URL must be configured when DEBUG is false.",
            str(ctx.exception),
        )

    def test_production_mode_accepts_configured_url(self):
        env = self._load_settings(
            {
                "DJANGO_DEBUG": "false",
                "DJANGO_SECRET_KEY": "test-production-secret-key",
                "SUPABASE_S3_ACCESS_KEY_ID": "test-access-key",
                "SUPABASE_S3_SECRET_ACCESS_KEY": "test-secret-key",
                "SUPABASE_S3_ENDPOINT_URL": "https://storage.example.invalid",
                "PASSWORD_RESET_FRONTEND_URL": "https://basachai.com",
            }
        )
        self.assertEqual(env["PASSWORD_RESET_FRONTEND_URL"], "https://basachai.com")
