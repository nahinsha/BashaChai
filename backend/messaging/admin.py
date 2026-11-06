from django.contrib import admin

from .models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_title", "seeker_name", "created_at")
    list_filter = ("created_at",)
    search_fields = ("listing__title", "seeker__full_name")
    ordering = ("-created_at",)
    list_select_related = ("listing", "seeker")
    fields = ("listing_title", "seeker_name", "created_at")
    readonly_fields = fields
    actions = None

    @admin.display(description="Listing", ordering="listing__title")
    def listing_title(self, conversation):
        return conversation.listing.title or f"Listing {conversation.listing_id}"

    @admin.display(description="Home Seeker", ordering="seeker__full_name")
    def seeker_name(self, conversation):
        return conversation.seeker.full_name

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_title", "sender_name", "created_at")
    list_filter = ("created_at",)
    search_fields = ("conversation__listing__title", "sender__full_name")
    ordering = ("-created_at",)
    list_select_related = ("conversation__listing", "sender")
    fields = ("conversation_id", "listing_title", "sender_name", "created_at")
    readonly_fields = fields
    actions = None

    @admin.display(description="Conversation", ordering="conversation_id")
    def conversation_id(self, message):
        return message.conversation_id

    @admin.display(description="Listing", ordering="conversation__listing__title")
    def listing_title(self, message):
        listing = message.conversation.listing
        return listing.title or f"Listing {listing.pk}"

    @admin.display(description="Sender", ordering="sender__full_name")
    def sender_name(self, message):
        return message.sender.full_name

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
