from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.urls import reverse
from rest_framework import serializers

from .models import RoleMembership

User = get_user_model()
PUBLIC_ROLES = (
    RoleMembership.Role.HOME_SEEKER,
    RoleMembership.Role.PROPERTY_OWNER,
)


def profile_picture_url(user):
    if not getattr(user, "profile_picture", None):
        return None
    return reverse("account-profile-picture", kwargs={"user_id": user.pk})


class StrictSerializer(serializers.Serializer):
    ignored_input_fields = frozenset()

    def filter_ignored_input_fields(self, data):
        if hasattr(data, "keys") and hasattr(data, "copy"):
            data = data.copy()
            self.ignored_fields_present = self.ignored_input_fields.intersection(data.keys())
            for field in self.ignored_input_fields:
                data.pop(field, None)
        return data

    def to_internal_value(self, data):
        data = self.filter_ignored_input_fields(data)
        if hasattr(data, "keys"):
            unexpected = set(data.keys()) - set(self.fields.keys())
            if unexpected:
                raise serializers.ValidationError(
                    {field: ["Unexpected field."] for field in sorted(unexpected)}
                )
        return super().to_internal_value(data)


class CurrentUserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    profile_picture_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "full_name",
            "roles",
            "profile_picture_url",
            "age",
            "profession",
            "about_me",
            "phone_number",
            "show_phone_number_publicly",
            "preferred_contact_methods",
            "preferred_contact_times",
            "show_owner_about_me_publicly",
            "show_owner_profession_publicly",
            "show_owner_contact_preferences_publicly",
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

    def get_roles(self, user):
        return user.roles

    def get_profile_picture_url(self, user):
        return profile_picture_url(user)


class PublicOwnerProfileSerializer(serializers.ModelSerializer):
    role_labels = serializers.SerializerMethodField()
    profile_picture_url = serializers.SerializerMethodField()
    phone_number = serializers.SerializerMethodField()
    about_me = serializers.SerializerMethodField()
    profession = serializers.SerializerMethodField()
    preferred_contact_methods = serializers.SerializerMethodField()
    preferred_contact_times = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "full_name",
            "role_labels",
            "profile_picture_url",
            "date_joined",
            "profession",
            "about_me",
            "phone_number",
            "preferred_contact_methods",
            "preferred_contact_times",
        )
        read_only_fields = fields

    def get_role_labels(self, user):
        role_labels = dict(RoleMembership.Role.choices)
        memberships = set(
            user.role_memberships.filter(role__in=PUBLIC_ROLES).values_list(
                "role", flat=True
            )
        )
        return [role_labels[role] for role in PUBLIC_ROLES if role in memberships]

    def get_profile_picture_url(self, user):
        return profile_picture_url(user)

    def get_about_me(self, user):
        return user.about_me if user.show_owner_about_me_publicly else None

    def get_profession(self, user):
        return user.profession if user.show_owner_profession_publicly else None

    def get_phone_number(self, user):
        if user.show_phone_number_publicly:
            return user.phone_number or None
        return None

    def get_preferred_contact_methods(self, user):
        if user.show_owner_contact_preferences_publicly:
            return user.preferred_contact_methods
        return None

    def get_preferred_contact_times(self, user):
        if user.show_owner_contact_preferences_publicly:
            return user.preferred_contact_times
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for field in (
            "about_me",
            "profession",
            "phone_number",
            "preferred_contact_methods",
            "preferred_contact_times",
        ):
            if data.get(field) in (None, "", []):
                data.pop(field, None)
        return data


class PublicHomeSeekerProfileSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    profile_picture_url = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    about_me = serializers.SerializerMethodField()
    profession = serializers.SerializerMethodField()
    phone_number = serializers.SerializerMethodField()
    present_address = serializers.SerializerMethodField()
    family_members = serializers.SerializerMethodField()
    permanent_address = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "full_name",
            "role",
            "profile_picture_url",
            "date_joined",
            "age",
            "about_me",
            "profession",
            "phone_number",
            "present_address",
            "family_members",
            "permanent_address",
        )
        read_only_fields = fields

    def get_role(self, user):
        return RoleMembership.Role.HOME_SEEKER.label

    def get_profile_picture_url(self, user):
        return profile_picture_url(user)

    def get_age(self, user):
        return user.seeker_age if user.show_seeker_age_publicly else None

    def get_about_me(self, user):
        return user.seeker_about_me if user.show_seeker_about_me_publicly else None

    def get_profession(self, user):
        return user.seeker_profession if user.show_seeker_profession_publicly else None

    def get_phone_number(self, user):
        if user.show_seeker_phone_number_publicly:
            return user.seeker_phone_number or None
        return None

    def get_present_address(self, user):
        if user.show_seeker_present_address_publicly:
            return user.seeker_present_address or None
        return None

    def get_family_members(self, user):
        if user.show_seeker_family_members_publicly:
            return user.seeker_family_members or None
        return None

    def get_permanent_address(self, user):
        if user.show_seeker_permanent_address_publicly:
            return user.seeker_permanent_address or None
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for field in (
            "age",
            "about_me",
            "profession",
            "phone_number",
            "present_address",
            "family_members",
            "permanent_address",
        ):
            if data.get(field) in (None, "", []):
                data.pop(field, None)
        return data


class RegistrationSerializer(StrictSerializer):
    ignored_input_fields = frozenset(
        {"id", "is_active", "is_staff", "is_superuser", "date_joined"}
    )

    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    full_name = serializers.CharField(max_length=150, trim_whitespace=True)
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=PUBLIC_ROLES),
        allow_empty=False,
        min_length=1,
        max_length=2,
    )

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return normalized

    def validate_roles(self, roles):
        if len(roles) != len(set(roles)):
            raise serializers.ValidationError("Each role may be selected only once.")
        return roles

    def validate(self, attrs):
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages}) from error
        return attrs

class LoginSerializer(StrictSerializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class RefreshTokenInputSerializer(StrictSerializer):
    refresh = serializers.CharField(write_only=True, trim_whitespace=False)


class PasswordResetRequestSerializer(StrictSerializer):
    email = serializers.EmailField(max_length=254)


class PasswordResetConfirmSerializer(StrictSerializer):
    token = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)


class ProfileUpdateSerializer(StrictSerializer):
    ignored_input_fields = frozenset(
        {"id", "email", "roles", "password", "is_active", "is_staff", "is_superuser"}
    )

    full_name = serializers.CharField(max_length=150, required=False, trim_whitespace=True)
    add_role = serializers.ChoiceField(choices=PUBLIC_ROLES, required=False)
    age = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=120)
    profession = serializers.CharField(max_length=120, required=False, allow_blank=True, trim_whitespace=True)
    about_me = serializers.CharField(max_length=280, required=False, allow_blank=True, trim_whitespace=True)
    phone_number = serializers.CharField(max_length=30, required=False, allow_blank=True, trim_whitespace=True)
    show_phone_number_publicly = serializers.BooleanField(required=False)
    preferred_contact_methods = serializers.ListField(
        child=serializers.ChoiceField(choices=User.PreferredContactMethod.choices),
        required=False,
        allow_empty=True,
    )
    preferred_contact_times = serializers.ListField(
        child=serializers.ChoiceField(choices=User.PreferredContactTime.choices),
        required=False,
        allow_empty=True,
    )
    show_owner_about_me_publicly = serializers.BooleanField(required=False)
    show_owner_profession_publicly = serializers.BooleanField(required=False)
    show_owner_contact_preferences_publicly = serializers.BooleanField(required=False)
    seeker_about_me = serializers.CharField(max_length=280, required=False, allow_blank=True, trim_whitespace=True)
    seeker_profession = serializers.CharField(max_length=120, required=False, allow_blank=True, trim_whitespace=True)
    seeker_phone_number = serializers.CharField(max_length=30, required=False, allow_blank=True, trim_whitespace=True)
    seeker_age = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=120)
    seeker_present_address = serializers.CharField(max_length=255, required=False, allow_blank=True, trim_whitespace=True)
    seeker_family_members = serializers.CharField(max_length=255, required=False, allow_blank=True, trim_whitespace=True)
    seeker_permanent_address = serializers.CharField(max_length=255, required=False, allow_blank=True, trim_whitespace=True)
    show_seeker_age_publicly = serializers.BooleanField(required=False)
    show_seeker_about_me_publicly = serializers.BooleanField(required=False)
    show_seeker_profession_publicly = serializers.BooleanField(required=False)
    show_seeker_phone_number_publicly = serializers.BooleanField(required=False)
    show_seeker_present_address_publicly = serializers.BooleanField(required=False)
    show_seeker_family_members_publicly = serializers.BooleanField(required=False)
    show_seeker_permanent_address_publicly = serializers.BooleanField(required=False)

    owner_profile_fields = frozenset(
        {
            "age",
            "profession",
            "about_me",
            "phone_number",
            "show_phone_number_publicly",
            "preferred_contact_methods",
            "preferred_contact_times",
            "show_owner_about_me_publicly",
            "show_owner_profession_publicly",
            "show_owner_contact_preferences_publicly",
        }
    )
    seeker_profile_fields = frozenset(
        {
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
        }
    )

    def to_internal_value(self, data):
        # An empty optional age input means "not provided", rather than an error.
        if hasattr(data, "copy"):
            data = data.copy()
            if data.get("age", object()) == "":
                data["age"] = None
            if data.get("seeker_age", object()) == "":
                data["seeker_age"] = None
        return super().to_internal_value(data)

    def validate_preferred_contact_methods(self, values):
        if len(values) != len(set(values)):
            raise serializers.ValidationError("Each contact method may be selected only once.")
        return values

    def validate_preferred_contact_times(self, values):
        if len(values) != len(set(values)):
            raise serializers.ValidationError("Each time may be selected only once.")
        return values

    def validate(self, attrs):
        if not attrs and not getattr(self, "ignored_fields_present", set()):
            raise serializers.ValidationError("Provide at least one profile change.")
        if self.owner_profile_fields.intersection(attrs) and not self.instance.role_memberships.filter(
            role=RoleMembership.Role.PROPERTY_OWNER
        ).exists():
            raise serializers.ValidationError(
                {"owner_profile": ["A Property Owner role is required to edit these fields."]}
            )
        if self.seeker_profile_fields.intersection(attrs) and not self.instance.role_memberships.filter(
            role=RoleMembership.Role.HOME_SEEKER
        ).exists():
            raise serializers.ValidationError(
                {"seeker_profile": ["A Home Seeker role is required to edit these fields."]}
            )
        return attrs


class ProfilePictureUploadSerializer(StrictSerializer):
    image = serializers.FileField()

