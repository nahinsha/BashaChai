from datetime import datetime, time, timedelta

from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from listings.exceptions import InvalidListingPage
from listings.models import ListingImage
from listings.serializers import OwnerListingSerializer
from listings.views import image_file_response

from .models import ListingReport, PlatformFeedback
from accounts.models import User, RoleMembership
from listings.models import Listing
from viewing_requests.models import ViewingRequest
from messaging.models import Conversation
from .permissions import IsAdminModerator, IsHomeSeeker, IsPlatformFeedbackMember, IsPropertyOwner
from .serializers import (
    AdminPlatformFeedbackSerializer,
    CreatedModerationFeedbackSerializer,
    CreateListingReportSerializer,
    CreatePlatformFeedbackSerializer,
    ModerationFeedbackInputSerializer,
    ModerationFeedbackListQuerySerializer,
    ModerationReportDetailSerializer,
    OwnerModerationFeedbackSerializer,
    PlatformFeedbackSerializer,
    PlatformFeedbackStatusSerializer,
    ReportOutcomeSerializer,
    ReportQueueItemSerializer,
    ReportQueueQuerySerializer,
    ReportReceiptSerializer,
)
from .services import (
    create_listing_report,
    get_admin_report,
    mark_report_under_review,
    owner_feedback,
    record_moderation_feedback,
    release_listing_hold,
    report_queue,
    set_report_outcome,
    unpublish_reported_listing,
)

PAGE_SIZE = 20


def _paginate(request, queryset, page_value):
    count = queryset.count()
    last_page = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
    try:
        page = int(page_value)
    except (TypeError, ValueError) as error:
        raise InvalidListingPage(last_page=last_page) from error
    if page < 1 or page > last_page:
        raise InvalidListingPage(last_page=last_page)

    start = (page - 1) * PAGE_SIZE

    def page_url(page_number):
        query = request.query_params.copy()
        query["page"] = str(page_number)
        return f"{request.build_absolute_uri(request.path)}?{query.urlencode()}"

    return {
        "count": count,
        "next": page_url(page + 1) if start + PAGE_SIZE < count else None,
        "previous": page_url(page - 1) if page > 1 else None,
        "results": queryset[start : start + PAGE_SIZE],
    }


class CreateListingReportView(APIView):
    permission_classes = [IsAuthenticated, IsHomeSeeker]

    def post(self, request):
        serializer = CreateListingReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = create_listing_report(
            request.user,
            serializer.validated_data["listing_id"],
            serializer.validated_data["reason"],
        )
        return Response(
            ReportReceiptSerializer(report).data,
            status=status.HTTP_201_CREATED,
        )


class AdminModerationAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminModerator]


class AdminOverviewView(AdminModerationAPIView):
    def get(self, request):
        today = timezone.localdate()
        current_timezone = timezone.get_current_timezone()
        today_start = timezone.make_aware(datetime.combine(today, time.min), current_timezone)
        tomorrow_start = timezone.make_aware(
            datetime.combine(today + timedelta(days=1), time.min), current_timezone
        )

        period = request.query_params.get("range", "7d")
        if period == "today":
            period_start = today
            period_end = today
        elif period == "7d":
            period_start = today - timedelta(days=6)
            period_end = today
        elif period == "30d":
            period_start = today - timedelta(days=29)
            period_end = today
        elif period == "custom":
            period_start = parse_date(request.query_params.get("start_date", ""))
            period_end = parse_date(request.query_params.get("end_date", ""))
            if not period_start or not period_end or period_start > period_end:
                raise ValidationError({"date_range": ["Enter a valid start and end date."]})
        else:
            raise ValidationError({"range": ["Choose today, 7d, 30d, or custom."]})

        range_start = timezone.make_aware(
            datetime.combine(period_start, time.min), current_timezone
        )
        range_end = timezone.make_aware(
            datetime.combine(period_end + timedelta(days=1), time.min), current_timezone
        )

        submitted_by_date = {
            item["event_date"].isoformat(): item["total"]
            for item in ViewingRequest.objects.filter(
                created_at__gte=range_start, created_at__lt=range_end
            ).annotate(event_date=TruncDate("created_at"))
            .values("event_date").annotate(total=Count("pk"))
        }
        accepted_by_date = {
            item["event_date"].isoformat(): item["total"]
            for item in ViewingRequest.objects.filter(
                status=ViewingRequest.Status.ACCEPTED,
                updated_at__gte=range_start,
                updated_at__lt=range_end,
            ).annotate(event_date=TruncDate("updated_at"))
            .values("event_date").annotate(total=Count("pk"))
        }
        rejected_by_date = {
            item["event_date"].isoformat(): item["total"]
            for item in ViewingRequest.objects.filter(
                status=ViewingRequest.Status.REJECTED,
                updated_at__gte=range_start,
                updated_at__lt=range_end,
            ).annotate(event_date=TruncDate("updated_at"))
            .values("event_date").annotate(total=Count("pk"))
        }
        activity_days = []
        day = period_start
        while day <= period_end:
            day_key = day.isoformat()
            activity_days.append({
                "date": day_key,
                "submitted": submitted_by_date.get(day_key, 0),
                "accepted": accepted_by_date.get(day_key, 0),
                "rejected": rejected_by_date.get(day_key, 0),
            })
            day += timedelta(days=1)

        activity = []
        for report in ListingReport.objects.select_related(
            "listing", "reviewed_by"
        ).filter(reviewed_at__isnull=False).order_by("-reviewed_at")[:6]:
            activity.append({
                "id": f"report-review-{report.pk}",
                "type": "moderation",
                "title": "Admin moderation",
                "description": (
                    f"{report.reviewed_by.full_name} moved a listing report to "
                    f"{report.get_status_display()}"
                ),
                "created_at": report.reviewed_at,
                "icon": "shield",
                "to": "/moderation/reports",
            })
        for report in ListingReport.objects.select_related(
            "listing", "reporter"
        ).order_by("-created_at")[:6]:
            activity.append({
                "id": f"report-{report.pk}",
                "type": "report",
                "title": "New listing report",
                "description": report.listing.title or f"Listing {report.listing_id}",
                "created_at": report.created_at,
                "icon": "flag",
                "to": "/moderation/reports",
            })
        for feedback in PlatformFeedback.objects.select_related("author").order_by("-created_at")[:6]:
            activity.append({
                "id": f"feedback-{feedback.pk}",
                "type": "feedback",
                "title": "Feedback submitted",
                "description": "A member shared platform feedback",
                "created_at": feedback.created_at,
                "icon": "feedback",
                "to": "/moderation/feedback",
            })
        for viewing_request in ViewingRequest.objects.select_related(
            "listing", "seeker"
        ).order_by("-created_at")[:6]:
            activity.append({
                "id": f"viewing-{viewing_request.pk}",
                "type": "viewing",
                "title": "New viewing request",
                "description": viewing_request.listing.title or f"Listing {viewing_request.listing_id}",
                "created_at": viewing_request.created_at,
                "icon": "eye",
                "to": "/moderation/viewing-requests",
            })
        for listing in Listing.objects.select_related("owner").order_by("-created_at")[:6]:
            activity.append({
                "id": f"listing-{listing.pk}",
                "type": "listing",
                "title": "New property listing",
                "description": listing.title or f"Listing {listing.pk}",
                "created_at": listing.created_at,
                "icon": "home",
                "to": "/moderation/listings",
            })
        for user in User.objects.order_by("-date_joined")[:6]:
            roles = list(user.role_memberships.values_list("role", flat=True))
            role = "Property Owner" if RoleMembership.Role.PROPERTY_OWNER in roles else "Home Seeker"
            activity.append({
                "id": f"user-{user.pk}",
                "type": "user",
                "title": "New user registered",
                "description": f"A {role} joined BasaChai",
                "created_at": user.date_joined,
                "icon": "users",
                "to": "/moderation/users",
            })
        activity.sort(key=lambda item: item["created_at"], reverse=True)

        return Response({
            "generated_at": timezone.now(),
            "total_users": User.objects.count(),
            "new_users_today": User.objects.filter(
                date_joined__gte=today_start, date_joined__lt=tomorrow_start
            ).count(),
            "home_seekers": User.objects.filter(role_memberships__role=RoleMembership.Role.HOME_SEEKER).count(),
            "property_owners": User.objects.filter(role_memberships__role=RoleMembership.Role.PROPERTY_OWNER).count(),
            "other_roles": User.objects.filter(role_memberships__role=RoleMembership.Role.ADMIN_MODERATOR).count(),
            "total_listings": Listing.objects.exclude(lifecycle_status=Listing.LifecycleStatus.REMOVED).count(),
            "total_properties_all_statuses": Listing.objects.count(),
            "new_listings_today": Listing.objects.filter(
                created_at__gte=today_start, created_at__lt=tomorrow_start
            ).count(),
            "available_listings": Listing.objects.filter(
                lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
                availability_status=Listing.AvailabilityStatus.AVAILABLE,
            ).count(),
            "published_listings": Listing.objects.filter(lifecycle_status=Listing.LifecycleStatus.PUBLISHED).count(),
            "draft_listings": Listing.objects.filter(lifecycle_status=Listing.LifecycleStatus.DRAFT).count(),
            "unpublished_listings": Listing.objects.filter(lifecycle_status=Listing.LifecycleStatus.UNPUBLISHED).count(),
            "removed_listings": Listing.objects.filter(lifecycle_status=Listing.LifecycleStatus.REMOVED).count(),
            "listings_needing_reconfirmation": Listing.objects.filter(
                lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
                availability_status=Listing.AvailabilityStatus.NEEDS_RECONFIRMATION,
            ).count(),
            "pending_reports": ListingReport.objects.filter(status__in=(ListingReport.Status.SUBMITTED, ListingReport.Status.UNDER_REVIEW)).count(),
            "total_viewing_requests": ViewingRequest.objects.count(),
            "viewing_requests_today": ViewingRequest.objects.filter(
                created_at__gte=today_start, created_at__lt=tomorrow_start
            ).count(),
            "pending_viewing_requests": ViewingRequest.objects.filter(status=ViewingRequest.Status.PENDING).count(),
            "accepted_viewing_requests": ViewingRequest.objects.filter(status=ViewingRequest.Status.ACCEPTED).count(),
            "rejected_viewing_requests": ViewingRequest.objects.filter(status=ViewingRequest.Status.REJECTED).count(),
            "cancelled_viewing_requests": ViewingRequest.objects.filter(status=ViewingRequest.Status.CANCELLED).count(),
            "total_conversations": Conversation.objects.count(),
            "feedback_today": PlatformFeedback.objects.filter(
                created_at__gte=today_start, created_at__lt=tomorrow_start
            ).count(),
            "pending_feedback": PlatformFeedback.objects.filter(
                status=PlatformFeedback.Status.SUBMITTED
            ).count(),
            "viewing_activity": {
                "range": period,
                "start_date": period_start.isoformat(),
                "end_date": period_end.isoformat(),
                "days": activity_days,
                "requests": sum(day["submitted"] for day in activity_days),
                "accepted": sum(day["accepted"] for day in activity_days),
                "rejected": sum(day["rejected"] for day in activity_days),
                "pending": ViewingRequest.objects.filter(
                    status=ViewingRequest.Status.PENDING
                ).count(),
            },
            "recent_activity": activity[:6],
        })


class PlatformFeedbackPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class PlatformFeedbackView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformFeedbackMember]

    def get(self, request):
        feedback = PlatformFeedback.objects.filter(author=request.user).order_by("-created_at", "-pk")
        paginator = PlatformFeedbackPagination()
        page = paginator.paginate_queryset(feedback, request, view=self)
        return paginator.get_paginated_response(PlatformFeedbackSerializer(page, many=True).data)

    def post(self, request):
        serializer = CreatePlatformFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data.copy()
        values.pop("scope_acknowledged", None)
        feedback = PlatformFeedback.objects.create(author=request.user, **values)
        return Response(PlatformFeedbackSerializer(feedback).data, status=status.HTTP_201_CREATED)


class AdminPlatformFeedbackListView(AdminModerationAPIView):
    def get(self, request):
        queryset = PlatformFeedback.objects.select_related("author", "reviewed_by").all()
        selected_status = request.query_params.get("status")
        if selected_status:
            valid_statuses = {value for value, _label in PlatformFeedback.Status.choices}
            if selected_status not in valid_statuses:
                return Response(
                    {"status": ["Select a valid feedback status."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(status=selected_status)
        paginator = PlatformFeedbackPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(AdminPlatformFeedbackSerializer(page, many=True).data)


class AdminPlatformFeedbackDetailView(AdminModerationAPIView):
    def patch(self, request, feedback_id):
        feedback = get_object_or_404(
            PlatformFeedback.objects.select_related("author", "reviewed_by"),
            pk=feedback_id,
        )
        serializer = PlatformFeedbackStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feedback.status = serializer.validated_data["status"]
        if feedback.status == PlatformFeedback.Status.SUBMITTED:
            feedback.reviewed_by = None
            feedback.reviewed_at = None
        else:
            feedback.reviewed_by = request.user
            feedback.reviewed_at = timezone.now()
        feedback.save(update_fields=("status", "reviewed_by", "reviewed_at", "updated_at"))
        return Response(AdminPlatformFeedbackSerializer(feedback).data)


class ModerationReportQueueView(AdminModerationAPIView):
    def get(self, request):
        query = ReportQueueQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        filters = query.validated_data
        page = _paginate(
            request,
            report_queue(filters.get("status")),
            filters.get("page", "1"),
        )
        page["results"] = ReportQueueItemSerializer(page["results"], many=True).data
        return Response(page)


class ModerationReportDetailView(AdminModerationAPIView):
    def get(self, request, report_id):
        return Response(ModerationReportDetailSerializer(get_admin_report(report_id)).data)


class AdminModerationListingImageView(AdminModerationAPIView):
    def get(self, request, image_id):
        try:
            image = ListingImage.objects.get(pk=image_id)
        except ListingImage.DoesNotExist as error:
            raise Http404 from error
        return image_file_response(image)


class MarkReportReviewedView(AdminModerationAPIView):
    def post(self, request, report_id):
        report = mark_report_under_review(request.user, report_id)
        return Response(
            ModerationReportDetailSerializer(get_admin_report(report.pk)).data
        )


class SetReportOutcomeView(AdminModerationAPIView):
    def post(self, request, report_id):
        serializer = ReportOutcomeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = set_report_outcome(
            request.user,
            report_id,
            serializer.validated_data["status"],
        )
        return Response(
            ModerationReportDetailSerializer(get_admin_report(report.pk)).data
        )


class GiveModerationFeedbackView(AdminModerationAPIView):
    def post(self, request, report_id):
        serializer = ModerationFeedbackInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feedback = record_moderation_feedback(
            request.user,
            report_id,
            serializer.validated_data["reason"],
        )
        feedback = feedback.__class__.objects.select_related(
            "report__listing"
        ).get(pk=feedback.pk)
        return Response(
            CreatedModerationFeedbackSerializer(feedback).data,
            status=status.HTTP_201_CREATED,
        )


class UnpublishReportedListingView(AdminModerationAPIView):
    def post(self, request, report_id):
        report, _hold = unpublish_reported_listing(request.user, report_id)
        return Response(
            ModerationReportDetailSerializer(get_admin_report(report.pk)).data
        )


class ReleaseModerationHoldView(AdminModerationAPIView):
    def post(self, request, listing_id):
        listing = release_listing_hold(request.user, listing_id)
        listing = listing.__class__.objects.prefetch_related("images").get(pk=listing.pk)
        return Response(OwnerListingSerializer(listing).data)


class OwnerModerationFeedbackView(APIView):
    permission_classes = [IsAuthenticated, IsPropertyOwner]

    def get(self, request):
        query = ModerationFeedbackListQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        filters = query.validated_data
        page = _paginate(
            request,
            owner_feedback(request.user, filters.get("listing_id")),
            filters.get("page", "1"),
        )
        page["results"] = OwnerModerationFeedbackSerializer(
            page["results"], many=True
        ).data
        return Response(page)
