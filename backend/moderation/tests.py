from io import BytesIO
from unittest.mock import MagicMock, patch

from django.core import mail
from django.core.files.storage import default_storage
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory, APITestCase, force_authenticate

from accounts.models import RoleMembership, User
from listings.models import Listing, ListingImage
from moderation.models import ListingReport, ModerationFeedback, ModerationHold
from moderation.permissions import IsAdminModerator
from moderation.serializers import (
    ModerationFeedbackInputSerializer,
    ModerationListingImageSerializer,
)
from moderation.views import AdminModerationListingImageView


class ModerationInputTests(SimpleTestCase):
    def test_feedback_reason_must_not_be_blank(self):
        for value in ("", " \t\n"):
            serializer = ModerationFeedbackInputSerializer(data={"reason": value})
            self.assertFalse(serializer.is_valid())
            self.assertIn("reason", serializer.errors)

        serializer = ModerationFeedbackInputSerializer(data={"reason": "Correct the photos"})
        self.assertTrue(serializer.is_valid(), serializer.errors)


class ModerationListingImageAccessUnitTests(SimpleTestCase):
    def test_moderation_listing_image_url_and_serialization(self):
        url = reverse("moderation-listing-image-content", kwargs={"image_id": 99})
        self.assertEqual(url, "/api/v1/moderation/listing-images/99/content/")

        image = ListingImage(
            pk=99,
            slot=1,
            storage_key="listing-images/test-99.jpg",
            image_format=ListingImage.ImageFormat.JPG,
            file_size_bytes=1024,
            created_at=timezone.now(),
        )
        data = ModerationListingImageSerializer(image).data
        self.assertEqual(data["id"], 99)
        self.assertEqual(data["slot"], 1)
        self.assertEqual(data["url"], "/api/v1/moderation/listing-images/99/content/")

    def test_unauthenticated_request_rejected(self):
        factory = APIRequestFactory()
        request = factory.get("/api/v1/moderation/listing-images/99/content/")
        response = AdminModerationListingImageView.as_view()(request, image_id=99)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_user_forbidden(self):
        factory = APIRequestFactory()
        user = User(pk=10, email="seeker@example.com")
        request = factory.get("/api/v1/moderation/listing-images/99/content/")
        force_authenticate(request, user=user)
        with patch.object(IsAdminModerator, "has_permission", return_value=False):
            response = AdminModerationListingImageView.as_view()(request, image_id=99)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_nonexistent_image_returns_404(self):
        factory = APIRequestFactory()
        admin = User(pk=1, email="admin@example.com", is_staff=True, is_superuser=True)
        request = factory.get("/api/v1/moderation/listing-images/99/content/")
        force_authenticate(request, user=admin)
        with patch.object(IsAdminModerator, "has_permission", return_value=True):
            with patch.object(ListingImage.objects, "get", side_effect=ListingImage.DoesNotExist):
                response = AdminModerationListingImageView.as_view()(request, image_id=99)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_successful_image_content_response(self):
        factory = APIRequestFactory()
        admin = User(pk=1, email="admin@example.com", is_staff=True, is_superuser=True)
        request = factory.get("/api/v1/moderation/listing-images/99/content/")
        force_authenticate(request, user=admin)
        mock_image = ListingImage(
            pk=99,
            slot=1,
            storage_key="listing-images/test-99.jpg",
            image_format=ListingImage.ImageFormat.JPG,
            file_size_bytes=4,
            created_at=timezone.now(),
        )
        fake_file = BytesIO(b"JPEG")
        with patch.object(IsAdminModerator, "has_permission", return_value=True):
            with patch.object(ListingImage.objects, "get", return_value=mock_image):
                with patch.object(default_storage, "open", return_value=fake_file):
                    response = AdminModerationListingImageView.as_view()(request, image_id=99)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "image/jpeg")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")


class ModerationAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            email="moderation-admin@example.com",
            password="A-strong-random-password-42!",
            full_name="Platform Moderator",
        )
        cls.owner = User.objects.create_user(
            email="moderation-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Property Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        cls.other_owner = User.objects.create_user(
            email="moderation-other-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Another Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        cls.seeker = User.objects.create_user(
            email="moderation-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Home Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )

    def setUp(self):
        if hasattr(mail, "outbox"):
            mail.outbox.clear()
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)
        self.owner_client = APIClient()
        self.owner_client.force_authenticate(self.owner)
        self.seeker_client = APIClient()
        self.seeker_client.force_authenticate(self.seeker)

    def create_listing(self, owner=None, **overrides):
        values = {
            "owner": owner or self.owner,
            "title": "Dhaka apartment",
            "location": "Dhanmondi",
            "property_type": "Flat / Apartment",
            "monthly_rent": "25000.00",
            "bedrooms": 2,
            "bathrooms": 1,
            "lifecycle_status": Listing.LifecycleStatus.PUBLISHED,
            "availability_status": Listing.AvailabilityStatus.AVAILABLE,
            "availability_confirmed_at": timezone.now(),
        }
        values.update(overrides)
        return Listing.objects.create(**values)

    def create_report(self, listing=None, status_value=None):
        reviewed_fields = {}
        if status_value in (
            ListingReport.Status.UNDER_REVIEW,
            ListingReport.Status.RESOLVED,
            ListingReport.Status.REJECTED,
        ):
            reviewed_fields = {
                "reviewed_by": self.admin,
                "reviewed_at": timezone.now(),
            }
        return ListingReport.objects.create(
            listing=listing or self.create_listing(),
            reporter=self.seeker,
            reason="The listing information appears inaccurate.",
            **reviewed_fields,
            **({"status": status_value} if status_value else {}),
        )

    def test_admin_only_queue_and_report_submission_rules(self):
        listing = self.create_listing()
        report_response = self.seeker_client.post(
            "/api/v1/reports/",
            {"listing_id": listing.pk, "reason": "The listing is misleading."},
            format="json",
        )
        self.assertEqual(report_response.status_code, status.HTTP_201_CREATED, report_response.data)
        self.assertEqual(report_response.data["status"], ListingReport.Status.SUBMITTED)

        queue = self.admin_client.get("/api/v1/moderation/reports/")
        self.assertEqual(queue.status_code, status.HTTP_200_OK, queue.data)
        self.assertEqual([item["id"] for item in queue.data["results"]], [report_response.data["id"]])

        denied = self.owner_client.get("/api/v1/moderation/reports/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        own_listing = self.create_listing(owner=self.seeker)
        self_report = self.seeker_client.post(
            "/api/v1/reports/",
            {"listing_id": own_listing.pk, "reason": "My own listing."},
            format="json",
        )
        self.assertEqual(self_report.status_code, status.HTTP_403_FORBIDDEN)

        hidden_listing = self.create_listing(lifecycle_status=Listing.LifecycleStatus.UNPUBLISHED)
        hidden_report = self.seeker_client.post(
            "/api/v1/reports/",
            {"listing_id": hidden_listing.pk, "reason": "Not visible."},
            format="json",
        )
        self.assertEqual(hidden_report.status_code, status.HTTP_404_NOT_FOUND)

    def test_report_status_transitions_and_final_status_are_enforced(self):
        report = self.create_report()
        owner_denied = self.owner_client.post(
            f"/api/v1/moderation/reports/{report.pk}/mark-reviewed/", {}, format="json"
        )
        self.assertEqual(owner_denied.status_code, status.HTTP_403_FORBIDDEN)

        premature = self.admin_client.post(
            f"/api/v1/moderation/reports/{report.pk}/outcome/",
            {"status": ListingReport.Status.RESOLVED},
            format="json",
        )
        self.assertEqual(premature.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(premature.data["error"]["code"], "invalid_status_transition")

        reviewed = self.admin_client.post(
            f"/api/v1/moderation/reports/{report.pk}/mark-reviewed/", {}, format="json"
        )
        self.assertEqual(reviewed.status_code, status.HTTP_200_OK, reviewed.data)
        self.assertEqual(reviewed.data["status"], ListingReport.Status.UNDER_REVIEW)
        self.assertEqual(reviewed.data["reviewed_by"]["id"], self.admin.pk)
        self.assertIsNotNone(reviewed.data["reviewed_at"])

        rejected = self.admin_client.post(
            f"/api/v1/moderation/reports/{report.pk}/outcome/",
            {"status": ListingReport.Status.REJECTED},
            format="json",
        )
        self.assertEqual(rejected.status_code, status.HTTP_200_OK, rejected.data)
        self.assertEqual(rejected.data["status"], ListingReport.Status.REJECTED)

        final_attempt = self.admin_client.post(
            f"/api/v1/moderation/reports/{report.pk}/mark-reviewed/", {}, format="json"
        )
        self.assertEqual(final_attempt.status_code, status.HTTP_409_CONFLICT)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_feedback_resolves_report_emails_owner_and_is_owner_scoped(self):
        report = self.create_report(status_value=ListingReport.Status.UNDER_REVIEW)
        listing = report.listing

        with self.captureOnCommitCallbacks(execute=True):
            response = self.admin_client.post(
                f"/api/v1/moderation/reports/{report.pk}/feedback/",
                {"reason": "Please upload current photos."},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(mail.outbox), 1)
        report.refresh_from_db()
        listing.refresh_from_db()
        self.assertEqual(report.status, ListingReport.Status.RESOLVED)
        self.assertEqual(listing.lifecycle_status, Listing.LifecycleStatus.PUBLISHED)
        self.assertEqual(ModerationFeedback.objects.filter(report=report).count(), 1)

        own_feedback = self.owner_client.get("/api/v1/owner/moderation-feedback/")
        self.assertEqual(own_feedback.status_code, status.HTTP_200_OK, own_feedback.data)
        self.assertEqual(own_feedback.data["results"][0]["listing"]["id"], listing.pk)

        other_client = APIClient()
        other_client.force_authenticate(self.other_owner)
        hidden = other_client.get("/api/v1/owner/moderation-feedback/")
        self.assertEqual(hidden.status_code, status.HTTP_200_OK)
        self.assertEqual(hidden.data["count"], 0)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_email_failure_does_not_rollback_feedback_or_dashboard_visibility(self):
        report = self.create_report(status_value=ListingReport.Status.UNDER_REVIEW)
        with patch("moderation.services.send_mail", side_effect=OSError("mail unavailable")):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.admin_client.post(
                    f"/api/v1/moderation/reports/{report.pk}/feedback/",
                    {"reason": "Correct the listing details."},
                    format="json",
                )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        report.refresh_from_db()
        self.assertEqual(report.status, ListingReport.Status.RESOLVED)
        self.assertTrue(ModerationFeedback.objects.filter(report=report).exists())
        dashboard = self.owner_client.get("/api/v1/owner/moderation-feedback/")
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data["count"], 1)

    def test_explicit_unpublish_preserves_report_status_and_active_hold_blocks_publish(self):
        listing = self.create_listing()
        report = self.create_report(listing=listing, status_value=ListingReport.Status.UNDER_REVIEW)

        response = self.admin_client.post(
            f"/api/v1/moderation/reports/{report.pk}/unpublish/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        listing.refresh_from_db()
        report.refresh_from_db()
        self.assertEqual(listing.lifecycle_status, Listing.LifecycleStatus.UNPUBLISHED)
        self.assertEqual(report.status, ListingReport.Status.UNDER_REVIEW)
        self.assertEqual(ModerationHold.objects.filter(listing=listing, released_at__isnull=True).count(), 1)
        self.assertTrue(response.data["listing"]["has_active_moderation_hold"])

        publish = self.owner_client.post(
            f"/api/v1/owner/listings/{listing.pk}/publish/", {}, format="json"
        )
        self.assertEqual(publish.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(publish.data["error"]["code"], "moderation_hold_active")

        repeated = self.admin_client.post(
            f"/api/v1/moderation/reports/{report.pk}/unpublish/", {}, format="json"
        )
        self.assertEqual(repeated.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(repeated.data["error"]["code"], "hold_already_active")

    def test_feedback_and_unpublish_are_independent_and_hold_release_does_not_publish(self):
        listing = self.create_listing()
        report = self.create_report(listing=listing, status_value=ListingReport.Status.UNDER_REVIEW)

        with self.captureOnCommitCallbacks(execute=True):
            feedback = self.admin_client.post(
                f"/api/v1/moderation/reports/{report.pk}/feedback/",
                {"reason": "Please correct the information."},
                format="json",
            )
        self.assertEqual(feedback.status_code, status.HTTP_201_CREATED, feedback.data)
        report.refresh_from_db()
        self.assertEqual(report.status, ListingReport.Status.RESOLVED)

        unpublished = self.admin_client.post(
            f"/api/v1/moderation/reports/{report.pk}/unpublish/", {}, format="json"
        )
        self.assertEqual(unpublished.status_code, status.HTTP_200_OK, unpublished.data)
        report.refresh_from_db()
        listing.refresh_from_db()
        self.assertEqual(report.status, ListingReport.Status.RESOLVED)
        self.assertEqual(listing.lifecycle_status, Listing.LifecycleStatus.UNPUBLISHED)

        released = self.admin_client.post(
            f"/api/v1/moderation/listings/{listing.pk}/release-hold/", {}, format="json"
        )
        self.assertEqual(released.status_code, status.HTTP_200_OK, released.data)
        self.assertEqual(released.data["lifecycle_status"], Listing.LifecycleStatus.UNPUBLISHED)
        self.assertFalse(released.data["has_active_moderation_hold"])
        self.assertIsNotNone(
            ModerationHold.objects.get(listing=listing).released_at
        )

    def test_release_without_active_hold_returns_documented_conflict(self):
        listing = self.create_listing(lifecycle_status=Listing.LifecycleStatus.UNPUBLISHED)
        response = self.admin_client.post(
            f"/api/v1/moderation/listings/{listing.pk}/release-hold/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["error"]["code"], "no_active_hold")

    def test_report_detail_shows_listing_current_state_hold_and_feedback(self):
        listing = self.create_listing(lifecycle_status=Listing.LifecycleStatus.UNPUBLISHED)
        report = self.create_report(listing=listing, status_value=ListingReport.Status.UNDER_REVIEW)
        response = self.admin_client.get(f"/api/v1/moderation/reports/{report.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["listing"]["lifecycle_status"], Listing.LifecycleStatus.UNPUBLISHED)
        self.assertFalse(response.data["listing"]["has_active_moderation_hold"])
        self.assertIsNone(response.data["active_hold"])
        self.assertEqual(response.data["feedback"], [])

    def test_admin_moderation_listing_image_access_and_permissions(self):
        listing = self.create_listing(lifecycle_status=Listing.LifecycleStatus.UNPUBLISHED)
        image = ListingImage.objects.create(
            listing=listing,
            slot=1,
            storage_key=f"listing-images/{listing.pk}-test.jpg",
            image_format=ListingImage.ImageFormat.JPG,
            file_size_bytes=4,
        )
        default_storage.save(image.storage_key, BytesIO(b"fake-image-bytes"))
        try:
            image_url = f"/api/v1/moderation/listing-images/{image.pk}/content/"

            # Unauthenticated access rejected
            anon_resp = APIClient().get(image_url)
            self.assertEqual(anon_resp.status_code, status.HTTP_401_UNAUTHORIZED)

            # Home seeker rejected
            seeker_client = APIClient()
            seeker_client.force_authenticate(self.seeker)
            seeker_resp = seeker_client.get(image_url)
            self.assertEqual(seeker_resp.status_code, status.HTTP_403_FORBIDDEN)

            # Owner rejected
            owner_client = APIClient()
            owner_client.force_authenticate(self.owner)
            owner_resp = owner_client.get(image_url)
            self.assertEqual(owner_resp.status_code, status.HTTP_403_FORBIDDEN)

            # Admin allowed
            admin_resp = self.admin_client.get(image_url)
            self.assertEqual(admin_resp.status_code, status.HTTP_200_OK)
            self.assertEqual(admin_resp["Content-Type"], "image/jpeg")
            self.assertEqual(admin_resp["X-Content-Type-Options"], "nosniff")
            self.assertEqual(b"".join(admin_resp.streaming_content), b"fake-image-bytes")

            # Nonexistent image returns 404
            not_found = self.admin_client.get("/api/v1/moderation/listing-images/999999/content/")
            self.assertEqual(not_found.status_code, status.HTTP_404_NOT_FOUND)

            # Moderation report detail returns the moderation image URL
            report = self.create_report(listing=listing, status_value=ListingReport.Status.UNDER_REVIEW)
            detail_resp = self.admin_client.get(f"/api/v1/moderation/reports/{report.pk}/")
            self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
            images = detail_resp.data["listing"]["images"]
            self.assertEqual(len(images), 1)
            self.assertEqual(images[0]["url"], image_url)
        finally:
            if default_storage.exists(image.storage_key):
                default_storage.delete(image.storage_key)
