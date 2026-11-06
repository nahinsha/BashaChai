from django.utils import timezone
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from accounts.models import RoleMembership
from listings.exceptions import InvalidListingPage

from .models import Message, MessageAttachment
from .permissions import HasMessagingRole
from .serializers import (
    ConversationListSerializer,
    ConversationSerializer,
    MessageSerializer,
    SendMessageSerializer,
    StartConversationSerializer,
)
from .services import (
    get_accessible_conversation,
    scoped_conversations,
    send_message,
    start_conversation,
)

PAGE_SIZE_CONVERSATIONS = 20
PAGE_SIZE_MESSAGES = 50


class MessagingAPIView(APIView):
    permission_classes = [IsAuthenticated, HasMessagingRole]


def _page(request, queryset, page_size, allowed_params=None):
    allowed = {"page"}
    if allowed_params:
        allowed.update(allowed_params)
    unexpected = set(request.query_params.keys()) - allowed
    if unexpected:
        raise ValidationError(
            {key: ["Unexpected query parameter."] for key in sorted(unexpected)}
        )
    page_value = request.query_params.get("page", "1")
    count = queryset.count()
    last_page = max(1, (count + page_size - 1) // page_size)
    try:
        page_number = int(page_value)
    except (TypeError, ValueError) as error:
        raise InvalidListingPage(last_page=last_page) from error
    if page_number < 1 or page_number > last_page:
        raise InvalidListingPage(last_page=last_page)

    start = (page_number - 1) * page_size

    def page_url(value):
        query = request.query_params.copy()
        query["page"] = str(value)
        return f"{request.build_absolute_uri(request.path)}?{query.urlencode()}"

    return {
        "count": count,
        "next": page_url(page_number + 1) if start + page_size < count else None,
        "previous": page_url(page_number - 1) if page_number > 1 else None,
        "results": queryset[start : start + page_size],
    }


class ConversationListCreateView(MessagingAPIView):
    def get(self, request):
        unexpected = set(request.query_params.keys()) - {"page", "role"}
        if unexpected:
            raise ValidationError(
                {key: ["Unexpected query parameter."] for key in sorted(unexpected)}
            )
        role = request.query_params.get("role") or None
        if role is not None and role not in ("seeker", "owner"):
            raise ValidationError({"role": ["Select a valid role."]})
        page = _page(
            request,
            scoped_conversations(request.user, role=role),
            PAGE_SIZE_CONVERSATIONS,
            allowed_params={"role"},
        )
        page["results"] = ConversationListSerializer(
            page["results"], many=True, context={"request": request}
        ).data
        return Response(page)

    def post(self, request):
        # A dual-role account qualifies through its Home Seeker membership.
        if not request.user.role_memberships.filter(
            role=RoleMembership.Role.HOME_SEEKER
        ).exists():
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("A Home Seeker role is required to start a conversation.")
        serializer = StartConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conversation, created = start_conversation(
            request.user,
            serializer.validated_data["listing_id"],
            now=timezone.now(),
        )
        conversation = (
            scoped_conversations(request.user)
            .select_related("listing", "listing__owner", "seeker")
            .get(pk=conversation.pk)
        )
        return Response(
            ConversationSerializer(conversation, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ConversationDetailView(MessagingAPIView):
    def get(self, request, conversation_id):
        conversation = get_accessible_conversation(request.user, conversation_id)
        return Response(
            ConversationSerializer(conversation, context={"request": request}).data
        )


class ConversationMessagesView(MessagingAPIView):
    def get(self, request, conversation_id):
        conversation = get_accessible_conversation(request.user, conversation_id)
        messages = Message.objects.filter(conversation=conversation).select_related(
            "sender"
        ).prefetch_related("attachments").order_by("-created_at", "-pk")
        page = _page(request, messages, PAGE_SIZE_MESSAGES)
        page["results"] = MessageSerializer(
            page["results"],
            many=True,
            context={"conversation_seeker_id": conversation.seeker_id},
        ).data
        return Response(page)

    def post(self, request, conversation_id):
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = send_message(
            request.user,
            conversation_id,
            serializer.validated_data.get("body", ""),
            serializer.validated_data.get("attachments", ()),
        )
        return Response(
            MessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class SendMessageView(ConversationMessagesView):
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "message_send"

    def get_throttles(self):
        if self.request.method != "POST":
            return []
        return super().get_throttles()

    def get(self, request, conversation_id):
        return super().get(request, conversation_id)


class MessageAttachmentDownloadView(MessagingAPIView):
    def get(self, request, conversation_id, attachment_id):
        unexpected = set(request.query_params.keys()) - {"download"}
        if unexpected:
            raise ValidationError(
                {key: ["Unexpected query parameter."] for key in sorted(unexpected)}
            )
        download = request.query_params.get("download", "0")
        if download not in ("0", "1"):
            raise ValidationError({"download": ["Use 0 or 1."]})

        conversation = get_accessible_conversation(request.user, conversation_id)
        attachment = get_object_or_404(
            MessageAttachment.objects.filter(message__conversation=conversation),
            pk=attachment_id,
        )
        try:
            attachment_file = attachment.file.open("rb")
        except FileNotFoundError as error:
            raise Http404 from error

        as_attachment = download == "1" or not attachment.content_type.startswith("image/")
        response = FileResponse(
            attachment_file,
            as_attachment=as_attachment,
            filename=attachment.original_name,
            content_type=attachment.content_type,
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        return response
