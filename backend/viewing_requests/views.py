from datetime import datetime, time, timedelta

from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from listings.exceptions import InvalidListingPage

from .models import ViewingRequest
from .permissions import HasViewingRequestRole, IsHomeSeeker, IsPropertyOwner
from .serializers import (
    AdminViewingRequestQuerySerializer,
    CreateViewingRequestSerializer,
    ViewingRequestQuerySerializer,
    ViewingRequestSerializer,
)
from .services import (
    cancel_viewing_request,
    create_viewing_request,
    respond_to_viewing_request,
    visible_viewing_requests,
)
from moderation.permissions import IsAdminModerator

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


class ViewingRequestListView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsHomeSeeker()]
        return [IsAuthenticated(), HasViewingRequestRole()]

    def get(self, request):
        query = ViewingRequestQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        filters = query.validated_data

        requests = visible_viewing_requests(request.user)
        if "status" in filters:
            requests = requests.filter(status=filters["status"])

        page = _paginate(request, requests, filters.get("page", "1"))
        page["results"] = ViewingRequestSerializer(page["results"], many=True).data
        return Response(page)

    def post(self, request):
        serializer = CreateViewingRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        viewing_request = create_viewing_request(
            request.user,
            serializer.validated_data["listing_id"],
            serializer.validated_data["preferred_at"],
        )
        viewing_request = ViewingRequest.objects.select_related(
            "listing", "listing__owner", "seeker"
        ).get(pk=viewing_request.pk)
        return Response(
            ViewingRequestSerializer(viewing_request).data,
            status=status.HTTP_201_CREATED,
        )


class AdminViewingRequestsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminModerator]

    def get(self, request):
        query = AdminViewingRequestQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        filters = query.validated_data
        selected_date = filters.get("date") or timezone.localdate()
        requests = ViewingRequest.objects.select_related(
            "listing", "listing__owner", "seeker"
        ).order_by("-created_at", "-pk")
        if filters.get("status"):
            requests = requests.filter(status=filters["status"])
        page_value = filters.get("page", "1")
        try:
            page = int(page_value)
        except (TypeError, ValueError) as error:
            raise InvalidListingPage() from error
        count = requests.count()
        last_page = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
        if page < 1 or page > last_page:
            raise InvalidListingPage(last_page=last_page)
        start = (page - 1) * PAGE_SIZE

        current_timezone = timezone.get_current_timezone()
        selected_start = timezone.make_aware(
            datetime.combine(selected_date, time.min), current_timezone
        )
        selected_end = timezone.make_aware(
            datetime.combine(selected_date + timedelta(days=1), time.min),
            current_timezone,
        )
        week_start = timezone.make_aware(
            datetime.combine(selected_date - timedelta(days=6), time.min),
            current_timezone,
        )
        daily_totals = {
            item["request_date"].isoformat(): item["total"]
            for item in ViewingRequest.objects.filter(
                created_at__gte=week_start, created_at__lt=selected_end
            )
            .annotate(request_date=TruncDate("created_at"))
            .values("request_date")
            .annotate(total=Count("pk"))
        }
        last_7_days = [
            {
                "date": (selected_date - timedelta(days=offset)).isoformat(),
                "count": daily_totals.get(
                    (selected_date - timedelta(days=offset)).isoformat(), 0
                ),
            }
            for offset in range(6, -1, -1)
        ]
        stats = ViewingRequest.objects.aggregate(
            requests_on_date=Count(
                "pk",
                filter=Q(created_at__gte=selected_start, created_at__lt=selected_end),
            ),
            accepted_on_date=Count(
                "pk",
                filter=Q(
                    status=ViewingRequest.Status.ACCEPTED,
                    updated_at__gte=selected_start,
                    updated_at__lt=selected_end,
                ),
            ),
            rejected_on_date=Count(
                "pk",
                filter=Q(
                    status=ViewingRequest.Status.REJECTED,
                    updated_at__gte=selected_start,
                    updated_at__lt=selected_end,
                ),
            ),
        )
        stats["currently_pending"] = ViewingRequest.objects.filter(
            status=ViewingRequest.Status.PENDING
        ).count()
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "statistics": {
                "date": selected_date.isoformat(),
                "today_requests": stats["requests_on_date"],
                "accepted_today": stats["accepted_on_date"],
                "rejected_today": stats["rejected_on_date"],
                "currently_pending": stats["currently_pending"],
                "last_7_days": last_7_days,
            },
            "results": [{
                "id": item.pk, "listing": {"id": item.listing_id, "title": item.listing.title},
                "seeker": {"id": item.seeker_id, "full_name": item.seeker.full_name},
                "owner": {"id": item.listing.owner_id, "full_name": item.listing.owner.full_name},
                "preferred_at": item.preferred_at, "status": item.status,
                "created_at": item.created_at,
            } for item in requests[start:start + PAGE_SIZE]],
        })


class OwnerViewingRequestActionView(APIView):
    permission_classes = [IsAuthenticated, IsPropertyOwner]
    response_status = None

    def post(self, request, request_id):
        viewing_request = respond_to_viewing_request(
            request.user,
            request_id,
            self.response_status,
        )
        return Response(ViewingRequestSerializer(viewing_request).data)


class AcceptViewingRequestView(OwnerViewingRequestActionView):
    response_status = ViewingRequest.Status.ACCEPTED


class RejectViewingRequestView(OwnerViewingRequestActionView):
    response_status = ViewingRequest.Status.REJECTED


class CancelViewingRequestView(APIView):
    permission_classes = [IsAuthenticated, IsHomeSeeker]

    def post(self, request, request_id):
        viewing_request = cancel_viewing_request(request.user, request_id)
        return Response(ViewingRequestSerializer(viewing_request).data)
