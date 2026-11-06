from rest_framework import status
from rest_framework.exceptions import APIException


class ListingNotContactable(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "listing_not_contactable"
    default_detail = "A conversation cannot be started for this listing."


class MessagingClosed(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "messaging_closed"
    default_detail = "New messages are closed for this listing."
