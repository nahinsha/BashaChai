from rest_framework import status
from rest_framework.exceptions import APIException


class ListingConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "invalid_status_transition"
    default_detail = "The listing cannot be changed from its current state."

    def __init__(self, detail=None, code=None):
        super().__init__(detail=detail or self.default_detail, code=code or self.default_code)


class ListingAvailabilityConfirmationRequired(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "availability_confirmation_required"
    default_detail = "Confirm availability before publishing this listing."


class InvalidListingPage(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "invalid_page"
    default_detail = "Page number is invalid."

    def __init__(self, last_page=None):
        super().__init__()
        self.last_page = last_page
