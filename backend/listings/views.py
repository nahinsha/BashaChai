from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .exceptions import InvalidListingPage
from .models import Listing, ListingImage
from .permissions import IsPropertyOwner
from .serializers import (
    AvailabilityActionSerializer,
    ListingImageUploadSerializer,
    ListingInputSerializer,
    OwnerListingImageSerializer,
    OwnerListingSerializer,
    PublicListingCardSerializer,
    PublicListingDetailSerializer,
    PublicListingSearchParamsSerializer,
)
from .services import (
    add_listing_image,
    confirm_listing_availability,
    create_listing,
    publish_listing,
    remove_listing,
    remove_listing_image,
    replace_listing_image,
    search_public_listings,
    unpublish_listing,
    update_listing,
)
from moderation.permissions import IsAdminModerator

PAGE_SIZE = 20
PAGE_SIZE_PUBLIC = 10
LIFECYCLE_STATUSES = tuple(Listing.LifecycleStatus.values)


class OwnerAPIView(APIView):
    permission_classes = [IsAuthenticated, IsPropertyOwner]


class AdminListingQueueView(APIView):
    permission_classes = [IsAuthenticated, IsAdminModerator]

    def get(self, request):
        from rest_framework.exceptions import ValidationError

        unexpected = set(request.query_params) - {"page", "status"}
        if unexpected:
            raise ValidationError({key: ["Unexpected query parameter."] for key in sorted(unexpected)})
        listings = Listing.objects.select_related("owner").order_by("-created_at", "-pk")
        status_filter = request.query_params.get("status")
        if status_filter:
            if status_filter not in Listing.LifecycleStatus.values:
                raise ValidationError({"status": ["Select a valid listing status."]})
            listings = listings.filter(lifecycle_status=status_filter)
        try:
            page = int(request.query_params.get("page", "1"))
        except (TypeError, ValueError) as error:
            raise ValidationError({"page": ["Enter a valid page number."]}) from error
        count = listings.count()
        last_page = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
        if page < 1 or page > last_page:
            raise ValidationError({"page": [f"Page must be between 1 and {last_page}."]})
        start = (page - 1) * PAGE_SIZE
        result = listings[start:start + PAGE_SIZE]
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": [{
                "id": item.pk, "title": item.title, "location": item.location,
                "property_type": item.property_type, "monthly_rent": item.monthly_rent,
                "lifecycle_status": item.lifecycle_status,
                "availability_status": item.availability_status,
                "owner": {"id": item.owner_id, "full_name": item.owner.full_name},
                "created_at": item.created_at,
            } for item in result],
        })


class PublicListingSearchView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        params = PublicListingSearchParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        filters = params.validated_data
        page_value = filters.pop("page", "1")

        now = timezone.now()
        listings = search_public_listings(filters, now=now)
        count = listings.count()
        last_page = max(1, (count + PAGE_SIZE_PUBLIC - 1) // PAGE_SIZE_PUBLIC)
        try:
            page = int(page_value)
        except (TypeError, ValueError) as error:
            raise InvalidListingPage(last_page=last_page) from error
        if page < 1 or page > last_page:
            raise InvalidListingPage(last_page=last_page)

        start = (page - 1) * PAGE_SIZE_PUBLIC
        results = listings[start : start + PAGE_SIZE_PUBLIC]

        def page_url(page_number):
            query = request.query_params.copy()
            query["page"] = str(page_number)
            return f"{request.build_absolute_uri(request.path)}?{query.urlencode()}"

        return Response(
            {
                "count": count,
                "next": page_url(page + 1)
                if start + PAGE_SIZE_PUBLIC < count
                else None,
                "previous": page_url(page - 1) if page > 1 else None,
                "results": PublicListingCardSerializer(
                    results, many=True, context={"now": now}
                ).data,
            }
        )


class PublicListingDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, listing_id):
        try:
            listing = (
                Listing.objects.filter(
                    lifecycle_status=Listing.LifecycleStatus.PUBLISHED
                )
                .select_related("owner")
                .prefetch_related("images")
                .get(pk=listing_id)
            )
        except Listing.DoesNotExist as error:
            raise Http404 from error

        return Response(
            PublicListingDetailSerializer(
                listing,
                context={"now": timezone.now()},
            ).data
        )


class PublicListingImageView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, image_id):
        try:
            image = ListingImage.objects.get(
                pk=image_id,
                listing__lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
            )
        except ListingImage.DoesNotExist as error:
            raise Http404 from error

        return image_file_response(image)


class OwnerListingImageContentView(OwnerAPIView):
    def get(self, request, image_id):
        try:
            image = ListingImage.objects.get(
                pk=image_id,
                listing__owner=request.user,
            )
        except ListingImage.DoesNotExist as error:
            raise Http404 from error
        return image_file_response(image)


def image_file_response(image):
    try:
        image_file = default_storage.open(image.storage_key, "rb")
    except (FileNotFoundError, OSError) as error:
        raise Http404 from error

    content_types = {
        ListingImage.ImageFormat.JPG: "image/jpeg",
        ListingImage.ImageFormat.JPEG: "image/jpeg",
        ListingImage.ImageFormat.PNG: "image/png",
        ListingImage.ImageFormat.WEBP: "image/webp",
    }
    response = FileResponse(image_file, content_type=content_types[image.image_format])
    response["X-Content-Type-Options"] = "nosniff"
    return response


def get_owned_listing(owner, listing_id):
    try:
        return Listing.objects.prefetch_related("images").get(
            pk=listing_id,
            owner=owner,
        )
    except Listing.DoesNotExist as error:
        raise Http404 from error


class OwnerListingListCreateView(OwnerAPIView):
    def get(self, request):
        unexpected = set(request.query_params.keys()) - {"lifecycle_status", "page"}
        if unexpected:
            raise ValidationError(
                {key: ["Unexpected query parameter."] for key in sorted(unexpected)}
            )

        lifecycle_status = request.query_params.get("lifecycle_status")
        if lifecycle_status and lifecycle_status not in LIFECYCLE_STATUSES:
            raise ValidationError(
                {"lifecycle_status": ["Select a valid lifecycle status."]}
            )

        page_value = request.query_params.get("page", "1")
        try:
            page = int(page_value)
        except (TypeError, ValueError) as error:
            raise InvalidListingPage() from error
        if page < 1:
            raise InvalidListingPage()

        listings = Listing.objects.filter(owner=request.user).order_by("-created_at", "-pk")
        if lifecycle_status:
            listings = listings.filter(lifecycle_status=lifecycle_status)
        count = listings.count()
        last_page = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
        if page > last_page:
            raise InvalidListingPage()
        start = (page - 1) * PAGE_SIZE
        results = listings.prefetch_related("images")[start : start + PAGE_SIZE]

        def page_url(page_number):
            query = request.query_params.copy()
            query["page"] = str(page_number)
            return f"{request.build_absolute_uri(request.path)}?{query.urlencode()}"

        return Response(
            {
                "count": count,
                "next": page_url(page + 1) if start + PAGE_SIZE < count else None,
                "previous": page_url(page - 1) if page > 1 and start < count else None,
                "results": OwnerListingSerializer(
                    results,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )

    def post(self, request):
        serializer = ListingInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        listing = create_listing(request.user, serializer.validated_data)
        return Response(
            OwnerListingSerializer(listing, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class OwnerListingDetailView(OwnerAPIView):
    def get(self, request, listing_id):
        listing = get_owned_listing(request.user, listing_id)
        return Response(OwnerListingSerializer(listing, context={"request": request}).data)

    def patch(self, request, listing_id):
        serializer = ListingInputSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        listing = update_listing(
            request.user,
            listing_id,
            serializer.validated_data,
        )
        listing = get_owned_listing(request.user, listing.pk)
        return Response(OwnerListingSerializer(listing, context={"request": request}).data)


class PublishListingView(OwnerAPIView):
    def post(self, request, listing_id):
        listing = publish_listing(request.user, listing_id, now=timezone.now())
        listing = get_owned_listing(request.user, listing.pk)
        return Response(OwnerListingSerializer(listing, context={"request": request}).data)


class UnpublishListingView(OwnerAPIView):
    def post(self, request, listing_id):
        listing = unpublish_listing(request.user, listing_id)
        listing = get_owned_listing(request.user, listing.pk)
        return Response(OwnerListingSerializer(listing, context={"request": request}).data)


class RemoveListingView(OwnerAPIView):
    def post(self, request, listing_id):
        listing = remove_listing(request.user, listing_id)
        listing = get_owned_listing(request.user, listing.pk)
        return Response(OwnerListingSerializer(listing, context={"request": request}).data)


class ConfirmListingAvailabilityView(OwnerAPIView):
    def post(self, request, listing_id):
        serializer = AvailabilityActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        listing = confirm_listing_availability(
            request.user,
            listing_id,
            serializer.validated_data["action"],
            now=timezone.now(),
        )
        listing = get_owned_listing(request.user, listing.pk)
        return Response(OwnerListingSerializer(listing, context={"request": request}).data)


class ListingImageUploadView(OwnerAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, listing_id):
        serializer = ListingImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = add_listing_image(
            request.user,
            listing_id,
            serializer.validated_data["image"],
        )
        return Response(
            OwnerListingImageSerializer(image, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ListingImageDetailView(OwnerAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def put(self, request, listing_id, image_id):
        serializer = ListingImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = replace_listing_image(
            request.user,
            listing_id,
            image_id,
            serializer.validated_data["image"],
        )
        return Response(
            OwnerListingImageSerializer(image, context={"request": request}).data
        )

    def delete(self, request, listing_id, image_id):
        remove_listing_image(request.user, listing_id, image_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
