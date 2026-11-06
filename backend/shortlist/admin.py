from django.contrib import admin

from .models import ShortlistItem


@admin.register(ShortlistItem)
class ShortlistItemAdmin(admin.ModelAdmin):
    list_display = ("id", "seeker_name", "listing_title", "created_at")
    list_filter = ("created_at",)
    search_fields = ("seeker__full_name", "listing__title", "listing__location")
    ordering = ("-created_at",)
    list_select_related = ("seeker", "listing")
    fields = ("seeker_name", "listing_title", "created_at")
    readonly_fields = fields
    actions = None

    @admin.display(description="Home Seeker", ordering="seeker__full_name")
    def seeker_name(self, item):
        return item.seeker.full_name

    @admin.display(description="Listing", ordering="listing__title")
    def listing_title(self, item):
        return item.listing.title or f"Listing {item.listing_id}"

    def has_add_permission(self, request):
        return False
