from rest_framework.permissions import BasePermission

from .models import RoleMembership


class HasPublicRole(BasePermission):
    """Allow only accounts with at least one public BasaChai role."""

    message = "A Home Seeker or Property Owner role is required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role_memberships.filter(
            role__in=(
                RoleMembership.Role.HOME_SEEKER,
                RoleMembership.Role.PROPERTY_OWNER,
            )
        ).exists()


class HasAccountProfileRole(BasePermission):
    """Allow profile edits for public roles and controlled admin accounts."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role_memberships.filter(
            role__in=(
                RoleMembership.Role.HOME_SEEKER,
                RoleMembership.Role.PROPERTY_OWNER,
                RoleMembership.Role.ADMIN_MODERATOR,
            )
        ).exists()
