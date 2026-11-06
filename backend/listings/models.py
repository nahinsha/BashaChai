from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models.deletion import ProtectedError
from django.db.models import Q, Value
from django.db.models.functions import Now

from accounts.models import User


class ListingQuerySet(models.QuerySet):
    def delete(self):
        raise ProtectedError("Listings are removed by setting lifecycle_status=REMOVED.", [])


class Listing(models.Model):
    class LifecycleStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        UNPUBLISHED = "UNPUBLISHED", "Unpublished"
        REMOVED = "REMOVED", "Removed"

    class AvailabilityStatus(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        UNAVAILABLE = "UNAVAILABLE", "Unavailable"
        NEEDS_RECONFIRMATION = "NEEDS_RECONFIRMATION", "Needs Reconfirmation"

    id = models.BigAutoField(primary_key=True)
    owner = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="listings",
        db_column="owner_id",
        db_index=False,
    )
    title = models.CharField(max_length=150, null=True, blank=True)
    location = models.CharField(max_length=150, null=True, blank=True)
    property_type = models.CharField(max_length=50, null=True, blank=True)
    monthly_rent = models.DecimalField(max_digits=12, decimal_places=2)
    bedrooms = models.SmallIntegerField()
    bathrooms = models.SmallIntegerField()
    description = models.TextField(null=True, blank=True)
    amenities = ArrayField(
        models.TextField(),
        default=list,
        db_default=Value([], output_field=ArrayField(models.TextField())),
    )
    lifecycle_status = models.CharField(
        max_length=20,
        choices=LifecycleStatus.choices,
        default=LifecycleStatus.DRAFT,
        db_default=LifecycleStatus.DRAFT,
    )
    availability_status = models.CharField(
        max_length=30,
        choices=AvailabilityStatus.choices,
        default=AvailabilityStatus.AVAILABLE,
        db_default=AvailabilityStatus.AVAILABLE,
    )
    availability_confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(db_default=Now())
    updated_at = models.DateTimeField(db_default=Now())

    objects = models.Manager.from_queryset(ListingQuerySet)()

    class Meta:
        db_table = "listings"
        constraints = [
            models.CheckConstraint(
                condition=Q(lifecycle_status__in=("DRAFT", "PUBLISHED", "UNPUBLISHED", "REMOVED")),
                name="ck_listings_lifecycle_status",
            ),
            models.CheckConstraint(
                condition=Q(
                    availability_status__in=(
                        "AVAILABLE",
                        "UNAVAILABLE",
                        "NEEDS_RECONFIRMATION",
                    )
                ),
                name="ck_listings_availability_status",
            ),
            models.CheckConstraint(
                condition=Q(monthly_rent__gt=0),
                name="ck_listings_rent_positive",
            ),
            models.CheckConstraint(
                condition=Q(bedrooms__gte=0) & Q(bathrooms__gte=0),
                name="ck_listings_rooms_not_negative",
            ),
            models.CheckConstraint(
                condition=(
                    (Q(title__isnull=True) | Q(title__regex=r"\S"))
                    & (Q(location__isnull=True) | Q(location__regex=r"\S"))
                    & (Q(property_type__isnull=True) | Q(property_type__regex=r"\S"))
                ),
                name="ck_listings_text_not_blank",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(lifecycle_status="PUBLISHED")
                    | Q(availability_confirmed_at__isnull=False)
                ),
                name="ck_published_listing_availability_confirmation",
            ),
        ]
        indexes = [
            models.Index(fields=("owner",), name="ix_listings_owner"),
            models.Index(
                fields=("lifecycle_status", "availability_status"),
                name="ix_listings_statuses",
            ),
            models.Index(fields=("monthly_rent",), name="ix_listings_rent"),
        ]

    def __str__(self):
        return self.title or f"Listing {self.pk}"

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError(
            "Listings are removed by setting lifecycle_status=REMOVED.",
            [self],
        )


class ListingImage(models.Model):
    class ImageFormat(models.TextChoices):
        JPG = "JPG", "JPG"
        JPEG = "JPEG", "JPEG"
        PNG = "PNG", "PNG"
        WEBP = "WEBP", "WebP"

    id = models.BigAutoField(primary_key=True)
    listing = models.ForeignKey(
        Listing,
        on_delete=models.PROTECT,
        related_name="images",
        db_column="listing_id",
        db_index=False,
    )
    slot = models.SmallIntegerField()
    storage_key = models.CharField(max_length=500)
    image_format = models.CharField(max_length=10, choices=ImageFormat.choices)
    file_size_bytes = models.IntegerField()
    created_at = models.DateTimeField(db_default=Now())

    class Meta:
        db_table = "listing_images"
        ordering = ("slot",)
        constraints = [
            models.CheckConstraint(
                condition=Q(slot__gte=1) & Q(slot__lte=5),
                name="ck_listing_images_slot",
            ),
            models.CheckConstraint(
                condition=Q(image_format__in=("JPG", "JPEG", "PNG", "WEBP")),
                name="ck_listing_images_format",
            ),
            models.CheckConstraint(
                condition=Q(file_size_bytes__gte=1) & Q(file_size_bytes__lte=5242880),
                name="ck_listing_images_size",
            ),
            models.UniqueConstraint(
                fields=("listing", "slot"),
                name="uq_listing_images_listing_slot",
            ),
            models.UniqueConstraint(
                fields=("storage_key",),
                name="uq_listing_images_storage_key",
            ),
        ]
    def __str__(self):
        return f"Listing {self.listing_id} image {self.slot}"
