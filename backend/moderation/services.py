import logging

from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from listings.models import Listing
from .exceptions import HoldAlreadyActive, ModerationStatusConflict, NoActiveHold
from .models import ListingReport, ModerationFeedback, ModerationHold

logger = logging.getLogger(__name__)


@transaction.atomic
def create_listing_report(reporter, listing_id, reason):
    try:
        listing = Listing.objects.select_for_update().get(pk=listing_id)
    except Listing.DoesNotExist as error:
        raise Http404 from error
    if listing.owner_id == reporter.pk:
        raise PermissionDenied("A Home Seeker cannot report their own listing.")
    if listing.lifecycle_status != Listing.LifecycleStatus.PUBLISHED:
        raise Http404
    return ListingReport.objects.create(
        listing=listing,
        reporter=reporter,
        reason=reason,
    )


def report_queue(status_filter=None):
    reports = ListingReport.objects.select_related("listing")
    if status_filter:
        reports = reports.filter(status=status_filter)
    else:
        reports = reports.filter(
            status__in=(
                ListingReport.Status.SUBMITTED,
                ListingReport.Status.UNDER_REVIEW,
            )
        )
    return reports.order_by("created_at", "pk")


def get_admin_report(report_id):
    active_holds = ModerationHold.objects.filter(
        released_at__isnull=True
    ).order_by("-placed_at", "-pk")
    try:
        report = (
            ListingReport.objects.select_related(
                "listing", "reviewed_by", "listing__owner"
            )
            .prefetch_related(
                "listing__images",
                "feedback",
                Prefetch(
                    "listing__moderation_holds",
                    queryset=active_holds,
                    to_attr="active_moderation_holds",
                ),
            )
            .get(pk=report_id)
        )
    except ListingReport.DoesNotExist as error:
        raise Http404 from error
    report.active_moderation_hold = next(
        iter(getattr(report.listing, "active_moderation_holds", ())), None
    )
    return report


@transaction.atomic
def mark_report_under_review(admin_user, report_id):
    try:
        report = ListingReport.objects.select_for_update().get(pk=report_id)
    except ListingReport.DoesNotExist as error:
        raise Http404 from error
    if report.status != ListingReport.Status.SUBMITTED:
        raise ModerationStatusConflict(report.status)
    report.status = ListingReport.Status.UNDER_REVIEW
    report.reviewed_by = admin_user
    report.reviewed_at = timezone.now()
    report.save(update_fields=("status", "reviewed_by", "reviewed_at"))
    return report


@transaction.atomic
def set_report_outcome(admin_user, report_id, outcome):
    try:
        report = ListingReport.objects.select_for_update().get(pk=report_id)
    except ListingReport.DoesNotExist as error:
        raise Http404 from error
    if report.status != ListingReport.Status.UNDER_REVIEW:
        raise ModerationStatusConflict(report.status)
    report.status = outcome
    report.reviewed_by = admin_user
    report.reviewed_at = timezone.now()
    report.save(update_fields=("status", "reviewed_by", "reviewed_at"))
    return report


def _send_feedback_email(feedback_id):
    try:
        feedback = ModerationFeedback.objects.select_related(
            "report__listing__owner"
        ).get(pk=feedback_id)
        owner = feedback.report.listing.owner
        listing = feedback.report.listing
        sent = send_mail(
            subject="BasaChai listing moderation feedback",
            message=(
                f"Moderation feedback was recorded for your listing "
                f"\"{listing.title or f'Listing {listing.pk}'}\":\n\n"
                f"{feedback.reason}\n"
            ),
            from_email=None,
            recipient_list=[owner.email],
            fail_silently=False,
        )
        if sent != 1:
            logger.warning(
                "Moderation feedback email delivery failed for feedback_id=%s",
                feedback_id,
            )
    except Exception:
        # The feedback row has already committed; email failure is non-fatal.
        logger.warning(
            "Moderation feedback email delivery failed for feedback_id=%s",
            feedback_id,
        )


@transaction.atomic
def record_moderation_feedback(admin_user, report_id, reason):
    try:
        report = ListingReport.objects.select_for_update().get(pk=report_id)
    except ListingReport.DoesNotExist as error:
        raise Http404 from error
    if report.status != ListingReport.Status.UNDER_REVIEW:
        raise ModerationStatusConflict(report.status)

    feedback = ModerationFeedback.objects.create(
        report=report,
        author=admin_user,
        reason=reason,
    )
    report.status = ListingReport.Status.RESOLVED
    report.reviewed_by = admin_user
    report.reviewed_at = timezone.now()
    report.save(update_fields=("status", "reviewed_by", "reviewed_at"))
    transaction.on_commit(lambda: _send_feedback_email(feedback.pk))
    return feedback


@transaction.atomic
def unpublish_reported_listing(admin_user, report_id):
    try:
        report = ListingReport.objects.select_for_update().select_related(
            "listing"
        ).get(pk=report_id)
    except ListingReport.DoesNotExist as error:
        raise Http404 from error

    listing = Listing.objects.select_for_update().get(pk=report.listing_id)
    if ModerationHold.objects.filter(
        listing=listing, released_at__isnull=True
    ).exists():
        raise HoldAlreadyActive()
    if report.status not in (
        ListingReport.Status.UNDER_REVIEW,
        ListingReport.Status.RESOLVED,
    ):
        raise ModerationStatusConflict(report.status)
    if listing.lifecycle_status != Listing.LifecycleStatus.PUBLISHED:
        raise ModerationStatusConflict(listing.lifecycle_status)

    try:
        with transaction.atomic():
            hold = ModerationHold.objects.create(
                listing=listing,
                report=report,
                placed_by=admin_user,
            )
    except IntegrityError as error:
        if ModerationHold.objects.filter(
            listing=listing, released_at__isnull=True
        ).exists():
            raise HoldAlreadyActive() from error
        raise
    listing.lifecycle_status = Listing.LifecycleStatus.UNPUBLISHED
    listing.save(update_fields=("lifecycle_status",))
    return report, hold


@transaction.atomic
def release_listing_hold(admin_user, listing_id):
    try:
        listing = Listing.objects.select_for_update().get(pk=listing_id)
    except Listing.DoesNotExist as error:
        raise Http404 from error
    hold = (
        ModerationHold.objects.select_for_update()
        .filter(listing=listing, released_at__isnull=True)
        .first()
    )
    if hold is None:
        raise NoActiveHold()
    hold.released_by = admin_user
    hold.released_at = timezone.now()
    hold.save(update_fields=("released_by", "released_at"))
    return listing


def owner_feedback(owner, listing_id=None):
    feedback = ModerationFeedback.objects.filter(
        report__listing__owner=owner
    ).select_related("report__listing")
    if listing_id is not None:
        feedback = feedback.filter(report__listing_id=listing_id)
    return feedback.order_by("-created_at", "-pk")
