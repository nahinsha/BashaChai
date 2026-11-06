from rest_framework import status
from rest_framework.exceptions import APIException


class ListingNotAcceptingRequests(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "listing_not_accepting_requests"
    default_detail = "The listing is not currently accepting viewing requests."


class DuplicatePendingRequest(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "duplicate_pending_request"
    default_detail = "A Pending viewing request already exists for this listing."

    def __init__(self, request_id):
        super().__init__()
        self.extra_details = {"request_id": request_id}


class InvalidViewingRequestTransition(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "invalid_status_transition"
    default_detail = "Only a Pending viewing request can be changed."

    def __init__(self, current_status):
        super().__init__()
        self.extra_details = {"current_status": current_status}
