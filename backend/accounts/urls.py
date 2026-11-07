from django.urls import path

from .views import (
    CurrentUserView,
    AdminUsersView,
    CsrfTokenView,
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfilePictureContentView,
    ProfilePictureView,
    PublicHomeSeekerProfileView,
    PublicOwnerProfileView,
    RefreshView,
    RegisterView,
)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/csrf/", CsrfTokenView.as_view(), name="auth-csrf"),
    path("auth/token/refresh/", RefreshView.as_view(), name="auth-token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path(
        "auth/password-reset/",
        PasswordResetRequestView.as_view(),
        name="auth-password-reset",
    ),
    path(
        "auth/password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("admin/users/", AdminUsersView.as_view(), name="admin-users"),
    path("admin/users/<int:user_id>/", AdminUsersView.as_view(), name="admin-user-detail"),
    path(
        "me/profile-picture/",
        ProfilePictureView.as_view(),
        name="current-user-profile-picture",
    ),
    path(
        "users/<int:user_id>/profile-picture/",
        ProfilePictureContentView.as_view(),
        name="account-profile-picture",
    ),
    path("owners/<str:owner_id>/", PublicOwnerProfileView.as_view(), name="public-owner-profile"),
    path("seekers/<str:seeker_id>/", PublicHomeSeekerProfileView.as_view(), name="public-seeker-profile"),
]
