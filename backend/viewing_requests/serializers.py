from datetime import datetime

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from accounts.serializers import (
    PublicHomeSeekerProfileSerializer,
    PublicOwnerProfileSerializer,
    StrictSerializer,
)
from listings.models import Listing

from .models import ViewingRequest


class OffsetDateTimeField(serializers.DateTimeField):
    default_error_messages = {
        "offset_required": "Include a timezone offset in the date and time.",
    }

    def to_internal_value(self, value):
        parsed = value
        if isinstance(value, str):
            try:
                parsed = parse_datetime(value)
            except ValueError:
                parsed = None
        if isinstance(parsed, datetime) and timezone.is_naive(parsed):
            self.fail("offset_required")
        return super().to_internal_value(value)


class CreateViewingRequestSerializer(StrictSerializer):
    listing_id = serializers.IntegerField(min_value=1)
    preferred_at = OffsetDateTimeField()

    def validate_preferred_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Enter a future date and time.")
        return value


class ViewingRequestQuerySerializer(StrictSerializer):
    status = serializers.ChoiceField(
        choices=ViewingRequest.Status.choices,
        required=False,
    )
    page = serializers.CharField(required=False)


class AdminViewingRequestQuerySerializer(ViewingRequestQuerySerializer):
    date = serializers.DateField(required=False)


class ViewingRequestListingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Listing
        fields = ("id", "title", "lifecycle_status")
        read_only_fields = fields


class ViewingRequestSerializer(serializers.ModelSerializer):
    listing = ViewingRequestListingSerializer(read_only=True)
    seeker = serializers.SerializerMethodField()
    owner = serializers.SerializerMethodField()

    class Meta:
        model = ViewingRequest
        fields = (
            "id",
            "listing",
            "seeker",
            "owner",
            "preferred_at",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_seeker(self, viewing_request):
        return PublicHomeSeekerProfileSerializer(viewing_request.seeker).data

    def get_owner(self, viewing_request):
        return PublicOwnerProfileSerializer(viewing_request.listing.owner).data
