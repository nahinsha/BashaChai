from datetime import timedelta
from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.deletion import ProtectedError
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from accounts.exceptions import api_exception_handler
from accounts.models import RoleMembership
from accounts.models import User
from .exceptions import InvalidListingPage, ListingConflict
from .image_validation import validate_listing_image
from .models import Listing, ListingImage
from .serializers import ListingInputSerializer, PublicListingSearchParamsSerializer
from .services import availability_reminder, refresh_expired_availability


def make_image(filename="home.jpg", image_format="JPEG", color="red"):
    stream = BytesIO()
    Image.new("RGB", (8, 8), color=color).save(stream, format=image_format)
    return SimpleUploadedFile(
        filename,
        stream.getvalue(),
        content_type=f"image/{'jpeg' if image_format == 'JPEG' else image_format.lower()}",
    )


class ListingAPITests(APITestCase):
    def setUp(self):
        self.media_dir = TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.media_dir.cleanup)

        self.owner = User.objects.create_user(
            email="listing-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Listing Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        self.other_owner = User.objects.create_user(
            email="other-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Other Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        self.seeker = User.objects.create_user(
            email="listing-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Listing Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        self.client.force_authenticate(self.owner)

    def create_listing(self, **overrides):
        body = {
            "monthly_rent": "25000.00",
            "bedrooms": 2,
            "bathrooms": 1,
            "location": "Dhanmondi",
            "property_type": "Flat / Apartment",
            "title": "Sunny apartment",
            "description": "Near the park",
            "amenities": ["Lift", "Generator"],
        }
        body.update(overrides)
        response = self.client.post("/api/v1/owner/listings/", body, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return Listing.objects.get(pk=response.data["id"])

    def publish_listing(self, listing):
        upload = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image()},
            format="multipart",
        )
        self.assertEqual(upload.status_code, status.HTTP_201_CREATED, upload.data)
        confirm = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/availability/",
            {"action": "STILL_AVAILABLE"},
            format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK, confirm.data)
        response = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/publish/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        listing.refresh_from_db()
        return listing

    def create_public_listing(self, **overrides):
        values = {
            "owner": self.owner,
            "title": "Public home",
            "location": "Mirpur 10, Dhaka",
            "property_type": "Flat / Apartment",
            "monthly_rent": "18000.00",
            "bedrooms": 2,
            "bathrooms": 1,
            "lifecycle_status": Listing.LifecycleStatus.PUBLISHED,
            "availability_status": Listing.AvailabilityStatus.AVAILABLE,
            "availability_confirmed_at": timezone.now(),
        }
        values.update(overrides)
        return Listing.objects.create(**values)

    def test_public_search_is_available_without_auth_and_ignores_authorization_header(self):
        listing = self.create_public_listing()
        self.create_listing()
        unpublished = self.create_listing()
        unpublished.lifecycle_status = Listing.LifecycleStatus.UNPUBLISHED
        unpublished.save(update_fields=("lifecycle_status",))
        removed = self.create_listing()
        removed.lifecycle_status = Listing.LifecycleStatus.REMOVED
        removed.save(update_fields=("lifecycle_status",))

        anonymous_client = APIClient()
        response = anonymous_client.get(
            "/api/v1/listings/", HTTP_AUTHORIZATION="Bearer expired-token"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual([item["id"] for item in response.data["results"]], [listing.pk])

        access = str(AccessToken.for_user(self.seeker))
        signed_in = self.client.get(
            "/api/v1/listings/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(signed_in.status_code, status.HTTP_200_OK, signed_in.data)
        self.assertEqual(signed_in.data["count"], 1)

    def test_public_search_can_filter_published_listings_by_owner(self):
        own_listing = self.create_public_listing()
        other_listing = self.create_public_listing(owner=self.other_owner)
        self.create_listing()

        response = self.client.get(
            f"/api/v1/listings/?owner_id={self.owner.pk}",
            HTTP_AUTHORIZATION="Bearer expired-token",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual([item["id"] for item in response.data["results"]], [own_listing.pk])
        self.assertNotIn(other_listing.pk, [item["id"] for item in response.data["results"]])

    def test_public_listing_details_return_api_08_structure_to_visitors(self):
        listing = self.create_public_listing()
        image = ListingImage.objects.create(
            listing=listing,
            slot=1,
            storage_key=f"listing-images/{listing.pk}-detail.jpg",
            image_format=ListingImage.ImageFormat.JPG,
            file_size_bytes=128,
        )

        response = APIClient().get(f"/api/v1/listings/{listing.pk}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(
            set(response.data),
            {
                "id",
                "title",
                "location",
                "property_type",
                "monthly_rent",
                "bedrooms",
                "bathrooms",
                "description",
                "amenities",
                "images",
                "availability",
                "updated_at",
                "owner",
            },
        )
        self.assertEqual(response.data["id"], listing.pk)
        self.assertEqual(response.data["monthly_rent"], 18000.0)
        self.assertEqual(
            response.data["images"],
            [
                {
                    "id": image.pk,
                    "slot": 1,
                    "url": f"/api/v1/listings/images/{image.pk}/",
                }
            ],
        )
        self.assertEqual(
            response.data["availability"]["status"],
            Listing.AvailabilityStatus.AVAILABLE,
        )
        self.assertEqual(
            response.data["availability"]["last_confirmed_at"],
            listing.availability_confirmed_at,
        )
        self.assertEqual(
            response.data["owner"],
            {
                "id": self.owner.pk,
                "full_name": self.owner.full_name,
                "profile_picture_url": None,
            },
        )

    def test_published_listing_exposes_owner_profile_picture_publicly(self):
        listing = self.create_public_listing()
        uploaded = self.client.post(
            "/api/v1/me/profile-picture/",
            {"image": make_image(filename="owner.jpg")},
            format="multipart",
        )
        self.assertEqual(uploaded.status_code, status.HTTP_200_OK, uploaded.data)

        public_details = APIClient().get(f"/api/v1/listings/{listing.pk}/")
        image_url = public_details.data["owner"]["profile_picture_url"]
        self.assertTrue(image_url)

        image_response = APIClient().get(image_url)
        self.assertEqual(image_response.status_code, status.HTTP_200_OK)
        self.assertEqual(image_response["Content-Type"], "image/jpeg")
        self.assertTrue(b"".join(image_response.streaming_content))

    def test_owner_can_view_own_draft_image_but_others_cannot(self):
        listing = self.create_listing()
        uploaded = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image()},
            format="multipart",
        )
        self.assertEqual(uploaded.status_code, status.HTTP_201_CREATED, uploaded.data)
        image_url = uploaded.data["url"]

        owner_response = self.client.get(image_url)
        self.assertEqual(owner_response.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_response["Content-Type"], "image/jpeg")
        self.assertTrue(b"".join(owner_response.streaming_content))

        visitor_response = APIClient().get(image_url)
        self.assertEqual(visitor_response.status_code, status.HTTP_401_UNAUTHORIZED)

        other_owner_client = APIClient()
        other_owner_client.force_authenticate(self.other_owner)
        other_owner_response = other_owner_client.get(image_url)
        self.assertEqual(other_owner_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_published_listing_image_is_public(self):
        listing = self.create_public_listing()
        uploaded = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image()},
            format="multipart",
        )
        self.assertEqual(uploaded.status_code, status.HTTP_201_CREATED, uploaded.data)

        listing_response = APIClient().get(f"/api/v1/listings/{listing.pk}/")
        self.assertEqual(listing_response.status_code, status.HTTP_200_OK)
        image_url = listing_response.data["images"][0]["url"]
        image_response = APIClient().get(image_url)

        self.assertEqual(image_response.status_code, status.HTTP_200_OK)
        self.assertEqual(image_response["Content-Type"], "image/jpeg")
        self.assertTrue(b"".join(image_response.streaming_content))

    def test_public_listing_details_return_json_404_for_missing_listing(self):
        response = APIClient().get("/api/v1/listings/99999999/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.data["error"]["code"], "not_found")

    def test_public_listing_details_hide_non_published_listings_as_json_404(self):
        for lifecycle_status in (
            Listing.LifecycleStatus.DRAFT,
            Listing.LifecycleStatus.UNPUBLISHED,
            Listing.LifecycleStatus.REMOVED,
        ):
            with self.subTest(lifecycle_status=lifecycle_status):
                listing = self.create_public_listing(
                    lifecycle_status=lifecycle_status
                )

                response = APIClient().get(f"/api/v1/listings/{listing.pk}/")

                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
                self.assertEqual(response["Content-Type"], "application/json")
                self.assertEqual(response.data["error"]["code"], "not_found")

    def test_public_search_combines_case_insensitive_and_inclusive_filters(self):
        matching = self.create_public_listing(monthly_rent="10000.00")
        self.create_public_listing(
            location="Mirpur 10",
            monthly_rent="20000.00",
            availability_status=Listing.AvailabilityStatus.UNAVAILABLE,
        )
        self.create_public_listing(
            location="Mirpur 10",
            availability_confirmed_at=timezone.now() - timedelta(days=8),
        )
        self.create_public_listing(location="Dhanmondi")

        response = self.client.get(
            "/api/v1/listings/",
            {
                "location": "MIRPUR",
                "rent_min": "10000",
                "rent_max": "20000",
                "property_type": "fLaT / aPaRtMeNt",
                "bedrooms": "2",
                "availability": "AVAILABLE",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        card = response.data["results"][0]
        self.assertEqual(card["id"], matching.pk)
        self.assertEqual(card["availability"]["status"], "AVAILABLE")
        self.assertIsNone(card["primary_image_url"])

    def test_public_search_shows_effective_availability_and_empty_results(self):
        unavailable = self.create_public_listing(
            availability_status=Listing.AvailabilityStatus.UNAVAILABLE
        )
        needs_reconfirmation = self.create_public_listing(
            availability_confirmed_at=timezone.now() - timedelta(days=8)
        )

        response = self.client.get(
            "/api/v1/listings/", {"availability": "UNAVAILABLE"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data["results"]], [unavailable.pk])
        self.assertEqual(response.data["results"][0]["availability"]["status"], "UNAVAILABLE")

        stale = self.client.get(
            "/api/v1/listings/", {"availability": "NEEDS_RECONFIRMATION"}
        )
        self.assertEqual(
            [row["id"] for row in stale.data["results"]], [needs_reconfirmation.pk]
        )
        self.assertEqual(
            stale.data["results"][0]["availability"]["status"],
            "NEEDS_RECONFIRMATION",
        )

        empty = self.client.get("/api/v1/listings/", {"location": "no-match"})
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        self.assertEqual(empty.data["count"], 0)
        self.assertEqual(empty.data["results"], [])

    def test_public_search_sorting_validation_and_pagination(self):
        low = self.create_public_listing(monthly_rent="10000.00")
        tied = self.create_public_listing(monthly_rent="10000.00")
        high = self.create_public_listing(monthly_rent="20000.00")
        for index in range(8):
            self.create_public_listing(monthly_rent=f"{30000 + index}.00")

        ascending = self.client.get(
            "/api/v1/listings/", {"sort": "rent_asc", "page": 1}
        )
        self.assertEqual(ascending.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row["id"] for row in ascending.data["results"][:3]],
            [low.pk, tied.pk, high.pk],
        )
        self.assertEqual(len(ascending.data["results"]), 10)
        self.assertIsNotNone(ascending.data["next"])
        second_page = self.client.get("/api/v1/listings/", {"page": 2})
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNotNone(second_page.data["previous"])

        for query in (
            {"rent_min": "30000", "rent_max": "10000"},
            {"sort": "oldest"},
            {"bedrooms": "-1"},
        ):
            invalid = self.client.get("/api/v1/listings/", query)
            self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(invalid.data["error"]["code"], "validation_error")

        for page in ("0", "bad", "3"):
            invalid_page = self.client.get(
                "/api/v1/listings/", {"page": page}
            )
            self.assertEqual(invalid_page.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(invalid_page.data["error"]["code"], "invalid_page")
            self.assertEqual(invalid_page.data["error"]["details"]["last_page"], 2)

    def test_owner_can_create_draft_with_backend_controlled_fields_ignored(self):
        response = self.client.post(
            "/api/v1/owner/listings/",
            {
                "monthly_rent": "18000.00",
                "bedrooms": 1,
                "bathrooms": 1,
                "owner": self.other_owner.pk,
                "lifecycle_status": "PUBLISHED",
                "availability_status": "UNAVAILABLE",
                "availability_confirmed_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        listing = Listing.objects.get(pk=response.data["id"])
        self.assertEqual(listing.owner, self.owner)
        self.assertEqual(listing.lifecycle_status, Listing.LifecycleStatus.DRAFT)
        self.assertEqual(listing.availability_status, Listing.AvailabilityStatus.AVAILABLE)
        self.assertIsNone(listing.availability_confirmed_at)
        self.assertEqual(listing.amenities, [])

    def test_registration_fields_rent_and_rooms_are_validated(self):
        for payload, invalid_field in (
            ({"monthly_rent": "0", "bedrooms": 1, "bathrooms": 1}, "monthly_rent"),
            ({"monthly_rent": "1", "bedrooms": -1, "bathrooms": 1}, "bedrooms"),
            ({"monthly_rent": "1", "bedrooms": 1, "bathrooms": -1}, "bathrooms"),
        ):
            response = self.client.post("/api/v1/owner/listings/", payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn(invalid_field, response.data["error"]["fields"])

    def test_property_type_is_free_text_with_existing_length_and_blank_rules(self):
        property_type = "Victorian mansion with a garden flat"
        created = self.client.post(
            "/api/v1/owner/listings/",
            {
                "monthly_rent": "18000.00",
                "bedrooms": 1,
                "bathrooms": 1,
                "property_type": property_type,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["property_type"], property_type)

        listing = self.create_listing()
        updated = self.client.patch(
            f"/api/v1/owner/listings/{listing.pk}/",
            {"property_type": "Converted warehouse loft"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertEqual(updated.data["property_type"], "Converted warehouse loft")

        blank_update = self.client.patch(
            f"/api/v1/owner/listings/{listing.pk}/",
            {"property_type": "   "},
            format="json",
        )
        self.assertEqual(blank_update.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("property_type", blank_update.data["error"]["fields"])

        overlong_update = self.client.patch(
            f"/api/v1/owner/listings/{listing.pk}/",
            {"property_type": "x" * 51},
            format="json",
        )
        self.assertEqual(overlong_update.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("property_type", overlong_update.data["error"]["fields"])

        null_update = self.client.patch(
            f"/api/v1/owner/listings/{listing.pk}/",
            {"property_type": None},
            format="json",
        )
        self.assertEqual(null_update.status_code, status.HTTP_200_OK, null_update.data)
        self.assertIsNone(null_update.data["property_type"])

    def test_public_property_type_filter_is_case_insensitive_exact_and_unknown_is_empty(self):
        listings = {
            property_type: self.create_public_listing(property_type=property_type)
            for property_type in (
                "Victorian mansion",
                "Converted warehouse loft",
                "Mess accommodation",
            )
        }
        for property_type, listing in listings.items():
            response = APIClient().get(
                "/api/v1/listings/", {"property_type": property_type.swapcase()}
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            self.assertEqual(response.data["count"], 1)
            self.assertEqual(response.data["results"][0]["id"], listing.pk)

        partial_match = APIClient().get(
            "/api/v1/listings/", {"property_type": "Victorian"}
        )
        self.assertEqual(partial_match.status_code, status.HTTP_200_OK, partial_match.data)
        self.assertEqual(partial_match.data["count"], 0)

        unknown = APIClient().get(
            "/api/v1/listings/", {"property_type": "Unsupported type"}
        )
        self.assertEqual(unknown.status_code, status.HTTP_200_OK, unknown.data)
        self.assertEqual(unknown.data["count"], 0)

    def test_owner_role_and_listing_ownership_are_enforced(self):
        listing = self.create_listing()
        self.client.force_authenticate(self.seeker)
        denied = self.client.get(f"/api/v1/owner/listings/{listing.pk}/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.other_owner)
        hidden = self.client.get(f"/api/v1/owner/listings/{listing.pk}/")
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_dashboard_is_owner_scoped_and_can_filter_lifecycle(self):
        draft = self.create_listing()
        self.create_listing(title="Second draft")
        response = self.client.get(
            "/api/v1/owner/listings/", {"lifecycle_status": "DRAFT", "page": 1}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertTrue(all(item["owner"] == self.owner.pk for item in response.data["results"]))
        self.assertEqual(Listing.objects.get(pk=draft.pk).owner_id, self.owner.pk)

    def test_create_requires_three_numeric_fields_and_patch_only_updates_details(self):
        missing = self.client.post(
            "/api/v1/owner/listings/", {"monthly_rent": "100"}, format="json"
        )
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("bedrooms", missing.data["error"]["fields"])

        listing = self.create_listing()
        response = self.client.patch(
            f"/api/v1/owner/listings/{listing.pk}/",
            {"title": "Updated title", "lifecycle_status": "PUBLISHED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        listing.refresh_from_db()
        self.assertEqual(listing.title, "Updated title")
        self.assertEqual(listing.lifecycle_status, Listing.LifecycleStatus.DRAFT)

    def test_publish_requires_fields_image_and_fresh_confirmation(self):
        listing = self.create_listing(location=None, property_type=None)
        publish_url = f"/api/v1/owner/listings/{listing.pk}/publish/"
        response = self.client.post(publish_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "validation_error")
        self.assertIn("location", response.data["error"]["fields"])
        self.assertIn("images", response.data["error"]["fields"])

        self.client.patch(
            f"/api/v1/owner/listings/{listing.pk}/",
            {"location": "Dhanmondi", "property_type": "Flat / Apartment"},
            format="json",
        )
        upload = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image()},
            format="multipart",
        )
        self.assertEqual(upload.status_code, status.HTTP_201_CREATED, upload.data)
        stale = Listing.objects.get(pk=listing.pk)
        stale.availability_confirmed_at = timezone.now() - timedelta(days=8)
        stale.save(update_fields=("availability_confirmed_at",))
        required = self.client.post(publish_url, {}, format="json")
        self.assertEqual(required.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            required.data["error"]["code"], "availability_confirmation_required"
        )

        self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/availability/",
            {"action": "STILL_AVAILABLE"},
            format="json",
        )
        published = self.client.post(publish_url, {}, format="json")
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)

    def test_lifecycle_transitions_keep_availability_separate_and_removed_is_read_only(self):
        listing = self.publish_listing(self.create_listing())
        confirmation_time = listing.availability_confirmed_at
        unpublish = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/unpublish/", {}, format="json"
        )
        self.assertEqual(unpublish.status_code, status.HTTP_200_OK)
        listing.refresh_from_db()
        self.assertEqual(listing.lifecycle_status, Listing.LifecycleStatus.UNPUBLISHED)
        self.assertEqual(listing.availability_status, Listing.AvailabilityStatus.AVAILABLE)
        self.assertEqual(listing.availability_confirmed_at, confirmation_time)

        republish = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/publish/", {}, format="json"
        )
        self.assertEqual(republish.status_code, status.HTTP_200_OK)
        removed = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/remove/", {}, format="json"
        )
        self.assertEqual(removed.status_code, status.HTTP_200_OK)
        listing.refresh_from_db()
        self.assertEqual(listing.lifecycle_status, Listing.LifecycleStatus.REMOVED)
        self.assertEqual(listing.availability_status, Listing.AvailabilityStatus.AVAILABLE)

        edit = self.client.patch(
            f"/api/v1/owner/listings/{listing.pk}/", {"title": "No longer editable"}, format="json"
        )
        self.assertEqual(edit.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(edit.data["error"]["code"], "listing_removed")

    def test_availability_confirmation_does_not_change_lifecycle_or_updated_at(self):
        listing = self.create_listing()
        original_updated = listing.updated_at
        response = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/availability/",
            {"action": "NOT_AVAILABLE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        listing.refresh_from_db()
        self.assertEqual(listing.lifecycle_status, Listing.LifecycleStatus.DRAFT)
        self.assertEqual(listing.availability_status, Listing.AvailabilityStatus.UNAVAILABLE)
        self.assertGreaterEqual(listing.availability_confirmed_at, original_updated)
        self.assertEqual(listing.updated_at, original_updated)

    def test_image_format_size_slots_replacement_and_published_last_image_rule(self):
        listing = self.create_listing()
        bad_format = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": SimpleUploadedFile("home.gif", b"not-an-image")},
            format="multipart",
        )
        self.assertEqual(bad_format.status_code, status.HTTP_400_BAD_REQUEST)

        mismatched = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image("renamed.png", "JPEG")},
            format="multipart",
        )
        self.assertEqual(mismatched.status_code, status.HTTP_400_BAD_REQUEST)

        too_large = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": SimpleUploadedFile("large.jpg", b"x" * (5 * 1024 * 1024 + 1))},
            format="multipart",
        )
        self.assertEqual(too_large.status_code, status.HTTP_400_BAD_REQUEST)

        first = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image()},
            format="multipart",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        image_id = first.data["id"]
        self.assertEqual(first.data["slot"], 1)
        replacement = self.client.put(
            f"/api/v1/owner/listings/{listing.pk}/images/{image_id}/",
            {"image": make_image("home.webp", "WEBP")},
            format="multipart",
        )
        self.assertEqual(replacement.status_code, status.HTTP_200_OK, replacement.data)
        self.assertEqual(replacement.data["slot"], 1)
        self.assertEqual(replacement.data["image_format"], "WEBP")

        for _ in range(4):
            response = self.client.post(
                f"/api/v1/owner/listings/{listing.pk}/images/",
                {"image": make_image()},
                format="multipart",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        over_limit = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image()},
            format="multipart",
        )
        self.assertEqual(over_limit.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(listing.images.count(), 5)

        for image in listing.images.order_by("slot")[1:]:
            response = self.client.delete(
                f"/api/v1/owner/listings/{listing.pk}/images/{image.pk}/"
            )
            self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/availability/",
            {"action": "STILL_AVAILABLE"},
            format="json",
        )
        published = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/publish/", {}, format="json"
        )
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)
        last_image_id = listing.images.first().pk
        delete_last = self.client.delete(
            f"/api/v1/owner/listings/{listing.pk}/images/{last_image_id}/"
        )
        self.assertEqual(delete_last.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(delete_last.data["error"]["code"], "last_image_required")

    def test_image_add_remove_refreshes_listing_updated_at_and_removed_blocks_images(self):
        listing = self.create_listing()
        original_updated = listing.updated_at
        added = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image()},
            format="multipart",
        )
        self.assertEqual(added.status_code, status.HTTP_201_CREATED, added.data)
        listing.refresh_from_db()
        self.assertGreater(listing.updated_at, original_updated)

        deleted = self.client.delete(
            f"/api/v1/owner/listings/{listing.pk}/images/{added.data['id']}/"
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(ListingImage.objects.filter(listing=listing).count(), 0)

        self.client.post(f"/api/v1/owner/listings/{listing.pk}/remove/", {}, format="json")
        blocked = self.client.post(
            f"/api/v1/owner/listings/{listing.pk}/images/",
            {"image": make_image()},
            format="multipart",
        )
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(blocked.data["error"]["code"], "listing_removed")


class ListingPolicyUnitTests(SimpleTestCase):
    def test_listing_hard_deletion_is_blocked(self):
        with self.assertRaises(ProtectedError):
            Listing(monthly_rent="100.00", bedrooms=1, bathrooms=1).delete()
        with self.assertRaises(ProtectedError):
            Listing.objects.all().delete()

    def test_publish_and_image_conflicts_keep_documented_codes(self):
        for code in ("listing_removed", "last_image_required", "invalid_status_transition"):
            response = api_exception_handler(
                ListingConflict("Listing state conflict.", code=code), {}
            )
            self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
            self.assertEqual(response.data["error"]["code"], code)

    def test_public_search_parameters_enforce_range_sort_and_availability_rules(self):
        valid = PublicListingSearchParamsSerializer(
            data={
                "location": "Mirpur",
                "rent_min": "10000",
                "rent_max": "25000",
                "property_type": "Flat / Apartment",
                "bedrooms": "2",
                "availability": "AVAILABLE",
                "sort": "rent_asc",
                "page": "1",
                "owner_id": "12",
            }
        )
        self.assertTrue(valid.is_valid(), valid.errors)

        invalid = PublicListingSearchParamsSerializer(
            data={"rent_min": "25000", "rent_max": "10000"}
        )
        self.assertFalse(invalid.is_valid())
        self.assertIn("rent_min", invalid.errors)

        unsupported = PublicListingSearchParamsSerializer(
            data={"availability": "MAYBE", "sort": "oldest"}
        )
        self.assertFalse(unsupported.is_valid())
        self.assertIn("availability", unsupported.errors)
        self.assertIn("sort", unsupported.errors)

        invalid_owner = PublicListingSearchParamsSerializer(data={"owner_id": "0"})
        self.assertFalse(invalid_owner.is_valid())
        self.assertIn("owner_id", invalid_owner.errors)

    def test_invalid_public_page_error_includes_last_valid_page(self):
        response = api_exception_handler(InvalidListingPage(last_page=4), {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "invalid_page")
        self.assertEqual(response.data["error"]["details"]["last_page"], 4)

    def test_listing_input_serializer_enforces_create_fields_and_rejects_unknown_fields(self):
        valid = ListingInputSerializer(
            data={"monthly_rent": "1000.00", "bedrooms": 1, "bathrooms": 1}
        )
        self.assertTrue(valid.is_valid(), valid.errors)

        incomplete = ListingInputSerializer(
            data={"monthly_rent": "1000.00", "bedrooms": 1}
        )
        self.assertFalse(incomplete.is_valid())
        self.assertIn("bathrooms", incomplete.errors)

        unexpected = ListingInputSerializer(
            data={
                "monthly_rent": "1000.00",
                "bedrooms": 1,
                "bathrooms": 1,
                "unapproved_field": True,
            }
        )
        self.assertFalse(unexpected.is_valid())
        self.assertIn("unapproved_field", unexpected.errors)

    def test_image_validation_checks_detected_format_size_and_extension(self):
        image = make_image("valid.jpg", "JPEG")
        self.assertEqual(validate_listing_image(image)[0], "JPG")

        renamed = make_image("renamed.png", "JPEG")
        with self.assertRaises(DRFValidationError):
            validate_listing_image(renamed)

        too_large = SimpleUploadedFile(
            "large.jpg", b"x" * (5 * 1024 * 1024 + 1)
        )
        with self.assertRaises(DRFValidationError):
            validate_listing_image(too_large)

    def test_availability_reminder_boundaries(self):
        now = timezone.now()
        listing = Listing(
            lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
            availability_status=Listing.AvailabilityStatus.AVAILABLE,
            availability_confirmed_at=now - timedelta(days=4, hours=23),
        )
        self.assertEqual(
            availability_reminder(listing, now),
            (False, None, Listing.AvailabilityStatus.AVAILABLE),
        )
        listing.availability_confirmed_at = now - timedelta(days=5)
        self.assertEqual(availability_reminder(listing, now)[0:2], (True, 5))
        listing.availability_confirmed_at = now - timedelta(days=7)
        self.assertEqual(
            availability_reminder(listing, now),
            (True, 7, Listing.AvailabilityStatus.NEEDS_RECONFIRMATION),
        )


class ListingAvailabilityServiceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="availability-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Availability Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )

    def test_daily_refresh_marks_only_expired_published_listings(self):
        now = timezone.now()
        stale = Listing.objects.create(
            owner=self.owner,
            monthly_rent="100.00",
            bedrooms=1,
            bathrooms=1,
            location="Dhaka",
            property_type="Flat / Apartment",
            lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
            availability_confirmed_at=now - timedelta(days=7),
        )
        recent = Listing.objects.create(
            owner=self.owner,
            monthly_rent="200.00",
            bedrooms=2,
            bathrooms=1,
            location="Dhaka",
            property_type="Flat / Apartment",
            lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
            availability_confirmed_at=now - timedelta(days=4),
        )
        self.assertEqual(refresh_expired_availability(now), 1)
        self.assertEqual(refresh_expired_availability(now), 0)
        stale.refresh_from_db()
        recent.refresh_from_db()
        self.assertEqual(
            stale.availability_status,
            Listing.AvailabilityStatus.NEEDS_RECONFIRMATION,
        )
        self.assertEqual(recent.availability_status, Listing.AvailabilityStatus.AVAILABLE)
