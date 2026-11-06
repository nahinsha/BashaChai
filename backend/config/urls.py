
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("listings.urls")),
    path("api/v1/", include("shortlist.urls")),
    path("api/v1/", include("messaging.urls")),
    path("api/v1/", include("viewing_requests.urls")),
    path("api/v1/", include("moderation.urls")),
]
