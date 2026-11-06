from django.urls import path

from .views import (
    AdminViewingRequestsView,
    AcceptViewingRequestView,
    CancelViewingRequestView,
    RejectViewingRequestView,
    ViewingRequestListView,
)

urlpatterns = [
    path("admin/viewing-requests/", AdminViewingRequestsView.as_view(), name="admin-viewing-requests"),
    path("viewing-requests/", ViewingRequestListView.as_view(), name="viewing-requests"),
    path(
        "viewing-requests/<int:request_id>/accept/",
        AcceptViewingRequestView.as_view(),
        name="viewing-request-accept",
    ),
    path(
        "viewing-requests/<int:request_id>/reject/",
        RejectViewingRequestView.as_view(),
        name="viewing-request-reject",
    ),
    path(
        "viewing-requests/<int:request_id>/cancel/",
        CancelViewingRequestView.as_view(),
        name="viewing-request-cancel",
    ),
]
