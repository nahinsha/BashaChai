from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from listings.exceptions import InvalidListingPage

from .models import ShortlistItem
from .permissions import IsHomeSeeker
from .serializers import (
    AddShortlistItemSerializer,
    CompareShortlistSerializer,
    ShortlistItemSerializer,
)
from .services import remove_saved_listing, save_listing

PAGE_SIZE = 20


class HomeSeekerAPIView(APIView):
    permission_classes = [IsAuthenticated, IsHomeSeeker]


class ShortlistListCreateView(HomeSeekerAPIView):
    def get(self, request):
        unexpected = set(request.query_params.keys()) - {"page"}
        if unexpected:
            raise ValidationError(
                {key: ["Unexpected query parameter."] for key in sorted(unexpected)}
            )

        page_value = request.query_params.get("page", "1")
        items = ShortlistItem.objects.filter(seeker=request.user).select_related(
            "listing"
        ).prefetch_related("listing__images").order_by("id")
        count = items.count()
        last_page = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
        try:
            page = int(page_value)
        except (TypeError, ValueError) as error:
            raise InvalidListingPage(last_page=last_page) from error
        if page < 1 or page > last_page:
            raise InvalidListingPage(last_page=last_page)

        start = (page - 1) * PAGE_SIZE
        results = items[start : start + PAGE_SIZE]

        def page_url(page_number):
            query = request.query_params.copy()
            query["page"] = str(page_number)
            return f"{request.build_absolute_uri(request.path)}?{query.urlencode()}"

        return Response(
            {
                "count": count,
                "next": page_url(page + 1) if start + PAGE_SIZE < count else None,
                "previous": page_url(page - 1) if page > 1 else None,
                "results": ShortlistItemSerializer(
                    results,
                    many=True,
                    context={"now": timezone.now()},
                ).data,
            }
        )

    def post(self, request):
        serializer = AddShortlistItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = save_listing(request.user, serializer.validated_data["listing_id"])
        item = ShortlistItem.objects.select_related("listing").get(pk=item.pk)
        return Response(
            ShortlistItemSerializer(item, context={"now": timezone.now()}).data,
            status=status.HTTP_201_CREATED,
        )


class ShortlistItemDeleteView(HomeSeekerAPIView):
    def delete(self, request, listing_id):
        remove_saved_listing(request.user, listing_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShortlistCompareView(HomeSeekerAPIView):
    def get(self, request):
        unexpected = set(request.query_params.keys()) - {"listing_ids"}
        if unexpected:
            raise ValidationError(
                {key: ["Unexpected query parameter."] for key in sorted(unexpected)}
            )

        serializer = CompareShortlistSerializer(
            data={"listing_ids": request.query_params.getlist("listing_ids")}
        )
        serializer.is_valid(raise_exception=True)
        listing_ids = serializer.validated_data["listing_ids"]

        items = list(
            ShortlistItem.objects.filter(
                seeker=request.user,
                listing_id__in=listing_ids,
            ).select_related("listing").prefetch_related("listing__images")
        )
        items_by_listing_id = {item.listing_id: item for item in items}
        if len(items_by_listing_id) != len(listing_ids):
            raise ValidationError(
                {"listing_ids": ["Every home must be in your saved list."]}
            )

        ordered_items = [items_by_listing_id[listing_id] for listing_id in listing_ids]
        return Response(
            {
                "results": ShortlistItemSerializer(
                    ordered_items,
                    many=True,
                    context={"now": timezone.now()},
                ).data
            }
        )
