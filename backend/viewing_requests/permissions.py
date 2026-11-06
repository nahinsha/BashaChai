from rest_framework.permissions import BasePermission

from accounts.models import RoleMembership


class IsHomeSeeker(BasePermission):
    message = "A Home Seeker role is required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role_memberships.filter(
            role=RoleMembership.Role.HOME_SEEKER
        ).exists()


class IsPropertyOwner(BasePermission):
    message = "A Property Owner role is required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role_memberships.filter(
            role=RoleMembership.Role.PROPERTY_OWNER
        ).exists()


class HasViewingRequestRole(BasePermission):
    message = "A Home Seeker or Property Owner role is required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role_memberships.filter(
            role__in=(
                RoleMembership.Role.HOME_SEEKER,
                RoleMembership.Role.PROPERTY_OWNER,
            )
        ).exists()
