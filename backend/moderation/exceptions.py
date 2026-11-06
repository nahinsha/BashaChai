from rest_framework import status
from rest_framework.exceptions import APIException


class ModerationStatusConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "invalid_status_transition"
    default_detail = "The moderation report cannot be changed from its current status."

    def __init__(self, current_status):
        super().__init__()
        self.extra_details = {"current_status": current_status}


class HoldAlreadyActive(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "hold_already_active"
    default_detail = "The listing already has an active moderation hold."


class NoActiveHold(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "no_active_hold"
    default_detail = "The listing does not have an active moderation hold."
