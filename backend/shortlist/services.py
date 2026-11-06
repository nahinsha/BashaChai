from django.db import transaction
from django.http import Http404

from listings.models import Listing

from .exceptions import AlreadyInShortlist
from .models import ShortlistItem


@transaction.atomic
def save_listing(seeker, listing_id):
    try:
        listing = Listing.objects.select_for_update().get(
            pk=listing_id,
            lifecycle_status=Listing.LifecycleStatus.PUBLISHED,
        )
    except Listing.DoesNotExist as error:
        raise Http404 from error

    item, created = ShortlistItem.objects.get_or_create(
        seeker=seeker,
        listing=listing,
    )
    if not created:
        raise AlreadyInShortlist()
    return item


@transaction.atomic
def remove_saved_listing(seeker, listing_id):
    try:
        item = ShortlistItem.objects.get(seeker=seeker, listing_id=listing_id)
    except ShortlistItem.DoesNotExist as error:
        raise Http404 from error
    item.delete()
