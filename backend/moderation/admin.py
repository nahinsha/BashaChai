from django.contrib import admin

from .models import ListingReport, ModerationFeedback, ModerationHold


@admin.register(ListingReport)
class ListingReportAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_title", "reporter_name", "status", "reviewer_name", "created_at")
    list_filter = ("status", "created_at", "reviewed_at")
    search_fields = ("listing__title", "listing__location", "reporter__full_name")
    ordering = ("-created_at",)
    list_select_related = ("listing", "reporter", "reviewed_by")
    readonly_fields = ("listing_title", "reporter_name", "reason", "reviewer_name", "reviewed_at", "created_at")
    fields = readonly_fields + ("status",)
    actions = None

    @admin.display(description="Listing", ordering="listing__title")
    def listing_title(self, report):
        return report.listing.title or f"Listing {report.listing_id}"

    @admin.display(description="Reporter", ordering="reporter__full_name")
    def reporter_name(self, report):
        return report.reporter.full_name

    @admin.display(description="Reviewer", ordering="reviewed_by__full_name")
    def reviewer_name(self, report):
        return report.reviewed_by.full_name if report.reviewed_by_id else "—"

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ModerationFeedback)
class ModerationFeedbackAdmin(admin.ModelAdmin):
    list_display = ("id", "report_id", "author_name", "created_at")
    list_filter = ("created_at",)
    search_fields = ("report__listing__title", "author__full_name")
    ordering = ("-created_at",)
    list_select_related = ("report__listing", "author")
    fields = ("report_id", "author_name", "reason", "created_at")
    readonly_fields = fields
    actions = None

    @admin.display(description="Report", ordering="report_id")
    def report_id(self, feedback):
        return feedback.report_id

    @admin.display(description="Author", ordering="author__full_name")
    def author_name(self, feedback):
        return feedback.author.full_name

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ModerationHold)
class ModerationHoldAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_title", "report_id", "placed_by_name", "placed_at", "released_at")
    list_filter = ("placed_at", "released_at")
    search_fields = ("listing__title", "report__id", "placed_by__full_name")
    ordering = ("-placed_at",)
    list_select_related = ("listing", "report", "placed_by", "released_by")
    fields = ("listing_title", "report_id", "placed_by_name", "placed_at", "released_by_name", "released_at")
    readonly_fields = fields
    actions = None

    @admin.display(description="Listing", ordering="listing__title")
    def listing_title(self, hold):
        return hold.listing.title or f"Listing {hold.listing_id}"

    @admin.display(description="Report", ordering="report_id")
    def report_id(self, hold):
        return hold.report_id

    @admin.display(description="Placed by", ordering="placed_by__full_name")
    def placed_by_name(self, hold):
        return hold.placed_by.full_name

    @admin.display(description="Released by", ordering="released_by__full_name")
    def released_by_name(self, hold):
        return hold.released_by.full_name if hold.released_by_id else "—"

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
