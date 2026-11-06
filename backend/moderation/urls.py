from django.urls import path

from .views import (
    AdminOverviewView,
    AdminPlatformFeedbackDetailView,
    AdminPlatformFeedbackListView,
    AdminModerationListingImageView,
    CreateListingReportView,
    GiveModerationFeedbackView,
    MarkReportReviewedView,
    ModerationReportDetailView,
    ModerationReportQueueView,
    OwnerModerationFeedbackView,
    PlatformFeedbackView,
    ReleaseModerationHoldView,
    SetReportOutcomeView,
    UnpublishReportedListingView,
)

urlpatterns = [
    path("admin/overview/", AdminOverviewView.as_view(), name="admin-overview"),
    path("platform-feedback/", PlatformFeedbackView.as_view(), name="platform-feedback"),
    path("moderation/feedback/", AdminPlatformFeedbackListView.as_view(), name="admin-platform-feedback"),
    path(
        "moderation/feedback/<int:feedback_id>/",
        AdminPlatformFeedbackDetailView.as_view(),
        name="admin-platform-feedback-detail",
    ),
    path("reports/", CreateListingReportView.as_view(), name="listing-report-create"),
    path("moderation/reports/", ModerationReportQueueView.as_view(), name="moderation-report-queue"),
    path(
        "moderation/listing-images/<int:image_id>/content/",
        AdminModerationListingImageView.as_view(),
        name="moderation-listing-image-content",
    ),
    path(
        "moderation/reports/<int:report_id>/",
        ModerationReportDetailView.as_view(),
        name="moderation-report-detail",
    ),
    path(
        "moderation/reports/<int:report_id>/mark-reviewed/",
        MarkReportReviewedView.as_view(),
        name="moderation-report-mark-reviewed",
    ),
    path(
        "moderation/reports/<int:report_id>/outcome/",
        SetReportOutcomeView.as_view(),
        name="moderation-report-outcome",
    ),
    path(
        "moderation/reports/<int:report_id>/feedback/",
        GiveModerationFeedbackView.as_view(),
        name="moderation-report-feedback",
    ),
    path(
        "moderation/reports/<int:report_id>/unpublish/",
        UnpublishReportedListingView.as_view(),
        name="moderation-report-unpublish",
    ),
    path(
        "moderation/listings/<int:listing_id>/release-hold/",
        ReleaseModerationHoldView.as_view(),
        name="moderation-listing-release-hold",
    ),
    path(
        "owner/moderation-feedback/",
        OwnerModerationFeedbackView.as_view(),
        name="owner-moderation-feedback",
    ),
]
