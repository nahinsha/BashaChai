from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.exceptions import api_exception_handler
from accounts.models import RoleMembership, User
from listings.models import Listing

from .exceptions import AlreadyInShortlist
from .models import ShortlistItem
from .serializers import AddShortlistItemSerializer


class ShortlistUnitTests(SimpleTestCase):
    def test_add_request_requires_a_positive_listing_id(self):
        valid = AddShortlistItemSerializer(data={"listing_id": 12})
        self.assertTrue(valid.is_valid(), valid.errors)

        missing = AddShortlistItemSerializer(data={})
        self.assertFalse(missing.is_valid())
        self.assertIn("listing_id", missing.errors)

        invalid = AddShortlistItemSerializer(data={"listing_id": 0})
        self.assertFalse(invalid.is_valid())
        self.assertIn("listing_id", invalid.errors)

    def test_duplicate_shortlist_error_uses_approved_conflict_code(self):
        response = api_exception_handler(AlreadyInShortlist(), {})
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["error"]["code"], "already_in_shortlist")


class ShortlistAPITests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="shortlist-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Listing Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        self.seeker = User.objects.create_user(
            email="shortlist-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Home Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        self.other_seeker = User.objects.create_user(
            email="other-shortlist-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Another Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        self.client.force_authenticate(self.seeker)

    def create_listing(self, **overrides):
        values = {
            "owner": self.owner,
            "title": "Two bedroom home",
            "location": "Mirpur, Dhaka",
            "property_type": "Flat / Apartment",
            "monthly_rent": "18000.00",
            "bedrooms": 2,
            "bathrooms": 1,
            "amenities": ["Lift"],
            "lifecycle_status": Listing.LifecycleStatus.PUBLISHED,
            "availability_status": Listing.AvailabilityStatus.AVAILABLE,
            "availability_confirmed_at": timezone.now(),
        }
        values.update(overrides)
        return Listing.objects.create(**values)

    def save_listing(self, listing, client=None):
        client = client or self.client
        return client.post(
            "/api/v1/shortlist/", {"listing_id": listing.pk}, format="json"
        )

    def test_only_authenticated_home_seekers_can_access_their_shortlist(self):
        anonymous = APIClient()
        unauthenticated = anonymous.get("/api/v1/shortlist/")
        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)

        owner_client = APIClient()
        owner_client.force_authenticate(self.owner)
        denied = owner_client.get("/api/v1/shortlist/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(denied.data["error"]["code"], "permission_denied")

        listing = self.create_listing()
        saved = self.save_listing(listing)
        self.assertEqual(saved.status_code, status.HTTP_201_CREATED, saved.data)

    def test_add_is_limited_to_published_listings_and_duplicate_returns_conflict(self):
        missing = self.client.post("/api/v1/shortlist/", {}, format="json")
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("listing_id", missing.data["error"]["fields"])

        invalid_id = self.client.post(
            "/api/v1/shortlist/", {"listing_id": "not-a-number"}, format="json"
        )
        self.assertEqual(invalid_id.status_code, status.HTTP_400_BAD_REQUEST)

        published = self.create_listing()
        saved = self.save_listing(published)
        self.assertEqual(saved.status_code, status.HTTP_201_CREATED, saved.data)
        self.assertEqual(saved.data["listing"]["id"], published.pk)
        self.assertEqual(saved.data["listing"]["lifecycle_status"], "PUBLISHED")

        duplicate = self.save_listing(published)
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(duplicate.data["error"]["code"], "already_in_shortlist")
        self.assertEqual(ShortlistItem.objects.filter(seeker=self.seeker).count(), 1)

        for lifecycle in (
            Listing.LifecycleStatus.DRAFT,
            Listing.LifecycleStatus.UNPUBLISHED,
            Listing.LifecycleStatus.REMOVED,
        ):
            ineligible = self.create_listing(lifecycle_status=lifecycle)
            response = self.save_listing(ineligible)
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(ShortlistItem.objects.filter(seeker=self.seeker).count(), 1)

    def test_list_is_private_and_shows_live_comparison_data_and_separate_statuses(self):
        unpublished = self.create_listing()
        self.save_listing(unpublished)
        removed = self.create_listing(title="Removed home")
        self.save_listing(removed)
        removed.lifecycle_status = Listing.LifecycleStatus.REMOVED
        removed.save(update_fields=("lifecycle_status",))
        unpublished.lifecycle_status = Listing.LifecycleStatus.UNPUBLISHED
        unpublished.description = "Private full description"
        unpublished.save(update_fields=("lifecycle_status", "description"))

        response = self.client.get("/api/v1/shortlist/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 2)
        data_by_id = {row["listing"]["id"]: row["listing"] for row in response.data["results"]}
        self.assertEqual(
            data_by_id[unpublished.pk]["lifecycle_status"], "UNPUBLISHED"
        )
        self.assertEqual(data_by_id[unpublished.pk]["title"], "Two bedroom home")
        self.assertNotIn("description", data_by_id[unpublished.pk])
        self.assertNotIn("images", data_by_id[unpublished.pk])
        self.assertNotIn("owner", data_by_id[unpublished.pk])
        self.assertEqual(data_by_id[removed.pk]["lifecycle_status"], "REMOVED")
        self.assertIn("availability", data_by_id[removed.pk])

        other_client = APIClient()
        other_client.force_authenticate(self.other_seeker)
        other_list = other_client.get("/api/v1/shortlist/")
        self.assertEqual(other_list.status_code, status.HTTP_200_OK)
        self.assertEqual(other_list.data["count"], 0)
        self.assertEqual(other_list.data["results"], [])

    def test_remove_deletes_only_the_callers_saved_item_and_returns_no_content(self):
        listing = self.create_listing()
        saved = self.save_listing(listing)
        self.assertEqual(saved.status_code, status.HTTP_201_CREATED)
        other_client = APIClient()
        other_client.force_authenticate(self.other_seeker)
        other_saved = self.save_listing(listing, client=other_client)
        self.assertEqual(other_saved.status_code, status.HTTP_201_CREATED)
        removed = self.client.delete(f"/api/v1/shortlist/{listing.pk}/")
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(removed.content, b"")
        self.assertFalse(ShortlistItem.objects.filter(seeker=self.seeker).exists())
        self.assertTrue(
            ShortlistItem.objects.filter(
                seeker=self.other_seeker, listing=listing
            ).exists()
        )

        missing = self.client.delete(f"/api/v1/shortlist/{listing.pk}/")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_list_uses_twenty_item_pages_and_invalid_page_has_last_page(self):
        for index in range(21):
            listing = self.create_listing(title=f"Home {index}")
            response = self.save_listing(listing)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        first = self.client.get("/api/v1/shortlist/")
        self.assertEqual(first.data["count"], 21)
        self.assertEqual(len(first.data["results"]), 20)
        self.assertIsNotNone(first.data["next"])

        second = self.client.get("/api/v1/shortlist/", {"page": 2})
        self.assertEqual(len(second.data["results"]), 1)
        self.assertIsNotNone(second.data["previous"])

        invalid = self.client.get("/api/v1/shortlist/", {"page": 3})
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid.data["error"]["code"], "invalid_page")
        self.assertEqual(invalid.data["error"]["details"]["last_page"], 2)

    def test_compare_returns_only_requested_saved_homes_in_requested_order(self):
        first = self.create_listing(title="First home")
        second = self.create_listing(title="Unpublished home")
        third = self.create_listing(title="Removed home")
        for listing in (first, second, third):
            self.assertEqual(self.save_listing(listing).status_code, status.HTTP_201_CREATED)

        second.lifecycle_status = Listing.LifecycleStatus.UNPUBLISHED
        second.availability_status = Listing.AvailabilityStatus.UNAVAILABLE
        second.save(update_fields=("lifecycle_status", "availability_status"))

        third.lifecycle_status = Listing.LifecycleStatus.REMOVED
        third.location = None
        third.property_type = None
        third.save(update_fields=("lifecycle_status", "location", "property_type"))

        query = f"listing_ids={third.pk}&listing_ids={first.pk}&listing_ids={second.pk}"
        response = self.client.get(f"/api/v1/shortlist/compare/?{query}")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = response.data["results"]
        self.assertEqual([row["listing"]["id"] for row in rows], [third.pk, first.pk, second.pk])
        self.assertEqual(rows[0]["listing"]["lifecycle_status"], "REMOVED")
        self.assertIsNone(rows[0]["listing"]["location"])
        self.assertIsNone(rows[0]["listing"]["property_type"])
        self.assertEqual(rows[1]["listing"]["lifecycle_status"], "PUBLISHED")
        self.assertEqual(rows[2]["listing"]["lifecycle_status"], "UNPUBLISHED")
        for row in rows:
            listing_data = row["listing"]
            self.assertIn("availability", listing_data)
            self.assertIn("updated_at", listing_data)
            self.assertNotIn("description", listing_data)
            if listing_data["lifecycle_status"] == Listing.LifecycleStatus.PUBLISHED:
                self.assertIn("images", listing_data)
            else:
                self.assertNotIn("images", listing_data)
            self.assertNotIn("owner", listing_data)
            self.assertNotIn("best", response.data)

    def test_compare_requires_one_to_three_unique_saved_listing_ids(self):
        listings = [self.create_listing(title=f"Home {index}") for index in range(4)]
        for listing in listings:
            self.assertEqual(self.save_listing(listing).status_code, status.HTTP_201_CREATED)

        missing = self.client.get("/api/v1/shortlist/compare/")
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("listing_ids", missing.data["error"]["fields"])

        too_many = self.client.get(
            "/api/v1/shortlist/compare/?"
            + "&".join(f"listing_ids={listing.pk}" for listing in listings)
        )
        self.assertEqual(too_many.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("listing_ids", too_many.data["error"]["fields"])

        duplicate = self.client.get(
            f"/api/v1/shortlist/compare/?listing_ids={listings[0].pk}"
            f"&listing_ids={listings[0].pk}"
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("listing_ids", duplicate.data["error"]["fields"])

        malformed = self.client.get("/api/v1/shortlist/compare/?listing_ids=not-an-id")
        self.assertEqual(malformed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("listing_ids", malformed.data["error"]["fields"])

    def test_compare_rejects_ids_outside_the_callers_shortlist(self):
        saved = self.create_listing()
        unsaved = self.create_listing(title="Not saved")
        self.save_listing(saved)

        response = self.client.get(
            f"/api/v1/shortlist/compare/?listing_ids={saved.pk}"
            f"&listing_ids={unsaved.pk}"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("listing_ids", response.data["error"]["fields"])

    def test_compare_is_restricted_to_authenticated_home_seekers(self):
        url = "/api/v1/shortlist/compare/?listing_ids=1"
        anonymous = APIClient().get(url)
        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)

        owner_client = APIClient()
        owner_client.force_authenticate(self.owner)
        denied = owner_client.get(url)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(denied.data["error"]["code"], "permission_denied")
