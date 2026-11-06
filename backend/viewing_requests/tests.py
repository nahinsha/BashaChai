from datetime import timedelta

from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.exceptions import api_exception_handler
from accounts.models import RoleMembership, User
from listings.models import Listing

from .models import ViewingRequest
from .serializers import CreateViewingRequestSerializer
from .exceptions import DuplicatePendingRequest, InvalidViewingRequestTransition


class ViewingRequestInputTests(SimpleTestCase):
    def test_preferred_time_requires_offset_and_must_be_future(self):
        valid = CreateViewingRequestSerializer(
            data={
                "listing_id": 1,
                "preferred_at": (timezone.now() + timedelta(days=1)).isoformat(),
            }
        )
        self.assertTrue(valid.is_valid(), valid.errors)

        naive = CreateViewingRequestSerializer(
            data={"listing_id": 1, "preferred_at": "2030-01-01T12:00:00"}
        )
        self.assertFalse(naive.is_valid())
        self.assertIn("preferred_at", naive.errors)

        past = CreateViewingRequestSerializer(
            data={"listing_id": 1, "preferred_at": "2000-01-01T12:00:00+06:00"}
        )
        self.assertFalse(past.is_valid())
        self.assertIn("preferred_at", past.errors)

    def test_conflict_responses_include_documented_codes_and_details(self):
        duplicate = api_exception_handler(DuplicatePendingRequest(17), {})
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(duplicate.data["error"]["code"], "duplicate_pending_request")
        self.assertEqual(duplicate.data["error"]["details"], {"request_id": 17})

        transition = api_exception_handler(
            InvalidViewingRequestTransition(ViewingRequest.Status.CANCELLED), {}
        )
        self.assertEqual(transition.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            transition.data["error"]["details"],
            {"current_status": ViewingRequest.Status.CANCELLED},
        )


class ViewingRequestAPITests(APITestCase):
    endpoint = "/api/v1/viewing-requests/"

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            email="viewing-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Listing Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        cls.other_owner = User.objects.create_user(
            email="viewing-other-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Another Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        cls.seeker = User.objects.create_user(
            email="viewing-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Home Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        cls.other_seeker = User.objects.create_user(
            email="viewing-other-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Another Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        cls.dual_role = User.objects.create_user(
            email="viewing-dual@example.com",
            password="A-strong-random-password-42!",
            full_name="Dual Role",
            roles=[
                RoleMembership.Role.HOME_SEEKER,
                RoleMembership.Role.PROPERTY_OWNER,
            ],
        )

    def setUp(self):
        self.seeker_client = APIClient()
        self.seeker_client.force_authenticate(self.seeker)
        self.owner_client = APIClient()
        self.owner_client.force_authenticate(self.owner)
        self.other_owner_client = APIClient()
        self.other_owner_client.force_authenticate(self.other_owner)

    def create_listing(self, owner=None, **overrides):
        values = {
            "owner": owner or self.owner,
            "title": "Sunny apartment",
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

    def submit(self, listing, client=None, preferred_at=None, **extra):
        data = {
            "listing_id": listing.pk,
            "preferred_at": preferred_at
            or (timezone.now() + timedelta(days=2)).isoformat(),
        }
        data.update(extra)
        return (client or self.seeker_client).post(self.endpoint, data, format="json")

    def create_request(self, listing=None, seeker=None, status_value=None):
        return ViewingRequest.objects.create(
            listing=listing or self.create_listing(),
            seeker=seeker or self.seeker,
            preferred_at=timezone.now() + timedelta(days=2),
            **({"status": status_value} if status_value else {}),
        )

    def test_home_seeker_creates_pending_request_with_documented_response(self):
        listing = self.create_listing()
        response = self.submit(listing)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], ViewingRequest.Status.PENDING)
        self.assertEqual(response.data["listing"]["id"], listing.pk)
        self.assertEqual(response.data["seeker"]["id"], self.seeker.pk)
        self.assertEqual(response.data["owner"]["id"], self.owner.pk)
        self.assertIsNone(response.data["seeker"]["profile_picture_url"])
        self.assertIsNone(response.data["owner"]["profile_picture_url"])
        self.assertEqual(ViewingRequest.objects.count(), 1)

    def test_missing_invalid_or_past_date_is_rejected(self):
        listing = self.create_listing()
        missing = self.seeker_client.post(
            self.endpoint, {"listing_id": listing.pk}, format="json"
        )
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("preferred_at", missing.data["error"]["fields"])

        for value in ("not-a-datetime", "2000-01-01T12:00:00+06:00", "2030-01-01T12:00:00"):
            with self.subTest(preferred_at=value):
                response = self.submit(listing, preferred_at=value)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ViewingRequest.objects.exists())

    def test_only_home_seekers_may_create_and_owner_cannot_request_own_listing(self):
        listing = self.create_listing()
        owner_denied = self.submit(listing, client=self.owner_client)
        self.assertEqual(owner_denied.status_code, status.HTTP_403_FORBIDDEN)

        own_listing = self.create_listing(owner=self.seeker)
        own_denied = self.submit(own_listing)
        self.assertEqual(own_denied.status_code, status.HTTP_403_FORBIDDEN)

        dual_owned_listing = self.create_listing(owner=self.dual_role)
        dual_client = APIClient()
        dual_client.force_authenticate(self.dual_role)
        dual_denied = self.submit(dual_owned_listing, client=dual_client)
        self.assertEqual(dual_denied.status_code, status.HTTP_403_FORBIDDEN)

        unauthenticated = APIClient().post(
            self.endpoint,
            {"listing_id": listing.pk, "preferred_at": (timezone.now() + timedelta(days=2)).isoformat()},
            format="json",
        )
        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_listing_must_be_published_and_effectively_available(self):
        for lifecycle in (
            Listing.LifecycleStatus.DRAFT,
            Listing.LifecycleStatus.UNPUBLISHED,
            Listing.LifecycleStatus.REMOVED,
        ):
            with self.subTest(lifecycle=lifecycle):
                listing = self.create_listing(lifecycle_status=lifecycle)
                response = self.submit(listing)
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        for availability, confirmed_at in (
            (Listing.AvailabilityStatus.UNAVAILABLE, timezone.now()),
            (Listing.AvailabilityStatus.NEEDS_RECONFIRMATION, timezone.now()),
            (Listing.AvailabilityStatus.AVAILABLE, timezone.now() - timedelta(days=8)),
        ):
            with self.subTest(availability=availability, confirmed_at=confirmed_at):
                listing = self.create_listing(
                    availability_status=availability,
                    availability_confirmed_at=confirmed_at,
                )
                response = self.submit(listing)
                self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
                self.assertEqual(
                    response.data["error"]["code"], "listing_not_accepting_requests"
                )

        self.assertFalse(ViewingRequest.objects.exists())

    def test_one_pending_request_per_seeker_listing_and_ended_requests_do_not_block(self):
        listing = self.create_listing()
        first = self.submit(listing)
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)

        duplicate = self.submit(listing)
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(duplicate.data["error"]["code"], "duplicate_pending_request")
        self.assertEqual(duplicate.data["error"]["details"]["request_id"], first.data["id"])

        request = ViewingRequest.objects.get(pk=first.data["id"])
        request.status = ViewingRequest.Status.REJECTED
        request.save(update_fields=("status",))
        after_rejection = self.submit(listing)
        self.assertEqual(after_rejection.status_code, status.HTTP_201_CREATED)

    def test_owner_can_list_and_respond_only_to_own_pending_requests(self):
        listing = self.create_listing()
        request = self.create_request(listing=listing)
        owner_list = self.owner_client.get(self.endpoint)
        self.assertEqual(owner_list.status_code, status.HTTP_200_OK, owner_list.data)
        self.assertEqual([item["id"] for item in owner_list.data["results"]], [request.pk])

        not_owner = self.other_owner_client.post(
            f"{self.endpoint}{request.pk}/accept/", {}, format="json"
        )
        self.assertEqual(not_owner.status_code, status.HTTP_404_NOT_FOUND)

        accepted = self.owner_client.post(
            f"{self.endpoint}{request.pk}/accept/", {}, format="json"
        )
        self.assertEqual(accepted.status_code, status.HTTP_200_OK, accepted.data)
        self.assertEqual(accepted.data["status"], ViewingRequest.Status.ACCEPTED)

        terminal = self.owner_client.post(
            f"{self.endpoint}{request.pk}/reject/", {}, format="json"
        )
        self.assertEqual(terminal.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            terminal.data["error"]["details"]["current_status"],
            ViewingRequest.Status.ACCEPTED,
        )

    def test_seeker_lists_only_own_requests_and_can_cancel_pending(self):
        listing = self.create_listing()
        own = self.create_request(listing=listing)
        other = self.create_request(listing=self.create_listing(), seeker=self.other_seeker)

        own_list = self.seeker_client.get(self.endpoint)
        self.assertEqual(own_list.status_code, status.HTTP_200_OK, own_list.data)
        self.assertEqual([item["id"] for item in own_list.data["results"]], [own.pk])

        other_client = APIClient()
        other_client.force_authenticate(self.other_seeker)
        hidden = other_client.post(f"{self.endpoint}{own.pk}/cancel/", {}, format="json")
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

        cancelled = self.seeker_client.post(
            f"{self.endpoint}{own.pk}/cancel/", {}, format="json"
        )
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK, cancelled.data)
        self.assertEqual(cancelled.data["status"], ViewingRequest.Status.CANCELLED)

        owner_cannot_finish = self.owner_client.post(
            f"{self.endpoint}{own.pk}/accept/", {}, format="json"
        )
        self.assertEqual(owner_cannot_finish.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            owner_cannot_finish.data["error"]["details"]["current_status"],
            ViewingRequest.Status.CANCELLED,
        )
        self.assertEqual(other.seeker_id, self.other_seeker.pk)

    def test_cancelled_request_can_be_followed_by_new_pending_request(self):
        listing = self.create_listing()
        first = self.create_request(listing=listing)
        cancelled = self.seeker_client.post(
            f"{self.endpoint}{first.pk}/cancel/", {}, format="json"
        )
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)

        replacement = self.submit(listing)
        self.assertEqual(replacement.status_code, status.HTTP_201_CREATED, replacement.data)

    def test_removed_listing_history_remains_in_authorized_request_lists(self):
        listing = self.create_listing(lifecycle_status=Listing.LifecycleStatus.REMOVED)
        request = self.create_request(listing=listing)

        seeker_list = self.seeker_client.get(self.endpoint)
        owner_list = self.owner_client.get(self.endpoint)
        self.assertEqual(seeker_list.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_list.status_code, status.HTTP_200_OK)
        self.assertEqual(seeker_list.data["results"][0]["id"], request.pk)
        self.assertEqual(
            seeker_list.data["results"][0]["listing"]["lifecycle_status"],
            Listing.LifecycleStatus.REMOVED,
        )

    def test_list_status_filter_and_pagination_validation(self):
        pending = self.create_request()
        self.create_request(status_value=ViewingRequest.Status.ACCEPTED)

        filtered = self.seeker_client.get(self.endpoint, {"status": "PENDING"})
        self.assertEqual(filtered.status_code, status.HTTP_200_OK, filtered.data)
        self.assertEqual([item["id"] for item in filtered.data["results"]], [pending.pk])

        invalid_status = self.seeker_client.get(self.endpoint, {"status": "UNKNOWN"})
        self.assertEqual(invalid_status.status_code, status.HTTP_400_BAD_REQUEST)
        invalid_page = self.seeker_client.get(self.endpoint, {"page": "0"})
        self.assertEqual(invalid_page.status_code, status.HTTP_400_BAD_REQUEST)
