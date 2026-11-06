from decimal import Decimal

from django.core.files.storage import default_storage
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import StrictSerializer, profile_picture_url

from .models import Listing, ListingImage
from .services import availability_reminder

SERVER_CONTROLLED_FIELDS = frozenset(
    {
        "id",
        "owner",
        "lifecycle_status",
        "availability_status",
        "availability_confirmed_at",
        "created_at",
        "updated_at",
    }
)


class ListingInputSerializer(StrictSerializer):
    ignored_input_fields = SERVER_CONTROLLED_FIELDS

    title = serializers.CharField(max_length=150, required=False, allow_null=True)
    location = serializers.CharField(max_length=150, required=False, allow_null=True)
    property_type = serializers.CharField(
        max_length=50,
        required=False,
        allow_null=True,
    )
    monthly_rent = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
    )
    bedrooms = serializers.IntegerField(min_value=0, max_value=32767, required=False)
    bathrooms = serializers.IntegerField(min_value=0, max_value=32767, required=False)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    amenities = serializers.ListField(
        child=serializers.CharField(allow_blank=False), required=False
    )

    def validate_title(self, value):
        if value is not None and not value.strip():
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate_location(self, value):
        if value is not None and not value.strip():
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate_property_type(self, value):
        if value is not None and not value.strip():
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate_amenities(self, value):
        if any(not amenity.strip() for amenity in value):
            raise serializers.ValidationError("Amenities may not be blank.")
        return value

    def validate(self, attrs):
        if not self.partial and not all(
            field in attrs for field in ("monthly_rent", "bedrooms", "bathrooms")
        ):
            raise serializers.ValidationError(
                {
                    field: ["This field is required."]
                    for field in ("monthly_rent", "bedrooms", "bathrooms")
                    if field not in attrs
                }
            )
        if self.partial and not attrs:
            raise serializers.ValidationError("Provide at least one listing change.")
        return attrs


class AvailabilityActionSerializer(StrictSerializer):
    action = serializers.ChoiceField(choices=("STILL_AVAILABLE", "NOT_AVAILABLE"))


class PublicListingSearchParamsSerializer(StrictSerializer):
    owner_id = serializers.IntegerField(min_value=1, required=False)
    location = serializers.CharField(required=False, allow_blank=False, max_length=150)
    rent_min = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False
    )
    rent_max = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False
    )
    property_type = serializers.CharField(
        required=False, allow_blank=False, max_length=50
    )
    bedrooms = serializers.IntegerField(min_value=0, max_value=32767, required=False)
    availability = serializers.ChoiceField(
        choices=Listing.AvailabilityStatus.choices, required=False
    )
    sort = serializers.ChoiceField(
        choices=("newest", "rent_asc", "rent_desc"), required=False
    )
    page = serializers.CharField(required=False)

    def validate(self, attrs):
        rent_min = attrs.get("rent_min")
        rent_max = attrs.get("rent_max")
        if rent_min is not None and rent_max is not None and rent_min > rent_max:
            raise serializers.ValidationError(
                {"rent_min": ["Minimum rent cannot be above maximum rent."]}
            )
        return attrs


class PublicListingCardSerializer(serializers.ModelSerializer):
    monthly_rent = serializers.DecimalField(
        max_digits=12, decimal_places=2, coerce_to_string=False
    )
    availability = serializers.SerializerMethodField()
    primary_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = (
            "id",
            "title",
            "location",
            "property_type",
            "monthly_rent",
            "bedrooms",
            "bathrooms",
            "availability",
            "primary_image_url",
        )

    def get_availability(self, listing):
        _notice, _day, shown_status = availability_reminder(
            listing, self.context["now"]
        )
        return {
            "status": shown_status,
            "last_confirmed_at": listing.availability_confirmed_at,
        }

    def get_primary_image_url(self, listing):
        images = getattr(listing, "public_images", ())
        if not images:
            return None
        return reverse("public-listing-image", kwargs={"image_id": images[0].pk})


class PublicListingOwnerSerializer(serializers.ModelSerializer):
    profile_picture_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "full_name", "profile_picture_url")
        read_only_fields = fields

    def get_profile_picture_url(self, owner):
        return profile_picture_url(owner)


class PublicListingImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ListingImage
        fields = ("id", "slot", "url")
        read_only_fields = fields

    def get_url(self, image):
        return reverse("public-listing-image", kwargs={"image_id": image.pk})


class PublicListingDetailSerializer(serializers.ModelSerializer):
    monthly_rent = serializers.DecimalField(
        max_digits=12, decimal_places=2, coerce_to_string=False
    )
    images = PublicListingImageSerializer(many=True, read_only=True)
    availability = serializers.SerializerMethodField()
    owner = PublicListingOwnerSerializer(read_only=True)

    class Meta:
        model = Listing
        fields = (
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
        )
        read_only_fields = fields

    def get_availability(self, listing):
        _notice, _day, shown_status = availability_reminder(
            listing, self.context["now"]
        )
        return {
            "status": shown_status,
            "last_confirmed_at": listing.availability_confirmed_at,
        }


class ListingImageUploadSerializer(StrictSerializer):
    image = serializers.FileField()

    def filter_ignored_input_fields(self, data):
        # This serializer has no ignored fields. Keep multipart data intact:
        # copying request data can attempt to deepcopy TemporaryUploadedFile handles.
        return data


class ListingImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ListingImage
        fields = ("id", "slot", "url", "image_format", "file_size_bytes", "created_at")

    def get_url(self, image):
        return default_storage.url(image.storage_key)


class OwnerListingImageSerializer(ListingImageSerializer):
    def get_url(self, image):
        return reverse(
            "owner-listing-image-content",
            kwargs={"image_id": image.pk},
        )


class OwnerListingSerializer(serializers.ModelSerializer):
    images = OwnerListingImageSerializer(many=True, read_only=True)
    availability_status = serializers.SerializerMethodField()
    availability_notice = serializers.SerializerMethodField()
    reminder_day = serializers.SerializerMethodField()
    availability_actions = serializers.SerializerMethodField()
    has_active_moderation_hold = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = (
            "id",
            "owner",
            "title",
            "location",
            "property_type",
            "monthly_rent",
            "bedrooms",
            "bathrooms",
            "description",
            "amenities",
            "lifecycle_status",
            "has_active_moderation_hold",
            "availability_status",
            "availability_confirmed_at",
            "created_at",
            "updated_at",
            "images",
            "availability_notice",
            "reminder_day",
            "availability_actions",
        )
        read_only_fields = fields

    def get_availability_status(self, listing):
        _notice, _day, effective_status = availability_reminder(listing, timezone.now())
        return effective_status

    def get_availability_notice(self, listing):
        notice, _day, _status = availability_reminder(listing, timezone.now())
        return notice

    def get_reminder_day(self, listing):
        _notice, day, _status = availability_reminder(listing, timezone.now())
        return day

    def get_availability_actions(self, listing):
        notice, _day, _status = availability_reminder(listing, timezone.now())
        return ["STILL_AVAILABLE", "NOT_AVAILABLE"] if notice else []

    def get_has_active_moderation_hold(self, listing):
        active_holds = getattr(listing, "active_moderation_holds", None)
        if active_holds is not None:
            return bool(active_holds)
        return listing.moderation_holds.filter(released_at__isnull=True).exists()
