from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from urllib.parse import urlencode
from uuid import uuid4

from rest_framework.exceptions import APIException, ValidationError
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from listings.image_validation import validate_listing_image

from .models import RoleMembership

User = get_user_model()
PASSWORD_RESET_SALT = "accounts.password-reset"


class InvalidPasswordResetToken(APIException):
    status_code = 401
    default_detail = "The password reset token is invalid or expired."
    default_code = "password_reset_invalid_token"


@transaction.atomic
def update_profile_picture(user, uploaded_file):
    _image_format, _size, extension = validate_listing_image(uploaded_file)
    uploaded_file.seek(0)
    storage_key = default_storage.save(
        f"profile-pictures/{uuid4().hex}{extension}", uploaded_file
    )
    old_key = user.profile_picture.name if user.profile_picture else None
    try:
        user.profile_picture = storage_key
        user.save(update_fields=("profile_picture",))
    except Exception:
        default_storage.delete(storage_key)
        raise
    if old_key:
        transaction.on_commit(lambda: default_storage.delete(old_key))
    return user


@transaction.atomic
def remove_profile_picture(user):
    old_key = user.profile_picture.name if user.profile_picture else None
    if old_key:
        user.profile_picture = None
        user.save(update_fields=("profile_picture",))
        transaction.on_commit(lambda: default_storage.delete(old_key))
    return user


@transaction.atomic
def register_account(validated_data):
    """Create a public account and its required role memberships atomically."""
    data = dict(validated_data)
    roles = data.pop("roles")
    password = data.pop("password")
    return User.objects.create_user(password=password, roles=roles, **data)


@transaction.atomic
def update_account_profile(user, changes):
    """Apply the supported self-service profile and public-role changes."""
    editable_fields = (
        "full_name",
        "age",
        "profession",
        "about_me",
        "phone_number",
        "show_phone_number_publicly",
        "show_owner_about_me_publicly",
        "show_owner_profession_publicly",
        "show_owner_contact_preferences_publicly",
        "preferred_contact_methods",
        "preferred_contact_times",
        "seeker_age",
        "seeker_about_me",
        "seeker_profession",
        "seeker_phone_number",
        "seeker_present_address",
        "seeker_family_members",
        "seeker_permanent_address",
        "show_seeker_age_publicly",
        "show_seeker_about_me_publicly",
        "show_seeker_profession_publicly",
        "show_seeker_phone_number_publicly",
        "show_seeker_present_address_publicly",
        "show_seeker_family_members_publicly",
        "show_seeker_permanent_address_publicly",
    )
    changed_fields = []
    for field in editable_fields:
        if field in changes:
            setattr(user, field, changes[field])
            changed_fields.append(field)
    if changed_fields:
        user.save(update_fields=changed_fields)

    add_role = changes.get("add_role")
    if add_role:
        RoleMembership.objects.get_or_create(user=user, role=add_role)
    return user


def send_password_reset_email(user):
    token = signing.dumps(
        {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": default_token_generator.make_token(user),
        },
        salt=PASSWORD_RESET_SALT,
        compress=True,
    )
    query = urlencode({"token": token})
    reset_url = (
        f"{settings.PASSWORD_RESET_FRONTEND_URL.rstrip('/')}"
        f"/reset-password?{query}"
    )
    send_mail(
        subject="Reset your BasaChai password",
        message=(
            "We received a request to reset your BasaChai password. "
            "If you made this request, use the link below to choose a new password. "
            "The link expires and can only be used once.\n\n"
            f"{reset_url}\n\n"
            "If you did not request a password reset, you can ignore this email."
        ),
        from_email=None,
        recipient_list=[user.email],
        fail_silently=False,
    )


@transaction.atomic
def reset_account_password(token, new_password):
    try:
        payload = signing.loads(
            token,
            salt=PASSWORD_RESET_SALT,
            max_age=settings.PASSWORD_RESET_TIMEOUT,
        )
        user_id = urlsafe_base64_decode(payload["uid"]).decode()
    except (signing.BadSignature, signing.SignatureExpired, KeyError, TypeError, ValueError, UnicodeDecodeError) as error:
        raise InvalidPasswordResetToken from error

    try:
        user = User.objects.select_for_update().get(pk=user_id, is_active=True)
    except (User.DoesNotExist, ValueError, TypeError) as error:
        raise InvalidPasswordResetToken from error

    if not default_token_generator.check_token(user, payload.get("token")):
        raise InvalidPasswordResetToken

    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as error:
        raise ValidationError({"new_password": error.messages}) from error

    user.set_password(new_password)
    user.save(update_fields=("password",))
    active_refresh_tokens = OutstandingToken.objects.select_for_update().filter(
        user=user,
        expires_at__gt=timezone.now(),
    )
    for outstanding_token in active_refresh_tokens.iterator():
        BlacklistedToken.objects.get_or_create(token=outstanding_token)
    return user
