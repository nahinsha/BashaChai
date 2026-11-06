from django.urls import path

from .views import (
    ConversationDetailView,
    ConversationListCreateView,
    MessageAttachmentDownloadView,
    SendMessageView,
)

urlpatterns = [
    path("conversations/", ConversationListCreateView.as_view(), name="conversation-list-create"),
    path(
        "conversations/<int:conversation_id>/",
        ConversationDetailView.as_view(),
        name="conversation-detail",
    ),
    path(
        "conversations/<int:conversation_id>/messages/",
        SendMessageView.as_view(),
        name="conversation-messages",
    ),
    path(
        "conversations/<int:conversation_id>/attachments/<int:attachment_id>/",
        MessageAttachmentDownloadView.as_view(),
        name="message-attachment-download",
    ),
]
