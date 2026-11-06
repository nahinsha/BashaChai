import logging
import mimetypes

from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.http import FileResponse, Http404
from rest_framework import status
from rest_framework.exceptions import APIException, AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
    CurrentUserSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfilePictureUploadSerializer,
    ProfileUpdateSerializer,
    PublicHomeSeekerProfileSerializer,
    PublicOwnerProfileSerializer,
    RefreshTokenInputSerializer,
    RegistrationSerializer,
)
from .models import RoleMembership
from .permissions import HasAccountProfileRole, HasPublicRole
from moderation.permissions import IsAdminModerator
from .services import (
    InvalidPasswordResetToken,
    register_account,
    reset_account_password,
    send_password_reset_email,
    remove_profile_picture,
    update_account_profile,
    update_profile_picture,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class InvalidRefreshToken(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "The refresh token is invalid, expired, or revoked."
    default_code = "invalid_token"


def invalid_token():
    return InvalidRefreshToken()


def validation_error(fields):
    return Response(
        {
            "error": {
                "code": "validation_error",
                "message": "Please correct the highlighted fields.",
                "fields": fields,
            }
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


class PublicAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class RegisterView(PublicAPIView):
    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error(serializer.errors)
        user = register_account(serializer.validated_data)
        return Response(
            CurrentUserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class LoginView(PublicAPIView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error(serializer.errors)

        email = serializer.validated_data["email"].strip().lower()
        user = authenticate(
            request,
            email=email,
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response(
                {
                    "error": {
                        "code": "invalid_credentials",
                        "message": "Email or password is incorrect.",
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": CurrentUserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class RefreshView(PublicAPIView):
    def post(self, request):
        input_serializer = RefreshTokenInputSerializer(data=request.data)
        if not input_serializer.is_valid():
            return validation_error(input_serializer.errors)

        serializer = TokenRefreshSerializer(data=input_serializer.validated_data)
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError) as error:
            raise invalid_token() from error
        except AuthenticationFailed as error:
            if error.get_codes() == "no_active_account":
                raise invalid_token() from error
            raise
        except User.DoesNotExist as error:
            raise invalid_token() from error

        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class LogoutView(PublicAPIView):
    def post(self, request):
        serializer = RefreshTokenInputSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error(serializer.errors)

        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError as error:
            raise invalid_token() from error

        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(PublicAPIView):
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error(serializer.errors)

        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is not None and user.has_usable_password():
            try:
                send_password_reset_email(user)
            except Exception:
                # Do not change the public response based on account or mail state.
                logger.warning("Password reset email could not be sent.")

        return Response(
            {
                "message": (
                    "If an account exists for that email, password recovery "
                    "instructions will be sent."
                )
            },
            status=status.HTTP_202_ACCEPTED,
        )


class PasswordResetConfirmView(PublicAPIView):
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_error(serializer.errors)

        reset_account_password(
            serializer.validated_data["token"],
            serializer.validated_data["new_password"],
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        permissions = [IsAuthenticated]
        if self.request.method == "PATCH":
            permissions.append(HasAccountProfileRole)
        return [permission() for permission in permissions]

    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        if not serializer.is_valid():
            return validation_error(serializer.errors)
        user = update_account_profile(request.user, serializer.validated_data)
        return Response(CurrentUserSerializer(user).data)


class AdminUsersView(APIView):
    permission_classes = [IsAuthenticated, IsAdminModerator]

    def get(self, request):
        from rest_framework.exceptions import ValidationError
        from .models import RoleMembership

        unexpected = set(request.query_params) - {"page", "role", "status"}
        if unexpected:
            raise ValidationError({key: ["Unexpected query parameter."] for key in sorted(unexpected)})
        users = User.objects.filter(
            role_memberships__role__in=(RoleMembership.Role.HOME_SEEKER, RoleMembership.Role.PROPERTY_OWNER)
        ).distinct().prefetch_related("role_memberships").order_by("-date_joined", "-pk")
        role = request.query_params.get("role")
        if role:
            if role not in RoleMembership.Role.values:
                raise ValidationError({"role": ["Select a valid role."]})
            users = users.filter(role_memberships__role=role)
        account_status = request.query_params.get("status")
        if account_status:
            if account_status not in ("active", "inactive"):
                raise ValidationError({"status": ["Select active or inactive."]})
            users = users.filter(is_active=account_status == "active")
        page = _admin_page(request, users)
        page["results"] = [{
            "id": user.pk,
            "full_name": user.full_name,
            "email": user.email,
            "roles": user.roles,
            "is_active": user.is_active,
            "date_joined": user.date_joined,
        } for user in page["results"]]
        page["current_user_id"] = request.user.pk
        return Response(page)

    def patch(self, request, user_id=None):
        from rest_framework.exceptions import PermissionDenied, ValidationError

        if set(request.data) != {"is_active"} or not isinstance(request.data.get("is_active"), bool):
            raise ValidationError({"is_active": ["Provide a boolean account status."]})
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist as error:
            from django.http import Http404
            raise Http404 from error
        from .models import RoleMembership
        if user.pk == request.user.pk and not request.data["is_active"]:
            raise PermissionDenied("You cannot deactivate your own admin account.")
        if not request.data["is_active"] and user.role_memberships.filter(role=RoleMembership.Role.ADMIN_MODERATOR).exists():
            other_admins = User.objects.filter(is_active=True, role_memberships__role=RoleMembership.Role.ADMIN_MODERATOR).exclude(pk=user.pk).count()
            if other_admins == 0:
                raise PermissionDenied("The last active admin account cannot be deactivated.")
        user.is_active = request.data["is_active"]
        user.save(update_fields=["is_active"])
        return Response({"id": user.pk, "is_active": user.is_active})


def _admin_page(request, queryset, page_size=20):
    from rest_framework.exceptions import ValidationError

    try:
        page = int(request.query_params.get("page", "1"))
    except (TypeError, ValueError) as error:
        raise ValidationError({"page": ["Enter a valid page number."]}) from error
    count = queryset.count()
    last_page = max(1, (count + page_size - 1) // page_size)
    if page < 1 or page > last_page:
        raise ValidationError({"page": [f"Page must be between 1 and {last_page}."]})
    start = (page - 1) * page_size
    return {"count": count, "page": page, "page_size": page_size,
            "results": list(queryset[start:start + page_size])}


class ProfilePictureView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated, HasPublicRole]

    def post(self, request):
        serializer = ProfilePictureUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = update_profile_picture(request.user, serializer.validated_data["image"])
        return Response(CurrentUserSerializer(user).data)

    def delete(self, request):
        user = remove_profile_picture(request.user)
        return Response(CurrentUserSerializer(user).data)


class ProfilePictureContentView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, user_id):
        try:
            target = User.objects.get(pk=user_id)
        except User.DoesNotExist as error:
            raise Http404 from error

        if not target.profile_picture:
            raise Http404

        has_public_owner_profile = target.role_memberships.filter(
            role=RoleMembership.Role.PROPERTY_OWNER
        ).exists()
        allowed = has_public_owner_profile
        if request.user.is_authenticated:
            allowed = allowed or request.user.pk == target.pk
            if not allowed:
                allowed = _share_interaction_with(request.user, target)
        if not allowed:
            raise Http404

        try:
            image_file = target.profile_picture.open("rb")
        except (FileNotFoundError, OSError) as error:
            raise Http404 from error

        content_type = mimetypes.guess_type(target.profile_picture.name)[0]
        response = FileResponse(image_file, content_type=content_type or "application/octet-stream")
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


def _share_interaction_with(viewer, target):
    from django.db.models import Q
    from messaging.models import Conversation
    from viewing_requests.models import ViewingRequest

    conversation_exists = Conversation.objects.filter(
        Q(seeker=viewer, listing__owner=target)
        | Q(seeker=target, listing__owner=viewer)
    ).exists()
    if conversation_exists:
        return True
    return ViewingRequest.objects.filter(
        Q(seeker=viewer, listing__owner=target)
        | Q(seeker=target, listing__owner=viewer)
    ).exists()


class PublicOwnerProfileView(PublicAPIView):
    def get(self, request, owner_id):
        try:
            normalized_owner_id = int(owner_id)
        except (TypeError, ValueError) as error:
            raise Http404 from error
        if normalized_owner_id < 1:
            raise Http404

        try:
            owner = User.objects.filter(
                role_memberships__role=RoleMembership.Role.PROPERTY_OWNER
            ).get(pk=normalized_owner_id)
        except User.DoesNotExist as error:
            raise Http404 from error
        return Response(PublicOwnerProfileSerializer(owner).data)


class PublicHomeSeekerProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, seeker_id):
        try:
            normalized_seeker_id = int(seeker_id)
        except (TypeError, ValueError) as error:
            raise Http404 from error
        if normalized_seeker_id < 1:
            raise Http404

        try:
            seeker = User.objects.filter(
                role_memberships__role=RoleMembership.Role.HOME_SEEKER
            ).get(pk=normalized_seeker_id)
        except User.DoesNotExist as error:
            raise Http404 from error

        allowed = request.user.pk == seeker.pk or _share_interaction_with(request.user, seeker)
        if not allowed:
            raise Http404

        return Response(PublicHomeSeekerProfileSerializer(seeker).data)

