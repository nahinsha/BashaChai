from datetime import timedelta
from uuid import uuid4

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Prefetch, Q
from django.http import Http404
from django.utils import timezone
from rest_framework import serializers

from .exceptions import (
    ListingAvailabilityConfirmationRequired,
    ListingConflict,
)
from .image_validation import validate_listing_image
from .models import Listing, ListingImage


def search_public_listings(filters, now=None):
    now = now or timezone.now()
    listings = Listing.objects.filter(
        lifecycle_status=Listing.LifecycleStatus.PUBLISHED
    )

    if "owner_id" in filters:
        listings = listings.filter(owner_id=filters["owner_id"])
    if "location" in filters:
        listings = listings.filter(location__icontains=filters["location"])
    if "rent_min" in filters:
        listings = listings.filter(monthly_rent__gte=filters["rent_min"])
    if "rent_max" in filters:
        listings = listings.filter(monthly_rent__lte=filters["rent_max"])
    if "property_type" in filters:
        listings = listings.filter(property_type__iexact=filters["property_type"])
    if "bedrooms" in filters:
        listings = listings.filter(bedrooms=filters["bedrooms"])

    availability = filters.get("availability")
    if availability:
        confirmation_cutoff = now - timedelta(days=7)
        if availability == Listing.AvailabilityStatus.NEEDS_RECONFIRMATION:
            listings = listings.filter(
                Q(availability_status=availability)
                | Q(availability_confirmed_at__lte=confirmation_cutoff)
            )
        else:
            listings = listings.filter(
                availability_status=availability,
                availability_confirmed_at__gt=confirmation_cutoff,
            )

    sort = filters.get("sort", "newest")
    ordering = {
        "newest": ("-created_at", "id"),
        "rent_asc": ("monthly_rent", "id"),
        "rent_desc": ("-monthly_rent", "id"),
    }[sort]
    return listings.order_by(*ordering).prefetch_related(
        Prefetch(
            "images",
            queryset=ListingImage.objects.order_by("slot"),
            to_attr="public_images",
        )
    )


def availability_reminder(listing, now):
    """Return (notice_due, reminder_day, effective_status) for the owner view."""
    status = listing.availability_status
    if listing.lifecycle_status != Listing.LifecycleStatus.PUBLISHED:
        return False, None, status
    if listing.availability_confirmed_at is None:
        return True, 7, Listing.AvailabilityStatus.NEEDS_RECONFIRMATION

    elapsed = now - listing.availability_confirmed_at
    if (
        status == Listing.AvailabilityStatus.NEEDS_RECONFIRMATION
        or elapsed >= timedelta(days=7)
    ):
        return True, 7, Listing.AvailabilityStatus.NEEDS_RECONFIRMATION
    if elapsed >= timedelta(days=5):
        return True, 5, status
    return False, None, status


@transaction.atomic
def create_listing(owner, validated_data):
    return Listing.objects.create(owner=owner, **validated_data)


def _lock_owned_listing(owner, listing_id):
    try:
        return Listing.objects.select_for_update().get(pk=listing_id, owner=owner)
    except Listing.DoesNotExist as error:
        raise Http404 from error


@transaction.atomic
def update_listing(owner, listing_id, changes):
    listing = _lock_owned_listing(owner, listing_id)
    if listing.lifecycle_status == Listing.LifecycleStatus.REMOVED:
        raise ListingConflict(
            "Removed listings cannot be edited.", code="listing_removed"
        )
    for field, value in changes.items():
        setattr(listing, field, value)
    listing.updated_at = timezone.now()
    listing.save(update_fields=(*changes.keys(), "updated_at"))
    return listing


@transaction.atomic
def publish_listing(owner, listing_id, now=None):
    now = now or timezone.now()
    listing = _lock_owned_listing(owner, listing_id)
    if listing.lifecycle_status == Listing.LifecycleStatus.REMOVED:
        raise ListingConflict(
            "Removed listings cannot be published.", code="listing_removed"
        )
    if listing.moderation_holds.filter(released_at__isnull=True).exists():
        raise ListingConflict(
            "The listing has an active moderation hold.",
            code="moderation_hold_active",
        )
    if listing.lifecycle_status == Listing.LifecycleStatus.PUBLISHED:
        raise ListingConflict("The listing is already Published.")
    if listing.lifecycle_status not in (
        Listing.LifecycleStatus.DRAFT,
        Listing.LifecycleStatus.UNPUBLISHED,
    ):
        raise ListingConflict()

    missing = {}
    for field in ("location", "property_type"):
        if not getattr(listing, field) or not getattr(listing, field).strip():
            missing[field] = ["This field is required before publishing."]
    if listing.images.count() < 1:
        missing["images"] = ["At least one valid image is required before publishing."]
    if missing:
        raise serializers.ValidationError(missing)

    if (
        listing.availability_confirmed_at is None
        or listing.availability_confirmed_at <= now - timedelta(days=7)
        or listing.availability_status == Listing.AvailabilityStatus.NEEDS_RECONFIRMATION
    ):
        raise ListingAvailabilityConfirmationRequired()

    listing.lifecycle_status = Listing.LifecycleStatus.PUBLISHED
    listing.save(update_fields=("lifecycle_status",))
    return listing


@transaction.atomic
def unpublish_listing(owner, listing_id):
    listing = _lock_owned_listing(owner, listing_id)
    if listing.lifecycle_status != Listing.LifecycleStatus.PUBLISHED:
        raise ListingConflict("Only Published listings can be unpublished.")
    listing.lifecycle_status = Listing.LifecycleStatus.UNPUBLISHED
    listing.save(update_fields=("lifecycle_status",))
    return listing


@transaction.atomic
def remove_listing(owner, listing_id):
    listing = _lock_owned_listing(owner, listing_id)
    if listing.lifecycle_status == Listing.LifecycleStatus.REMOVED:
        raise ListingConflict("The listing is already Removed.")
    listing.lifecycle_status = Listing.LifecycleStatus.REMOVED
    listing.save(update_fields=("lifecycle_status",))
    return listing


@transaction.atomic
def confirm_listing_availability(owner, listing_id, action, now=None):
    now = now or timezone.now()
    listing = _lock_owned_listing(owner, listing_id)
    if listing.lifecycle_status == Listing.LifecycleStatus.REMOVED:
        raise ListingConflict(
            "Removed listings cannot be updated.", code="listing_removed"
        )
    listing.availability_status = (
        Listing.AvailabilityStatus.AVAILABLE
        if action == "STILL_AVAILABLE"
        else Listing.AvailabilityStatus.UNAVAILABLE
    )
    listing.availability_confirmed_at = now
    listing.save(update_fields=("availability_status", "availability_confirmed_at"))
    return listing


def _ensure_not_removed(listing):
    if listing.lifecycle_status == Listing.LifecycleStatus.REMOVED:
        raise ListingConflict(
            "Removed listings cannot be changed.", code="listing_removed"
        )


def _store_upload(uploaded_file, extension):
    uploaded_file.seek(0)
    return default_storage.save(f"listings/{uuid4().hex}{extension}", uploaded_file)


def _discard_file(storage_key):
    if storage_key:
        try:
            default_storage.delete(storage_key)
        except Exception:
            pass


@transaction.atomic
def add_listing_image(owner, listing_id, uploaded_file):
    image_format, size, extension = validate_listing_image(uploaded_file)
    listing = _lock_owned_listing(owner, listing_id)
    _ensure_not_removed(listing)
    existing_slots = set(listing.images.values_list("slot", flat=True))
    available_slots = set(range(1, 6)) - existing_slots
    if not available_slots:
        raise serializers.ValidationError(
            {"image": ["A listing may have no more than 5 images."]}
        )

    storage_key = _store_upload(uploaded_file, extension)
    try:
        image = ListingImage.objects.create(
            listing=listing,
            slot=min(available_slots),
            storage_key=storage_key,
            image_format=image_format,
            file_size_bytes=size,
        )
        listing.updated_at = timezone.now()
        listing.save(update_fields=("updated_at",))
    except Exception:
        _discard_file(storage_key)
        raise
    return image


@transaction.atomic
def replace_listing_image(owner, listing_id, image_id, uploaded_file):
    image_format, size, extension = validate_listing_image(uploaded_file)
    listing = _lock_owned_listing(owner, listing_id)
    _ensure_not_removed(listing)
    try:
        image = ListingImage.objects.select_for_update().get(pk=image_id, listing=listing)
    except ListingImage.DoesNotExist as error:
        raise Http404 from error

    new_key = _store_upload(uploaded_file, extension)
    old_key = image.storage_key
    try:
        image.storage_key = new_key
        image.image_format = image_format
        image.file_size_bytes = size
        image.save(update_fields=("storage_key", "image_format", "file_size_bytes"))
        listing.updated_at = timezone.now()
        listing.save(update_fields=("updated_at",))
    except Exception:
        _discard_file(new_key)
        raise
    transaction.on_commit(lambda: _discard_file(old_key))
    return image


@transaction.atomic
def remove_listing_image(owner, listing_id, image_id):
    listing = _lock_owned_listing(owner, listing_id)
    _ensure_not_removed(listing)
    try:
        image = ListingImage.objects.select_for_update().get(pk=image_id, listing=listing)
    except ListingImage.DoesNotExist as error:
        raise Http404 from error

    if (
        listing.lifecycle_status == Listing.LifecycleStatus.PUBLISHED
        and listing.images.count() == 1
    ):
        raise ListingConflict(
            "The last image of a Published listing cannot be removed.",
            code="last_image_required",
        )

    storage_key = image.storage_key
    with default_storage.open(storage_key, "rb") as stored_file:
        file_bytes = stored_file.read()
    default_storage.delete(storage_key)
    try:
        image.delete()
        listing.updated_at = timezone.now()
        listing.save(update_fields=("updated_at",))
    except Exception:
        default_storage.save(storage_key, ContentFile(file_bytes))
        raise
    return None


def refresh_expired_availability(now=None):
    now = now or timezone.now()
    cutoff = now - timedelta(days=7)
    return Listing.objects.filter(
        lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
        availability_confirmed_at__lte=cutoff,
    ).exclude(
        availability_status=Listing.AvailabilityStatus.NEEDS_RECONFIRMATION
    ).update(availability_status=Listing.AvailabilityStatus.NEEDS_RECONFIRMATION)
