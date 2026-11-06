from django.db import models
from django.db.models import Q
from django.db.models.deletion import ProtectedError
from django.db.models.functions import Now

from accounts.models import User
from listings.models import Listing


class PreserveModerationHistoryQuerySet(models.QuerySet):
    def delete(self):
        raise ProtectedError("Moderation history cannot be deleted.", [])


class ListingReport(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
        RESOLVED = "RESOLVED", "Resolved"
        REJECTED = "REJECTED", "Rejected"

    id = models.BigAutoField(primary_key=True)
    listing = models.ForeignKey(
        Listing,
        on_delete=models.RESTRICT,
        related_name="reports",
        db_column="listing_id",
    )
    reporter = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name="listing_reports",
        db_column="reporter_id",
    )
    reason = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SUBMITTED,
        db_default=Status.SUBMITTED,
    )
    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.RESTRICT,
        related_name="reviewed_listing_reports",
        db_column="reviewed_by_id",
        db_index=False,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(db_default=Now())

    objects = models.Manager.from_queryset(PreserveModerationHistoryQuerySet)()

    class Meta:
        db_table = "listing_reports"
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=("SUBMITTED", "UNDER_REVIEW", "RESOLVED", "REJECTED")),
                name="ck_listing_reports_status",
            ),
            models.CheckConstraint(
                condition=Q(reason__regex=r"\S"),
                name="ck_listing_reports_reason",
            ),
            models.CheckConstraint(
                condition=(
                    Q(reviewed_by__isnull=True, reviewed_at__isnull=True)
                    | Q(reviewed_by__isnull=False, reviewed_at__isnull=False)
                ),
                name="ck_listing_reports_review_pair",
            ),
        ]

    def __str__(self):
        return f"Report {self.pk} for listing {self.listing_id}"

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError("Moderation history cannot be deleted.", [self])


class ModerationFeedback(models.Model):
    id = models.BigAutoField(primary_key=True)
    report = models.ForeignKey(
        ListingReport,
        on_delete=models.RESTRICT,
        related_name="feedback",
        db_column="report_id",
    )
    author = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name="authored_moderation_feedback",
        db_column="author_id",
    )
    reason = models.TextField()
    created_at = models.DateTimeField(db_default=Now())

    objects = models.Manager.from_queryset(PreserveModerationHistoryQuerySet)()

    class Meta:
        db_table = "moderation_feedback"
        constraints = [
            models.CheckConstraint(
                condition=Q(reason__regex=r"\S"),
                name="ck_moderation_feedback_reason",
            ),
        ]

    def __str__(self):
        return f"Moderation feedback {self.pk} for report {self.report_id}"

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError("Moderation history cannot be deleted.", [self])


class ModerationHold(models.Model):
    id = models.BigAutoField(primary_key=True)
    listing = models.ForeignKey(
        Listing,
        on_delete=models.RESTRICT,
        related_name="moderation_holds",
        db_column="listing_id",
    )
    report = models.ForeignKey(
        ListingReport,
        on_delete=models.RESTRICT,
        related_name="moderation_holds",
        db_column="report_id",
    )
    placed_by = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name="placed_moderation_holds",
        db_column="placed_by_id",
    )
    placed_at = models.DateTimeField(db_default=Now())
    released_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.RESTRICT,
        related_name="released_moderation_holds",
        db_column="released_by_id",
        db_index=False,
    )
    released_at = models.DateTimeField(null=True, blank=True)

    objects = models.Manager.from_queryset(PreserveModerationHistoryQuerySet)()

    class Meta:
        db_table = "moderation_holds"
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(released_by__isnull=True, released_at__isnull=True)
                    | Q(released_by__isnull=False, released_at__isnull=False)
                ),
                name="ck_moderation_holds_release_pair",
            ),
            models.UniqueConstraint(
                fields=("listing",),
                condition=Q(released_at__isnull=True),
                name="uq_moderation_holds_one_active",
            ),
        ]

    def __str__(self):
        return f"Moderation hold {self.pk} for listing {self.listing_id}"

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError("Moderation history cannot be deleted.", [self])


class PlatformFeedback(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        RESOLVED = "RESOLVED", "Resolved"
        REJECTED = "REJECTED", "Rejected"

    id = models.BigAutoField(primary_key=True)
    author = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name="platform_feedback_submissions",
        db_column="author_id",
    )
    rating = models.PositiveSmallIntegerField(null=True, blank=True)
    message = models.CharField(max_length=2000)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SUBMITTED,
        db_default=Status.SUBMITTED,
    )
    created_at = models.DateTimeField(db_default=Now())
    updated_at = models.DateTimeField(auto_now=True)
    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.RESTRICT,
        related_name="reviewed_platform_feedback",
        db_column="reviewed_by_id",
        db_index=False,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    objects = models.Manager.from_queryset(PreserveModerationHistoryQuerySet)()

    class Meta:
        db_table = "platform_feedback"
        ordering = ("-created_at", "-id")
        constraints = [
            models.CheckConstraint(
                condition=Q(message__regex=r"\S"),
                name="ck_platform_feedback_message",
            ),
            models.CheckConstraint(
                condition=Q(rating__isnull=True) | Q(rating__gte=1, rating__lte=5),
                name="ck_platform_feedback_rating",
            ),
            models.CheckConstraint(
                condition=(
                    Q(status="SUBMITTED", reviewed_by__isnull=True, reviewed_at__isnull=True)
                    | Q(
                        status__in=("UNDER_REVIEW", "RESOLVED", "REJECTED"),
                        reviewed_by__isnull=False,
                        reviewed_at__isnull=False,
                    )
                ),
                name="ck_platform_feedback_review_state",
            ),
        ]

    def __str__(self):
        return f"Platform feedback {self.pk} from {self.author_id}"

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError("Platform feedback history cannot be deleted.", [self])
