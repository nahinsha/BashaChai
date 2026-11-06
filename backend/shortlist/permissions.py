from rest_framework.permissions import BasePermission

from accounts.models import RoleMembership


class IsHomeSeeker(BasePermission):
    message = "A Home Seeker role is required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role_memberships.filter(
            role=RoleMembership.Role.HOME_SEEKER
        ).exists()
