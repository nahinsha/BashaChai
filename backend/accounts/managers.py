from django.contrib.auth.base_user import BaseUserManager
from django.db import models, transaction
from django.db.models.deletion import ProtectedError


class UserQuerySet(models.QuerySet):
    def delete(self):
        raise ProtectedError("User accounts cannot be hard deleted.", [])


class UserManager(BaseUserManager.from_queryset(UserQuerySet)):
    use_in_migrations = True

    @staticmethod
    def _normalize_public_roles(roles):
        from .models import RoleMembership

        allowed = {
            RoleMembership.Role.HOME_SEEKER,
            RoleMembership.Role.PROPERTY_OWNER,
        }
        normalized = [getattr(role, "value", role) for role in (roles or ())]
        if not normalized:
            raise ValueError("At least one public role is required.")
        if any(role not in allowed for role in normalized):
            raise ValueError("Public accounts may only use public BasaChai roles.")
        if len(normalized) != len(set(normalized)):
            raise ValueError("Each role may be assigned only once.")
        return normalized

    def _create_user(self, email, password, full_name, roles, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        if not full_name or not full_name.strip():
            raise ValueError("A full name is required.")
        from .models import RoleMembership

        role_values = [getattr(role, "value", role) for role in (roles or ())]
        all_roles = {role for role, _label in RoleMembership.Role.choices}
        admin_role = RoleMembership.Role.ADMIN_MODERATOR
        if not role_values:
            raise ValueError("At least one role membership is required.")
        if any(role not in all_roles for role in role_values):
            raise ValueError("A valid BasaChai role membership is required.")
        if len(role_values) != len(set(role_values)):
            raise ValueError("Each role may be assigned only once.")
        is_privileged = extra_fields.get("is_staff") or extra_fields.get("is_superuser")
        if is_privileged:
            if (
                not extra_fields.get("is_staff")
                or not extra_fields.get("is_superuser")
                or role_values != [admin_role]
            ):
                raise ValueError("Admin/Moderator accounts require controlled provisioning.")
        elif admin_role in role_values:
            raise ValueError("Admin/Moderator membership requires controlled provisioning.")
        user = self.model(
            email=self.normalize_email(email).lower(),
            full_name=full_name.strip(),
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        RoleMembership.objects.using(self._db).bulk_create(
            [RoleMembership(user=user, role=role) for role in role_values]
        )
        return user

    @transaction.atomic
    def create_user(self, email, password=None, full_name="", roles=None, **extra_fields):
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        if extra_fields["is_staff"] or extra_fields["is_superuser"]:
            raise ValueError("Privileged accounts must be created through createsuperuser.")
        public_roles = self._normalize_public_roles(roles)
        return self._create_user(email, password, full_name, public_roles, **extra_fields)

    @transaction.atomic
    def create_superuser(self, email, password=None, full_name="", **extra_fields):
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"]:
            raise ValueError("A superuser must have both is_staff and is_superuser set.")

        from .models import RoleMembership

        return self._create_user(
            email,
            password,
            full_name,
            [RoleMembership.Role.ADMIN_MODERATOR],
            **extra_fields,
        )
