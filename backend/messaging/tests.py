from io import BytesIO
import tempfile
from unittest.mock import patch
import zipfile

from django.core.cache import cache
from django.core.exceptions import EmptyResultSet
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.storage import FileSystemStorage
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory, APITestCase, force_authenticate

from accounts.models import RoleMembership, User
from listings.models import Listing

from .models import Conversation, Message, MessageAttachment
from .permissions import HasMessagingRole
from .serializers import SendMessageSerializer
from .services import scoped_conversations
from .views import ConversationListCreateView


class MessageValidationTests(SimpleTestCase):
    def test_message_body_rejects_empty_whitespace_and_over_limit(self):
        for body in ("", " \t\n", "x" * 2001):
            serializer = SendMessageSerializer(data={"body": body})
            self.assertFalse(serializer.is_valid(), body[:20])

        serializer = SendMessageSerializer(data={"body": "x" * 2000})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_supported_image_and_document_upload_formats_pass_content_validation(self):
        uploads = []
        for extension, image_format in (("jpg", "JPEG"), ("jpeg", "JPEG"), ("png", "PNG"), ("webp", "WEBP")):
            image_buffer = BytesIO()
            Image.new("RGB", (1, 1), color=(10, 20, 30)).save(image_buffer, format=image_format)
            uploads.append(SimpleUploadedFile(f"home.{extension}", image_buffer.getvalue()))

        uploads.append(SimpleUploadedFile("lease.pdf", b"%PDF-1.4\n%%EOF\n"))
        uploads.append(SimpleUploadedFile("legacy.doc", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 16))
        docx_buffer = BytesIO()
        with zipfile.ZipFile(docx_buffer, "w") as document:
            document.writestr(
                "[Content_Types].xml",
                b'<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
            )
            document.writestr("word/document.xml", b"<document/>")
        uploads.append(SimpleUploadedFile("lease.docx", docx_buffer.getvalue()))

        for upload in uploads:
            with self.subTest(filename=upload.name):
                serializer = SendMessageSerializer(data={"body": "", "attachments": [upload]})
                self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_attachment_validation_rejects_wrong_contents_and_oversize(self):
        invalid = SimpleUploadedFile("photo.png", b"%PDF-1.4\n%%EOF\n")
        serializer = SendMessageSerializer(data={"body": "", "attachments": [invalid]})
        self.assertFalse(serializer.is_valid())

        with override_settings(MESSAGE_ATTACHMENT_MAX_BYTES=8):
            oversized = SimpleUploadedFile("large.pdf", b"%PDF-12345")
            serializer = SendMessageSerializer(data={"body": "", "attachments": [oversized]})
            self.assertFalse(serializer.is_valid())


class MessagingWorkspaceScopingUnitTests(SimpleTestCase):
    def test_unexpected_query_param_rejected(self):
        factory = APIRequestFactory()
        user = User(pk=1, email="user@example.com")
        request = factory.get("/api/v1/conversations/?unexpected=1")
        force_authenticate(request, user=user)
        with patch.object(HasMessagingRole, "has_permission", return_value=True):
            response = ConversationListCreateView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("unexpected", response.data["error"]["fields"])

    def test_invalid_role_query_param_rejected(self):
        factory = APIRequestFactory()
        user = User(pk=1, email="user@example.com")
        request = factory.get("/api/v1/conversations/?role=admin")
        force_authenticate(request, user=user)
        with patch.object(HasMessagingRole, "has_permission", return_value=True):
            response = ConversationListCreateView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["fields"]["role"], ["Select a valid role."])

    def test_unauthenticated_request_rejected(self):
        factory = APIRequestFactory()
        request = factory.get("/api/v1/conversations/?role=seeker")
        response = ConversationListCreateView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_without_messaging_role_forbidden(self):
        factory = APIRequestFactory()
        user = User(pk=1, email="admin@example.com")
        request = factory.get("/api/v1/conversations/?role=seeker")
        force_authenticate(request, user=user)
        with patch.object(HasMessagingRole, "has_permission", return_value=False):
            response = ConversationListCreateView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_scoped_conversations_filter_construction_for_dual_role_user(self):
        dual_user = User(pk=1, email="dual@example.com")
        with patch("messaging.services._has_role", return_value=True):
            seeker_qs = scoped_conversations(dual_user, role="seeker")
            sql, params = seeker_qs.query.sql_with_params()
            self.assertIn('"conversations"."seeker_id" = %s', sql)
            self.assertNotIn('"listings"."owner_id" = %s', sql)
            self.assertIn(1, params)

            owner_qs = scoped_conversations(dual_user, role="owner")
            sql, params = owner_qs.query.sql_with_params()
            self.assertIn('"listings"."owner_id" = %s', sql)
            self.assertNotIn('"conversations"."seeker_id" = %s', sql)
            self.assertIn(1, params)

            both_qs = scoped_conversations(dual_user, role=None)
            sql, params = both_qs.query.sql_with_params()
            self.assertIn('"conversations"."seeker_id" = %s', sql)
            self.assertIn('"listings"."owner_id" = %s', sql)

    def test_scoped_conversations_filter_construction_for_single_role_users(self):
        user = User(pk=2, email="seeker@example.com")

        # User is only Home Seeker
        with patch("messaging.services._has_role", side_effect=lambda u, r: r == RoleMembership.Role.HOME_SEEKER):
            seeker_qs = scoped_conversations(user, role="seeker")
            sql, _params = seeker_qs.query.sql_with_params()
            self.assertIn('"conversations"."seeker_id" = %s', sql)

            owner_qs = scoped_conversations(user, role="owner")
            with self.assertRaises(EmptyResultSet):
                owner_qs.query.sql_with_params()

        # User is only Property Owner
        with patch("messaging.services._has_role", side_effect=lambda u, r: r == RoleMembership.Role.PROPERTY_OWNER):
            owner_qs = scoped_conversations(user, role="owner")
            sql, _params = owner_qs.query.sql_with_params()
            self.assertIn('"listings"."owner_id" = %s', sql)

            seeker_qs = scoped_conversations(user, role="seeker")
            with self.assertRaises(EmptyResultSet):
                seeker_qs.query.sql_with_params()


class MessagingAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            email="message-owner@example.com",
            password="A-strong-random-password-42!",
            full_name="Property Owner",
            roles=[RoleMembership.Role.PROPERTY_OWNER],
        )
        cls.seeker = User.objects.create_user(
            email="message-seeker@example.com",
            password="A-strong-random-password-42!",
            full_name="Home Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )
        cls.other_seeker = User.objects.create_user(
            email="message-other@example.com",
            password="A-strong-random-password-42!",
            full_name="Another Seeker",
            roles=[RoleMembership.Role.HOME_SEEKER],
        )

    def setUp(self):
        # DRF throttles store per-user counts in Django's cache, which persists
        # across TestCase transactions. Reset it so cases cannot affect one another.
        cache.clear()
        self.owner_client = APIClient()
        self.owner_client.force_authenticate(self.owner)
        self.seeker_client = APIClient()
        self.seeker_client.force_authenticate(self.seeker)
        attachment_field = MessageAttachment._meta.get_field("file")
        original_storage = attachment_field.storage
        temporary_storage = tempfile.TemporaryDirectory()
        attachment_field.storage = FileSystemStorage(
            location=temporary_storage.name,
            file_permissions_mode=0o640,
            directory_permissions_mode=0o750,
        )

        def restore_storage():
            attachment_field.storage = original_storage
            temporary_storage.cleanup()

        self.addCleanup(restore_storage)

    def create_listing(self, **overrides):
        values = {
            "owner": self.owner,
            "title": "Dhaka apartment",
            "location": "Dhanmondi",
            "property_type": "Flat / Apartment",
            "monthly_rent": "25000.00",
            "bedrooms": 2,
            "bathrooms": 1,
            "lifecycle_status": Listing.LifecycleStatus.PUBLISHED,
            "availability_status": Listing.AvailabilityStatus.AVAILABLE,
            "availability_confirmed_at": timezone.now(),
        }
        values.update(overrides)
        return Listing.objects.create(**values)

    def start(self, client=None, listing=None):
        return (client or self.seeker_client).post(
            "/api/v1/conversations/",
            {"listing_id": (listing or self.listing).pk},
            format="json",
        )

    def test_create_or_retrieve_is_unique_per_seeker_and_listing(self):
        self.listing = self.create_listing()
        first = self.start()
        again = self.start()

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(again.status_code, status.HTTP_200_OK, again.data)
        self.assertEqual(first.data["id"], again.data["id"])
        self.assertEqual(first.data["seeker"]["profile_picture_url"], None)
        self.assertEqual(first.data["owner"]["profile_picture_url"], None)
        self.assertEqual(Conversation.objects.count(), 1)

        another_listing = self.create_listing(title="Another home")
        another = self.start(listing=another_listing)
        self.assertEqual(another.status_code, status.HTTP_201_CREATED, another.data)
        self.assertEqual(Conversation.objects.count(), 2)

    def test_start_requires_home_seeker_and_rejects_own_listing(self):
        self.listing = self.create_listing()
        denied = self.start(client=self.owner_client)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        own_listing = self.create_listing(owner=self.seeker)
        own_listing_response = self.start(listing=own_listing)
        self.assertEqual(own_listing_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_only_participants_can_read_and_send_messages(self):
        self.listing = self.create_listing()
        created = self.start()
        conversation_id = created.data["id"]

        self.assertEqual(
            self.owner_client.get(f"/api/v1/conversations/{conversation_id}/").status_code,
            status.HTTP_200_OK,
        )
        outsider = APIClient()
        outsider.force_authenticate(self.other_seeker)
        self.assertEqual(
            outsider.get(f"/api/v1/conversations/{conversation_id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            outsider.post(
                f"/api/v1/conversations/{conversation_id}/messages/",
                {"body": "private"},
                format="json",
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

        sent = self.seeker_client.post(
            f"/api/v1/conversations/{conversation_id}/messages/",
            {"body": "Is this home available?"},
            format="json",
        )
        self.assertEqual(sent.status_code, status.HTTP_201_CREATED, sent.data)
        self.assertEqual(sent.data["sender"]["id"], self.seeker.pk)
        owner_reply = self.owner_client.post(
            f"/api/v1/conversations/{conversation_id}/messages/",
            {"body": "Yes, it is."},
            format="json",
        )
        self.assertEqual(owner_reply.status_code, status.HTTP_201_CREATED, owner_reply.data)

    def test_unavailable_can_continue_existing_conversation_but_not_start(self):
        self.listing = self.create_listing()
        started = self.start()
        conversation_id = started.data["id"]
        self.listing.availability_status = Listing.AvailabilityStatus.UNAVAILABLE
        self.listing.save(update_fields=("availability_status",))

        blocked_start = self.start()
        self.assertEqual(blocked_start.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(blocked_start.data["error"]["code"], "listing_not_contactable")
        sent = self.seeker_client.post(
            f"/api/v1/conversations/{conversation_id}/messages/",
            {"body": "Following up"},
            format="json",
        )
        self.assertEqual(sent.status_code, status.HTTP_201_CREATED, sent.data)

    def test_unpublished_and_removed_preserve_history_but_close_sending(self):
        for lifecycle in (
            Listing.LifecycleStatus.UNPUBLISHED,
            Listing.LifecycleStatus.REMOVED,
        ):
            with self.subTest(lifecycle=lifecycle):
                listing = self.create_listing(lifecycle_status=Listing.LifecycleStatus.PUBLISHED)
                conversation = Conversation.objects.create(seeker=self.seeker, listing=listing)
                prior = Message.objects.create(
                    conversation=conversation,
                    sender=self.seeker,
                    body="Earlier message",
                )
                listing.lifecycle_status = lifecycle
                listing.save(update_fields=("lifecycle_status",))

                detail = self.seeker_client.get(
                    f"/api/v1/conversations/{conversation.pk}/"
                )
                history = self.seeker_client.get(
                    f"/api/v1/conversations/{conversation.pk}/messages/"
                )
                self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
                self.assertFalse(detail.data["can_send_message"])
                self.assertEqual(history.status_code, status.HTTP_200_OK, history.data)
                self.assertEqual(history.data["results"][0]["id"], prior.pk)

                closed = self.seeker_client.post(
                    f"/api/v1/conversations/{conversation.pk}/messages/",
                    {"body": "New message"},
                    format="json",
                )
                self.assertEqual(closed.status_code, status.HTTP_409_CONFLICT)
                self.assertEqual(closed.data["error"]["code"], "messaging_closed")

    def test_message_history_is_newest_first_and_invalid_bodies_are_rejected(self):
        self.listing = self.create_listing()
        conversation_id = self.start().data["id"]
        endpoint = f"/api/v1/conversations/{conversation_id}/messages/"
        for body in ("First", "Second"):
            sent = self.seeker_client.post(endpoint, {"body": body}, format="json")
            self.assertEqual(sent.status_code, status.HTTP_201_CREATED, sent.data)
        history = self.owner_client.get(endpoint)
        self.assertEqual([item["body"] for item in history.data["results"]], ["Second", "First"])

        for body in ("", "  \n", "x" * 2001):
            response = self.seeker_client.post(endpoint, {"body": body}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_image_and_document_attachments_are_available_only_to_conversation_participants(self):
        self.listing = self.create_listing()
        conversation_id = self.start().data["id"]
        endpoint = f"/api/v1/conversations/{conversation_id}/messages/"

        image_buffer = BytesIO()
        Image.new("RGB", (2, 2), color=(20, 150, 100)).save(image_buffer, format="PNG")
        image_bytes = image_buffer.getvalue()
        image_upload = SimpleUploadedFile("home-photo.png", image_bytes, content_type="image/png")
        image_message = self.seeker_client.post(
            endpoint,
            {"body": "", "attachments": [image_upload]},
            format="multipart",
        )
        self.assertEqual(image_message.status_code, status.HTTP_201_CREATED, image_message.data)
        self.assertEqual(image_message.data["body"], "")
        image_attachment = image_message.data["attachments"][0]
        self.assertEqual(image_attachment["filename"], "home-photo.png")
        self.assertTrue(image_attachment["is_image"])

        document_bytes = b"%PDF-1.4\nAttachment test document.\n%%EOF\n"
        document_upload = SimpleUploadedFile("lease.pdf", document_bytes, content_type="application/pdf")
        document_message = self.owner_client.post(
            endpoint,
            {"body": "Please review this document.", "attachments": [document_upload]},
            format="multipart",
        )
        self.assertEqual(document_message.status_code, status.HTTP_201_CREATED, document_message.data)
        document_attachment = document_message.data["attachments"][0]
        self.assertEqual(document_attachment["filename"], "lease.pdf")
        self.assertFalse(document_attachment["is_image"])

        docx_buffer = BytesIO()
        with zipfile.ZipFile(docx_buffer, "w") as document:
            document.writestr(
                "[Content_Types].xml",
                b'<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
            )
            document.writestr("word/document.xml", b"<document/>")
        word_uploads = [
            SimpleUploadedFile(
                "old-format.doc",
                b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 32,
                content_type="application/msword",
            ),
            SimpleUploadedFile(
                "new-format.docx",
                docx_buffer.getvalue(),
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
        ]
        word_message = self.seeker_client.post(
            endpoint,
            {"body": "", "attachments": word_uploads},
            format="multipart",
        )
        self.assertEqual(word_message.status_code, status.HTTP_201_CREATED, word_message.data)
        self.assertEqual(
            [item["filename"] for item in word_message.data["attachments"]],
            ["old-format.doc", "new-format.docx"],
        )

        for client in (self.seeker_client, self.owner_client):
            image_response = client.get(image_attachment["download_url"])
            self.assertEqual(image_response.status_code, status.HTTP_200_OK)
            self.assertEqual(image_response["Content-Type"], "image/png")
            self.assertIn("inline", image_response["Content-Disposition"])
            self.assertEqual(b"".join(image_response.streaming_content), image_bytes)

            document_response = client.get(f"{document_attachment['download_url']}?download=1")
            self.assertEqual(document_response.status_code, status.HTTP_200_OK)
            self.assertEqual(document_response["Content-Type"], "application/pdf")
            self.assertIn("attachment", document_response["Content-Disposition"])
            self.assertEqual(b"".join(document_response.streaming_content), document_bytes)

        outsider_client = APIClient()
        outsider_client.force_authenticate(self.other_seeker)
        self.assertEqual(
            outsider_client.get(image_attachment["download_url"]).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            outsider_client.get(document_attachment["download_url"]).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_attachment_validation_rejects_unsupported_mismatched_and_oversized_files(self):
        self.listing = self.create_listing()
        conversation_id = self.start().data["id"]
        endpoint = f"/api/v1/conversations/{conversation_id}/messages/"

        invalid_uploads = (
            SimpleUploadedFile("notes.txt", b"plain text", content_type="text/plain"),
            SimpleUploadedFile("photo.png", b"%PDF-1.4\n%%EOF", content_type="image/png"),
        )
        for upload in invalid_uploads:
            response = self.seeker_client.post(
                endpoint,
                {"body": "", "attachments": [upload]},
                format="multipart",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

        with override_settings(MESSAGE_ATTACHMENT_MAX_BYTES=8):
            oversized = SimpleUploadedFile("large.pdf", b"%PDF-12345", content_type="application/pdf")
            response = self.seeker_client.post(
                endpoint,
                {"body": "", "attachments": [oversized]},
                format="multipart",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(Message.objects.count(), 0)

    @override_settings(REST_FRAMEWORK={
        "EXCEPTION_HANDLER": "accounts.exceptions.api_exception_handler",
        "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
        "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
        "DEFAULT_THROTTLE_RATES": {"message_send": "10/min"},
    })
    def test_message_send_is_rate_limited_with_retry_after(self):
        self.listing = self.create_listing()
        conversation_id = self.start().data["id"]
        endpoint = f"/api/v1/conversations/{conversation_id}/messages/"
        last = None
        for index in range(11):
            last = self.seeker_client.post(
                endpoint,
                {"body": f"Message {index}"},
                format="json",
            )
        self.assertEqual(last.status_code, status.HTTP_429_TOO_MANY_REQUESTS, last.data)
        self.assertEqual(last.data["error"]["code"], "throttled")
        self.assertIn("Retry-After", last)

    def test_dual_role_workspace_separation_and_role_filtering(self):
        dual_user = User.objects.create_user(
            email="message-dual@example.com",
            password="A-strong-random-password-42!",
            full_name="Dual Role User",
            roles=[RoleMembership.Role.HOME_SEEKER, RoleMembership.Role.PROPERTY_OWNER],
        )
        dual_client = APIClient()
        dual_client.force_authenticate(dual_user)

        # 1. Conversation where dual_user is seeker (inquiring about self.owner's listing)
        owner_listing = self.create_listing(owner=self.owner)
        start_resp = dual_client.post("/api/v1/conversations/", {"listing_id": owner_listing.pk}, format="json")
        self.assertEqual(start_resp.status_code, status.HTTP_201_CREATED)
        seeker_conv_id = start_resp.data["id"]

        # 2. Conversation where dual_user is owner (self.seeker inquires about dual_user's listing)
        dual_listing = self.create_listing(owner=dual_user)
        owner_resp = self.seeker_client.post("/api/v1/conversations/", {"listing_id": dual_listing.pk}, format="json")
        self.assertEqual(owner_resp.status_code, status.HTTP_201_CREATED)
        owner_conv_id = owner_resp.data["id"]

        # Dual-role user queries role=seeker: only seeker conversation
        res_seeker = dual_client.get("/api/v1/conversations/?role=seeker")
        self.assertEqual(res_seeker.status_code, status.HTTP_200_OK)
        seeker_ids = [c["id"] for c in res_seeker.data["results"]]
        self.assertIn(seeker_conv_id, seeker_ids)
        self.assertNotIn(owner_conv_id, seeker_ids)

        # Dual-role user queries role=owner: only owner conversation
        res_owner = dual_client.get("/api/v1/conversations/?role=owner")
        self.assertEqual(res_owner.status_code, status.HTTP_200_OK)
        owner_ids = [c["id"] for c in res_owner.data["results"]]
        self.assertIn(owner_conv_id, owner_ids)
        self.assertNotIn(seeker_conv_id, owner_ids)

        # Dual-role user queries without role: both conversations returned
        res_both = dual_client.get("/api/v1/conversations/")
        self.assertEqual(res_both.status_code, status.HTTP_200_OK)
        both_ids = [c["id"] for c in res_both.data["results"]]
        self.assertIn(seeker_conv_id, both_ids)
        self.assertIn(owner_conv_id, both_ids)

        # Single-role seeker querying role=owner returns empty
        seeker_owner_query = self.seeker_client.get("/api/v1/conversations/?role=owner")
        self.assertEqual(seeker_owner_query.status_code, status.HTTP_200_OK)
        self.assertEqual(seeker_owner_query.data["results"], [])

        # Single-role owner querying role=seeker returns empty
        owner_seeker_query = self.owner_client.get("/api/v1/conversations/?role=seeker")
        self.assertEqual(owner_seeker_query.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_seeker_query.data["results"], [])

        # Unauthorized user (other_seeker) cannot see conversations
        other_client = APIClient()
        other_client.force_authenticate(self.other_seeker)
        other_list = other_client.get("/api/v1/conversations/")
        self.assertEqual(other_list.status_code, status.HTTP_200_OK)
        self.assertNotIn(seeker_conv_id, [c["id"] for c in other_list.data["results"]])
        self.assertNotIn(owner_conv_id, [c["id"] for c in other_list.data["results"]])

        # Unauthorized user cannot access conversation details
        other_detail = other_client.get(f"/api/v1/conversations/{seeker_conv_id}/")
        self.assertEqual(other_detail.status_code, status.HTTP_404_NOT_FOUND)
