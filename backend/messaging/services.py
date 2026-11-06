from django.db import transaction
from django.db.models import Prefetch, Q
from django.http import Http404
from django.utils import timezone
from pathlib import Path, PurePath
import re

from accounts.models import RoleMembership
from listings.models import Listing
from listings.services import availability_reminder

from .exceptions import ListingNotContactable, MessagingClosed
from .models import Conversation, Message, MessageAttachment


def _has_role(user, role):
    return user.role_memberships.filter(role=role).exists()


def scoped_conversations(user, role=None):
    scope = Q(pk__in=[])
    if role == "seeker":
        if _has_role(user, RoleMembership.Role.HOME_SEEKER):
            scope |= Q(seeker=user)
    elif role == "owner":
        if _has_role(user, RoleMembership.Role.PROPERTY_OWNER):
            scope |= Q(listing__owner=user)
    else:
        if _has_role(user, RoleMembership.Role.HOME_SEEKER):
            scope |= Q(seeker=user)
        if _has_role(user, RoleMembership.Role.PROPERTY_OWNER):
            scope |= Q(listing__owner=user)
    latest_message = Message.objects.select_related("sender").prefetch_related(
        "attachments"
    ).order_by("-created_at", "-pk")[:1]
    return (
        Conversation.objects.filter(scope)
        .select_related("listing", "listing__owner", "seeker")
        .prefetch_related(Prefetch("messages", queryset=latest_message, to_attr="latest_messages"))
        .order_by("-created_at", "-pk")
    )


def get_accessible_conversation(user, conversation_id):
    try:
        return scoped_conversations(user).get(pk=conversation_id)
    except Conversation.DoesNotExist as error:
        raise Http404 from error


@transaction.atomic
def start_conversation(seeker, listing_id, now=None):
    now = now or timezone.now()
    try:
        listing = Listing.objects.select_for_update().select_related("owner").get(pk=listing_id)
    except Listing.DoesNotExist as error:
        raise Http404 from error

    if listing.owner_id == seeker.pk:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("A Property Owner cannot start a conversation about their own listing.")

    _notice, _day, shown_status = availability_reminder(listing, now)
    if (
        listing.lifecycle_status != Listing.LifecycleStatus.PUBLISHED
        or shown_status == Listing.AvailabilityStatus.UNAVAILABLE
    ):
        raise ListingNotContactable()

    conversation, created = Conversation.objects.get_or_create(
        seeker=seeker,
        listing=listing,
    )
    return conversation, created


@transaction.atomic
def send_message(user, conversation_id, body="", attachments=()):
    conversation = get_accessible_conversation(user, conversation_id)
    try:
        listing = Listing.objects.select_for_update().get(pk=conversation.listing_id)
    except Listing.DoesNotExist as error:
        raise Http404 from error

    if listing.lifecycle_status in (
        Listing.LifecycleStatus.UNPUBLISHED,
        Listing.LifecycleStatus.REMOVED,
    ):
        raise MessagingClosed()

    message = Message.objects.create(
        conversation=conversation,
        sender=user,
        body=body,
    )
    created_attachments = []
    try:
        for upload in attachments:
            extension = Path(upload.name).suffix.lower()
            content_type = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
                ".pdf": "application/pdf",
                ".doc": "application/msword",
                ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }[extension]
            original_name = re.sub(
                r"[\r\n\x00-\x1f\x7f]",
                "",
                PurePath(upload.name.replace("\\", "/")).name,
            ).strip()[:255] or "attachment"
            attachment = MessageAttachment.objects.create(
                message=message,
                file=upload,
                original_name=original_name,
                content_type=content_type,
                size=upload.size,
            )
            created_attachments.append(attachment)
    except Exception:
        for attachment in created_attachments:
            attachment.file.delete(save=False)
        raise
    return message
