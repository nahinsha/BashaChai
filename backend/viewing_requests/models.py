from django.db import models
from django.db.models import F, Q
from django.db.models.deletion import ProtectedError
from django.db.models.functions import Now

from accounts.models import User
from listings.models import Listing


class ViewingRequestQuerySet(models.QuerySet):
    def delete(self):
        raise ProtectedError("Viewing-request history cannot be deleted.", [])


class ViewingRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.BigAutoField(primary_key=True)
    listing = models.ForeignKey(
        Listing,
        on_delete=models.RESTRICT,
        related_name="viewing_requests",
        db_column="listing_id",
    )
    seeker = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name="viewing_requests",
        db_column="seeker_id",
    )
    preferred_at = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_default=Status.PENDING,
    )
    created_at = models.DateTimeField(db_default=Now())
    updated_at = models.DateTimeField(db_default=Now())

    objects = models.Manager.from_queryset(ViewingRequestQuerySet)()

    class Meta:
        db_table = "viewing_requests"
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=("PENDING", "ACCEPTED", "REJECTED", "CANCELLED")),
                name="ck_viewing_requests_status",
            ),
            models.CheckConstraint(
                condition=Q(preferred_at__gt=F("created_at")),
                name="ck_viewing_requests_future",
            ),
            models.UniqueConstraint(
                fields=("listing", "seeker"),
                condition=Q(status="PENDING"),
                name="uq_viewing_requests_one_pending",
            ),
        ]

    def __str__(self):
        return f"Viewing request {self.pk} for listing {self.listing_id}"

    def delete(self, using=None, keep_parents=False):
        raise ProtectedError("Viewing-request history cannot be deleted.", [self])
