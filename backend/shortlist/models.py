from django.db import models
from django.db.models.functions import Now

from accounts.models import User
from listings.models import Listing


class ShortlistItem(models.Model):
    id = models.BigAutoField(primary_key=True)
    seeker = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name="shortlist_items",
        db_column="seeker_id",
        db_index=False,
    )
    listing = models.ForeignKey(
        Listing,
        on_delete=models.RESTRICT,
        related_name="shortlist_items",
        db_column="listing_id",
        db_index=False,
    )
    created_at = models.DateTimeField(db_default=Now())

    class Meta:
        db_table = "shortlist_items"
        constraints = [
            models.UniqueConstraint(
                fields=("seeker", "listing"),
                name="uq_shortlist_seeker_listing",
            ),
        ]
        indexes = [
            models.Index(fields=("listing",), name="ix_shortlist_listing"),
        ]

    def __str__(self):
        return f"User {self.seeker_id} saved listing {self.listing_id}"
