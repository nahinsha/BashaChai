from django.urls import path

from .views import (
    AdminListingQueueView,
    ConfirmListingAvailabilityView,
    ListingImageDetailView,
    ListingImageUploadView,
    OwnerListingImageContentView,
    OwnerListingDetailView,
    OwnerListingListCreateView,
    PublishListingView,
    PublicListingDetailView,
    PublicListingImageView,
    PublicListingSearchView,
    RemoveListingView,
    UnpublishListingView,
)

urlpatterns = [
    path("admin/listings/", AdminListingQueueView.as_view(), name="admin-listings"),
    path("listings/", PublicListingSearchView.as_view(), name="public-listings"),
    path(
        "listings/images/<int:image_id>/",
        PublicListingImageView.as_view(),
        name="public-listing-image",
    ),
    path(
        "owner/listing-images/<int:image_id>/content/",
        OwnerListingImageContentView.as_view(),
        name="owner-listing-image-content",
    ),
    path(
        "listings/<int:listing_id>/",
        PublicListingDetailView.as_view(),
        name="public-listing-detail",
    ),
    path("owner/listings/", OwnerListingListCreateView.as_view(), name="owner-listings"),
    path(
        "owner/listings/<int:listing_id>/",
        OwnerListingDetailView.as_view(),
        name="owner-listing-detail",
    ),
    path(
        "owner/listings/<int:listing_id>/publish/",
        PublishListingView.as_view(),
        name="owner-listing-publish",
    ),
    path(
        "owner/listings/<int:listing_id>/unpublish/",
        UnpublishListingView.as_view(),
        name="owner-listing-unpublish",
    ),
    path(
        "owner/listings/<int:listing_id>/remove/",
        RemoveListingView.as_view(),
        name="owner-listing-remove",
    ),
    path(
        "owner/listings/<int:listing_id>/availability/",
        ConfirmListingAvailabilityView.as_view(),
        name="owner-listing-availability",
    ),
    path(
        "owner/listings/<int:listing_id>/images/",
        ListingImageUploadView.as_view(),
        name="owner-listing-images",
    ),
    path(
        "owner/listings/<int:listing_id>/images/<int:image_id>/",
        ListingImageDetailView.as_view(),
        name="owner-listing-image-detail",
    ),
]
