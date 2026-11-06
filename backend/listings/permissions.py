from rest_framework.permissions import BasePermission

from accounts.models import RoleMembership


class IsPropertyOwner(BasePermission):
    message = "A Property Owner role is required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role_memberships.filter(
            role=RoleMembership.Role.PROPERTY_OWNER
        ).exists()
