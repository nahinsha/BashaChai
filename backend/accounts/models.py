from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.deletion import ProtectedError
from django.db.models.functions import Now
from django.db.models.functions import Lower

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    class PreferredContactMethod(models.TextChoices):
        IN_APP_MESSAGE = "IN_APP_MESSAGE", "In-app message"
        PHONE_CALL = "PHONE_CALL", "Phone call"

    class PreferredContactTime(models.TextChoices):
        MORNING = "MORNING", "Morning"
        AFTERNOON = "AFTERNOON", "Afternoon"
        EVENING = "EVENING", "Evening"

    id = models.BigAutoField(primary_key=True)
    email = models.EmailField(max_length=254)
    full_name = models.CharField(max_length=150)
    profile_picture = models.ImageField(
        upload_to="profile-pictures/",
        blank=True,
        null=True,
    )
    age = models.PositiveSmallIntegerField(blank=True, null=True)
    profession = models.CharField(max_length=120, blank=True, default="")
    about_me = models.CharField(max_length=280, blank=True, default="")
    phone_number = models.CharField(max_length=30, blank=True, default="")
    show_phone_number_publicly = models.BooleanField(default=False)
    show_owner_about_me_publicly = models.BooleanField(default=False)
    show_owner_profession_publicly = models.BooleanField(default=False)
    show_owner_contact_preferences_publicly = models.BooleanField(default=False)
    preferred_contact_methods = models.JSONField(blank=True, default=list)
    preferred_contact_times = models.JSONField(blank=True, default=list)
    seeker_age = models.PositiveSmallIntegerField(blank=True, null=True)
    seeker_about_me = models.CharField(max_length=280, blank=True, default="")
    seeker_profession = models.CharField(max_length=120, blank=True, default="")
    seeker_phone_number = models.CharField(max_length=30, blank=True, default="")
    seeker_present_address = models.CharField(max_length=255, blank=True, default="")
    seeker_family_members = models.CharField(max_length=255, blank=True, default="")
    seeker_permanent_address = models.CharField(max_length=255, blank=True, default="")
    show_seeker_age_publicly = models.BooleanField(default=False)
    show_seeker_about_me_publicly = models.BooleanField(default=False)
    show_seeker_profession_publicly = models.BooleanField(default=False)
    show_seeker_phone_number_publicly = models.BooleanField(default=False)
    show_seeker_present_address_publicly = models.BooleanField(default=False)
    show_seeker_family_members_publicly = models.BooleanField(default=False)
    show_seeker_permanent_address_publicly = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(db_default=Now())

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "users"
        constraints = [
            models.UniqueConstraint(Lower("email"), name="uq_users_email_lower"),
        ]

    def save(self, *args, **kwargs):
        self.email = self.__class__.objects.normalize_email(self.email).lower()
        return super().save(*args, **kwargs)

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError("User accounts cannot be hard deleted.", [self])

    @property
    def roles(self):
        return [membership.role for membership in self.role_memberships.all()]

    def __str__(self):
        return self.email


class RoleMembership(models.Model):
    class Role(models.TextChoices):
        HOME_SEEKER = "HOME_SEEKER", "Home Seeker"
        PROPERTY_OWNER = "PROPERTY_OWNER", "Property Owner"
        ADMIN_MODERATOR = "ADMIN_MODERATOR", "Admin / Moderator"

    pk = models.CompositePrimaryKey("user_id", "role")
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="role_memberships",
        db_column="user_id",
    )
    role = models.CharField(max_length=20, choices=Role.choices)

    class Meta:
        db_table = "user_roles"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(
                    role__in=("HOME_SEEKER", "PROPERTY_OWNER", "ADMIN_MODERATOR")
                ),
                name="ck_user_roles_role",
            ),
        ]

    def __str__(self):
        return f"{self.user.email}: {self.get_role_display()}"


class AuthRateLimitBucket(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    window_started_at = models.DateTimeField()
    expires_at = models.DateTimeField(db_index=True)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "auth_rate_limit_buckets"
