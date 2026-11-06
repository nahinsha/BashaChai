from django.contrib import admin

from .models import Listing, ListingImage


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "owner_name",
        "location",
        "property_type",
        "monthly_rent",
        "lifecycle_status",
        "availability_status",
        "created_at",
    )
    list_filter = ("lifecycle_status", "availability_status", "property_type")
    search_fields = ("title", "location", "property_type", "owner__full_name")
    ordering = ("-created_at",)
    list_select_related = ("owner",)
    readonly_fields = ("owner_name", "created_at", "updated_at")
    fields = (
        "owner_name",
        "title",
        "location",
        "property_type",
        "monthly_rent",
        "bedrooms",
        "bathrooms",
        "description",
        "amenities",
        "lifecycle_status",
        "availability_status",
        "availability_confirmed_at",
        "created_at",
        "updated_at",
    )
    actions = None

    @admin.display(description="Owner", ordering="owner__full_name")
    def owner_name(self, listing):
        return listing.owner.full_name

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ListingImage)
class ListingImageAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_title", "slot", "image_format", "file_size_bytes", "created_at")
    list_filter = ("image_format", "created_at")
    search_fields = ("listing__title", "listing__location")
    ordering = ("listing_id", "slot")
    list_select_related = ("listing",)
    fields = ("listing_title", "slot", "image_format", "file_size_bytes", "created_at")
    readonly_fields = fields
    actions = None

    @admin.display(description="Listing", ordering="listing__title")
    def listing_title(self, image):
        return image.listing.title or f"Listing {image.listing_id}"

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
