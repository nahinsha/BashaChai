from django.utils import timezone
from rest_framework import serializers

from accounts.serializers import StrictSerializer
from listings.models import Listing
from listings.serializers import PublicListingImageSerializer
from listings.services import availability_reminder

from .models import ShortlistItem


class AddShortlistItemSerializer(StrictSerializer):
    listing_id = serializers.IntegerField(min_value=1)


class CompareShortlistSerializer(StrictSerializer):
    listing_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=3,
    )

    def validate_listing_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("A home can only appear once in a comparison.")
        return value


class ShortlistListingSerializer(serializers.ModelSerializer):
    monthly_rent = serializers.DecimalField(
        max_digits=12, decimal_places=2, coerce_to_string=False
    )
    availability = serializers.SerializerMethodField()
    images = PublicListingImageSerializer(many=True, read_only=True)

    class Meta:
        model = Listing
        fields = (
            "id",
            "title",
            "lifecycle_status",
            "location",
            "property_type",
            "monthly_rent",
            "bedrooms",
            "bathrooms",
            "amenities",
            "images",
            "availability",
            "updated_at",
        )
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.lifecycle_status != Listing.LifecycleStatus.PUBLISHED:
            data.pop("images", None)
        return data

    def get_availability(self, listing):
        _notice, _day, shown_status = availability_reminder(
            listing, self.context.get("now", timezone.now())
        )
        return {
            "status": shown_status,
            "last_confirmed_at": listing.availability_confirmed_at,
        }


class ShortlistItemSerializer(serializers.ModelSerializer):
    listing = ShortlistListingSerializer(read_only=True)

    class Meta:
        model = ShortlistItem
        fields = ("id", "created_at", "listing")
        read_only_fields = fields
