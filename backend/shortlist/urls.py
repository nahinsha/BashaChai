from django.urls import path

from .views import ShortlistCompareView, ShortlistItemDeleteView, ShortlistListCreateView

urlpatterns = [
    path("shortlist/", ShortlistListCreateView.as_view(), name="shortlist-list-create"),
    path("shortlist/compare/", ShortlistCompareView.as_view(), name="shortlist-compare"),
    path(
        "shortlist/<int:listing_id>/",
        ShortlistItemDeleteView.as_view(),
        name="shortlist-item-delete",
    ),
]
