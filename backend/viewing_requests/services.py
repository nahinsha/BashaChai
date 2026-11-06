from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import RoleMembership
from listings.models import Listing
from listings.services import availability_reminder

from .exceptions import (
    DuplicatePendingRequest,
    InvalidViewingRequestTransition,
    ListingNotAcceptingRequests,
)
from .models import ViewingRequest


def visible_viewing_requests(user):
    scope = Q(pk__in=[])
    roles = user.role_memberships.values_list("role", flat=True)
    if RoleMembership.Role.HOME_SEEKER in roles:
        scope |= Q(seeker=user)
    if RoleMembership.Role.PROPERTY_OWNER in roles:
        scope |= Q(listing__owner=user)
    return (
        ViewingRequest.objects.filter(scope)
        .select_related("listing", "listing__owner", "seeker")
        .order_by("-created_at", "-pk")
    )


@transaction.atomic
def create_viewing_request(seeker, listing_id, preferred_at, now=None):
    now = now or timezone.now()
    if timezone.is_naive(preferred_at) or preferred_at <= now:
        raise ValidationError({"preferred_at": ["Enter a future date and time with a timezone offset."]})

    try:
        listing = Listing.objects.select_for_update().get(pk=listing_id)
    except Listing.DoesNotExist as error:
        raise Http404 from error

    if listing.owner_id == seeker.pk:
        raise PermissionDenied("A Home Seeker cannot request a viewing of their own listing.")

    if listing.lifecycle_status != Listing.LifecycleStatus.PUBLISHED:
        raise Http404

    _notice, _day, shown_availability = availability_reminder(listing, now)
    if shown_availability != Listing.AvailabilityStatus.AVAILABLE:
        raise ListingNotAcceptingRequests()

    existing = ViewingRequest.objects.filter(
        listing=listing,
        seeker=seeker,
        status=ViewingRequest.Status.PENDING,
    ).first()
    if existing:
        raise DuplicatePendingRequest(existing.pk)

    try:
        # Keep the partial unique index as the final guard against a concurrent
        # duplicate, while retaining the approved service-layer check above.
        with transaction.atomic():
            request = ViewingRequest.objects.create(
                listing=listing,
                seeker=seeker,
                preferred_at=preferred_at,
            )
    except IntegrityError as error:
        existing = ViewingRequest.objects.filter(
            listing=listing,
            seeker=seeker,
            status=ViewingRequest.Status.PENDING,
        ).first()
        if existing:
            raise DuplicatePendingRequest(existing.pk)
        diagnostic = getattr(getattr(error.__cause__, "diag", None), "constraint_name", None)
        if diagnostic == "ck_viewing_requests_future":
            raise ValidationError(
                {"preferred_at": ["Enter a future date and time."]}
            ) from error
        raise
    return request


def _locked_owner_request(owner, request_id):
    try:
        return ViewingRequest.objects.select_for_update().select_related(
            "listing", "listing__owner", "seeker"
        ).get(pk=request_id, listing__owner=owner)
    except ViewingRequest.DoesNotExist as error:
        raise Http404 from error


@transaction.atomic
def respond_to_viewing_request(owner, request_id, response_status):
    request = _locked_owner_request(owner, request_id)
    if request.status != ViewingRequest.Status.PENDING:
        raise InvalidViewingRequestTransition(request.status)
    request.status = response_status
    request.updated_at = timezone.now()
    request.save(update_fields=("status", "updated_at"))
    return request


@transaction.atomic
def cancel_viewing_request(seeker, request_id):
    try:
        request = ViewingRequest.objects.select_for_update().select_related(
            "listing", "seeker"
        ).get(pk=request_id, seeker=seeker)
    except ViewingRequest.DoesNotExist as error:
        raise Http404 from error
    if request.status != ViewingRequest.Status.PENDING:
        raise InvalidViewingRequestTransition(request.status)
    request.status = ViewingRequest.Status.CANCELLED
    request.updated_at = timezone.now()
    request.save(update_fields=("status", "updated_at"))
    return request
