import uuid
from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.db.models import Q, Value
from django.db.models.deletion import ProtectedError
from django.db.models.functions import Length, Now
from django.db.models.lookups import GreaterThanOrEqual, LessThanOrEqual

from accounts.models import User
from listings.models import Listing


message_attachment_storage = FileSystemStorage(
    location=settings.MESSAGE_ATTACHMENT_ROOT,
    file_permissions_mode=0o640,
    directory_permissions_mode=0o750,
)


def message_attachment_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"{uuid.uuid4().hex}{extension}"


class PreserveHistoryQuerySet(models.QuerySet):
    def delete(self):
        raise ProtectedError("Conversation history cannot be hard deleted.", [])


class Conversation(models.Model):
    id = models.BigAutoField(primary_key=True)
    listing = models.ForeignKey(
        Listing,
        on_delete=models.RESTRICT,
        related_name="conversations",
        db_column="listing_id",
        db_index=False,
    )
    seeker = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name="started_conversations",
        db_column="seeker_id",
        db_index=False,
    )
    created_at = models.DateTimeField(db_default=Now())

    objects = models.Manager.from_queryset(PreserveHistoryQuerySet)()

    class Meta:
        db_table = "conversations"
        constraints = [
            models.UniqueConstraint(
                fields=("seeker", "listing"),
                name="uq_conversations_seeker_listing",
            ),
        ]
        indexes = [
            models.Index(fields=("listing",), name="ix_conversations_listing"),
        ]

    def __str__(self):
        return f"Conversation {self.pk} for listing {self.listing_id}"

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError("Conversation history cannot be hard deleted.", [self])


class Message(models.Model):
    id = models.BigAutoField(primary_key=True)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.RESTRICT,
        related_name="messages",
        db_column="conversation_id",
        db_index=False,
    )
    sender = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name="sent_messages",
        db_column="sender_id",
        db_index=False,
    )
    body = models.TextField()
    created_at = models.DateTimeField(db_default=Now())

    objects = models.Manager.from_queryset(PreserveHistoryQuerySet)()

    class Meta:
        db_table = "messages"
        constraints = [
            models.CheckConstraint(
                condition=(
                    GreaterThanOrEqual(Length("body"), Value(0))
                    & LessThanOrEqual(Length("body"), Value(2000))
                ),
                name="ck_messages_body",
            ),
        ]
        indexes = [
            models.Index(
                fields=("conversation", "created_at"),
                name="ix_messages_conv_created",
            ),
        ]

    def __str__(self):
        return f"Message {self.pk} in conversation {self.conversation_id}"

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError("Conversation history cannot be hard deleted.", [self])


class MessageAttachment(models.Model):
    id = models.BigAutoField(primary_key=True)
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="attachments",
        db_column="message_id",
    )
    file = models.FileField(
        storage=message_attachment_storage,
        upload_to=message_attachment_path,
        max_length=255,
    )
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(db_default=Now())

    class Meta:
        db_table = "message_attachments"
        indexes = [models.Index(fields=("message",), name="ix_msg_attach_message")]

    def __str__(self):
        return f"Attachment {self.pk} for message {self.message_id}"
