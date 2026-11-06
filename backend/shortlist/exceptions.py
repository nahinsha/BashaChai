from rest_framework import status
from rest_framework.exceptions import APIException


class AlreadyInShortlist(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "already_in_shortlist"
    default_detail = "The property is already saved."
