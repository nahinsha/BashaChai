import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        logger.error(
            "Unhandled API exception",
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        return Response(
            {
                "error": {
                    "code": "server_error",
                    "message": "An unexpected error occurred.",
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        codes = exc.get_codes() if hasattr(exc, "get_codes") else ""
        if codes == "password_reset_invalid_token":
            code = "invalid_token"
            message = "The password reset token is invalid or expired."
        else:
            code = (
                "invalid_token"
                if codes in ("invalid_token", "token_not_valid")
                else "not_authenticated"
            )
            message = (
                "The access token is invalid or expired."
                if code == "invalid_token"
                else "Authentication is required."
            )
        body = {"code": code, "message": message}
    elif response.status_code == status.HTTP_403_FORBIDDEN:
        body = {
            "code": "permission_denied",
            "message": "The signed-in role is not allowed to use this endpoint.",
        }
    elif response.status_code == status.HTTP_400_BAD_REQUEST:
        code = exc.get_codes() if hasattr(exc, "get_codes") else None
        if code in ("invalid_page", "availability_confirmation_required"):
            body = {
                "code": code,
                "message": str(getattr(exc, "detail", "The request is invalid.")),
            }
            last_page = getattr(exc, "last_page", None)
            if code == "invalid_page" and last_page is not None:
                body["details"] = {"last_page": last_page}
        else:
            body = {
                "code": "validation_error",
                "message": "Please correct the highlighted fields.",
                "fields": response.data,
            }
    elif response.status_code == status.HTTP_404_NOT_FOUND:
        body = {"code": "not_found", "message": "The requested resource was not found."}
    elif response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED:
        body = {
            "code": "method_not_allowed",
            "message": "This method is not allowed for the requested resource.",
        }
    elif response.status_code == status.HTTP_409_CONFLICT:
        codes = exc.get_codes() if hasattr(exc, "get_codes") else None
        if codes in (
            "listing_removed",
            "invalid_status_transition",
            "last_image_required",
            "moderation_hold_active",
            "already_in_shortlist",
            "listing_not_contactable",
            "messaging_closed",
            "listing_not_accepting_requests",
            "duplicate_pending_request",
            "hold_already_active",
            "no_active_hold",
        ):
            body = {
                "code": codes,
                "message": str(getattr(exc, "detail", "The request conflicts with the listing state.")),
            }
            details = getattr(exc, "extra_details", None)
            if details:
                body["details"] = details
        else:
            body = {
                "code": "request_error",
                "message": "The request could not be completed.",
            }
    elif response.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        body = {
            "code": "server_error",
            "message": "An unexpected error occurred.",
        }
    elif response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        is_auth_throttle = getattr(context.get("view"), "auth_throttle_scope", None)
        body = {
            "code": "throttled",
            "message": (
                "Too many requests in a short time. Please wait before trying again."
                if is_auth_throttle
                else "Too many messages in a short time. Please wait before sending another message."
            ),
        }
    else:
        body = {
            "code": "request_error",
            "message": "The request could not be completed.",
        }

    response.data = {"error": body}
    return response
