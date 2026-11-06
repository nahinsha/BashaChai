from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import StrictSerializer
from listings.models import Listing
from listings.serializers import ListingImageSerializer
from listings.services import availability_reminder

from .models import ListingReport, ModerationFeedback, ModerationHold, PlatformFeedback


class CreateListingReportSerializer(StrictSerializer):
    listing_id = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(allow_blank=False, trim_whitespace=True)

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("This field may not be blank.")
        return value


class ReportQueueQuerySerializer(StrictSerializer):
    status = serializers.ChoiceField(
        choices=ListingReport.Status.choices,
        required=False,
    )
    page = serializers.CharField(required=False)


class ReportOutcomeSerializer(StrictSerializer):
    status = serializers.ChoiceField(
        choices=(ListingReport.Status.RESOLVED, ListingReport.Status.REJECTED)
    )


class ModerationFeedbackInputSerializer(StrictSerializer):
    reason = serializers.CharField(allow_blank=False, trim_whitespace=True)

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("This field may not be blank.")
        return value


class ModerationFeedbackListQuerySerializer(StrictSerializer):
    listing_id = serializers.IntegerField(min_value=1, required=False)
    page = serializers.CharField(required=False)


class CreatePlatformFeedbackSerializer(StrictSerializer):
    rating = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)
    message = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)
    scope_acknowledged = serializers.BooleanField(write_only=True)

    def validate_scope_acknowledged(self, value):
        if not value:
            raise serializers.ValidationError(
                "Confirm that this feedback is about your experience with the BasaChai platform."
            )
        return value

    def validate_message(self, value):
        if not value.strip():
            raise serializers.ValidationError("This field may not be blank.")
        return value


class PlatformFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformFeedback
        fields = ("id", "rating", "message", "status", "created_at", "updated_at")
        read_only_fields = fields


class AdminPlatformFeedbackSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    author_email = serializers.EmailField(source="author.email", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", read_only=True, allow_null=True)

    class Meta:
        model = PlatformFeedback
        fields = (
            "id", "author_name", "author_email", "rating", "message", "status",
            "created_at", "updated_at", "reviewed_by_name", "reviewed_at",
        )
        read_only_fields = fields


class PlatformFeedbackStatusSerializer(StrictSerializer):
    status = serializers.ChoiceField(
        choices=PlatformFeedback.Status.choices
    )


class PublicAdminUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "full_name")
        read_only_fields = fields


class ModerationListingImageSerializer(ListingImageSerializer):
    def get_url(self, image):
        return reverse(
            "moderation-listing-image-content",
            kwargs={"image_id": image.pk},
        )


class ModerationListingSerializer(serializers.ModelSerializer):
    availability = serializers.SerializerMethodField()
    has_active_moderation_hold = serializers.SerializerMethodField()
    images = ModerationListingImageSerializer(many=True, read_only=True)

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
            "lifecycle_status",
            "availability",
            "has_active_moderation_hold",
            "images",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_availability(self, listing):
        _notice, _day, shown_status = availability_reminder(
            listing, self.context.get("now", timezone.now())
        )
        return {
            "status": shown_status,
            "declared_status": listing.availability_status,
            "last_confirmed_at": listing.availability_confirmed_at,
        }

    def get_has_active_moderation_hold(self, listing):
        active_holds = getattr(listing, "active_moderation_holds", None)
        if active_holds is not None:
            return bool(active_holds)
        return listing.moderation_holds.filter(released_at__isnull=True).exists()


class ReportQueueItemSerializer(serializers.ModelSerializer):
    listing = serializers.SerializerMethodField()

    class Meta:
        model = ListingReport
        fields = ("id", "listing", "reason", "status", "created_at", "reviewed_at")
        read_only_fields = fields

    def get_listing(self, report):
        return {
            "id": report.listing_id,
            "title": report.listing.title,
            "lifecycle_status": report.listing.lifecycle_status,
        }


class ActiveModerationHoldSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModerationHold
        fields = ("id", "placed_at")
        read_only_fields = fields


class ModerationFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModerationFeedback
        fields = ("id", "reason", "created_at")
        read_only_fields = fields


class ModerationReportDetailSerializer(serializers.ModelSerializer):
    reviewed_by = PublicAdminUserSerializer(read_only=True)
    listing = ModerationListingSerializer(read_only=True)
    active_hold = serializers.SerializerMethodField()
    feedback = ModerationFeedbackSerializer(many=True, read_only=True)

    class Meta:
        model = ListingReport
        fields = (
            "id",
            "reason",
            "status",
            "created_at",
            "reviewed_by",
            "reviewed_at",
            "listing",
            "active_hold",
            "feedback",
        )
        read_only_fields = fields

    def get_active_hold(self, report):
        hold = getattr(report, "active_moderation_hold", None)
        if hold is None:
            return None
        return ActiveModerationHoldSerializer(hold).data


class ReportReceiptSerializer(serializers.ModelSerializer):
    listing_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = ListingReport
        fields = ("id", "listing_id", "status", "created_at")
        read_only_fields = fields


class CreatedModerationFeedbackSerializer(serializers.ModelSerializer):
    listing = serializers.SerializerMethodField()

    class Meta:
        model = ModerationFeedback
        fields = ("id", "listing", "reason", "created_at")
        read_only_fields = fields

    def get_listing(self, feedback):
        listing = feedback.report.listing
        return {"id": listing.pk, "title": listing.title}


class OwnerModerationFeedbackSerializer(serializers.ModelSerializer):
    listing = serializers.SerializerMethodField()

    class Meta:
        model = ModerationFeedback
        fields = ("id", "listing", "reason", "created_at")
        read_only_fields = fields

    def get_listing(self, feedback):
        listing = feedback.report.listing
        return {"id": listing.pk, "title": listing.title}
