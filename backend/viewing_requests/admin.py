from django.contrib import admin

from .models import ViewingRequest


@admin.register(ViewingRequest)
class ViewingRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_title", "seeker_name", "preferred_at", "status", "created_at")
    list_filter = ("status", "created_at", "preferred_at")
    search_fields = ("listing__title", "listing__location", "seeker__full_name")
    ordering = ("-created_at",)
    list_select_related = ("listing", "seeker")
    readonly_fields = ("listing_title", "seeker_name", "created_at", "updated_at")
    fields = ("listing_title", "seeker_name", "preferred_at", "status", "created_at", "updated_at")
    actions = None

    @admin.display(description="Listing", ordering="listing__title")
    def listing_title(self, request):
        return request.listing.title or f"Listing {request.listing_id}"

    @admin.display(description="Home Seeker", ordering="seeker__full_name")
    def seeker_name(self, request):
        return request.seeker.full_name

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
