from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.urls import reverse
from rest_framework import serializers

from accounts.serializers import (
    PublicHomeSeekerProfileSerializer,
    PublicOwnerProfileSerializer,
    StrictSerializer,
)
from listings.models import Listing
from listings.services import availability_reminder

from .models import Conversation, Message, MessageAttachment
from .validators import validate_message_attachment


class StartConversationSerializer(StrictSerializer):
    listing_id = serializers.IntegerField(min_value=1)


class SendMessageSerializer(StrictSerializer):
    body = serializers.CharField(
        max_length=2000,
        trim_whitespace=False,
        allow_blank=True,
        required=False,
    )
    attachments = serializers.ListField(
        child=serializers.FileField(allow_empty_file=False),
        required=False,
        allow_empty=False,
        max_length=settings.MESSAGE_ATTACHMENT_MAX_FILES,
    )

    def validate_body(self, value):
        return value

    def validate_attachments(self, files):
        validated = []
        for upload in files:
            try:
                validate_message_attachment(upload)
            except DjangoValidationError as error:
                raise serializers.ValidationError(error.messages) from error
            validated.append(upload)
        return validated

    def validate(self, attrs):
        if not attrs.get("body", "").strip() and not attrs.get("attachments"):
            raise serializers.ValidationError("A message must include text or at least one attachment.")
        return attrs


class MessageAttachmentSerializer(serializers.ModelSerializer):
    filename = serializers.CharField(source="original_name", read_only=True)
    is_image = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = ("id", "filename", "content_type", "size", "is_image", "download_url")
        read_only_fields = fields

    def get_is_image(self, attachment):
        return attachment.content_type.startswith("image/")

    def get_download_url(self, attachment):
        return reverse(
            "message-attachment-download",
            kwargs={
                "conversation_id": attachment.message.conversation_id,
                "attachment_id": attachment.pk,
            },
        )


class ConversationListingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Listing
        fields = ("id", "title", "lifecycle_status")
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    attachments = MessageAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ("id", "sender", "body", "created_at", "attachments")
        read_only_fields = fields

    def get_sender(self, message):
        seeker_id = self.context.get("conversation_seeker_id")
        if seeker_id is None:
            seeker_id = message.conversation.seeker_id
        profile_serializer = (
            PublicHomeSeekerProfileSerializer
            if message.sender_id == seeker_id
            else PublicOwnerProfileSerializer
        )
        return profile_serializer(message.sender).data


class ConversationSerializer(serializers.ModelSerializer):
    listing = ConversationListingSerializer(read_only=True)
    seeker = serializers.SerializerMethodField()
    owner = serializers.SerializerMethodField()
    can_send_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            "id",
            "listing",
            "seeker",
            "owner",
            "can_send_message",
            "created_at",
        )
        read_only_fields = fields

    def get_owner(self, conversation):
        return PublicOwnerProfileSerializer(conversation.listing.owner).data

    def get_seeker(self, conversation):
        return PublicHomeSeekerProfileSerializer(conversation.seeker).data

    def get_can_send_message(self, conversation):
        return conversation.listing.lifecycle_status not in (
            Listing.LifecycleStatus.UNPUBLISHED,
            Listing.LifecycleStatus.REMOVED,
        )


class ConversationListSerializer(ConversationSerializer):
    last_message = serializers.SerializerMethodField()

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ("last_message",)
        read_only_fields = fields

    def get_last_message(self, conversation):
        messages = getattr(conversation, "latest_messages", ())
        if not messages:
            return None
        return MessageSerializer(
            messages[0],
            context={"conversation_seeker_id": conversation.seeker_id},
        ).data
