from django.db import migrations, models
from django.db.models import Q


CANONICAL_VALUES = (
    "Flat / Apartment",
    "Full House",
    "Duplex",
    "Sublet",
    "Mess / Shared Accommodation",
)


class Migration(migrations.Migration):
    dependencies = [("listings", "0001_initial")]

    operations = [
        # Retain the historical operation slot without rewriting property data.
        migrations.RunPython(migrations.RunPython.noop, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="listing",
            name="property_type",
            field=models.CharField(
                blank=True,
                choices=[(value, value) for value in CANONICAL_VALUES],
                max_length=50,
                null=True,
            ),
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddConstraint(
                    model_name="listing",
                    constraint=models.CheckConstraint(
                        condition=Q(
                            property_type__isnull=True
                        ) | Q(property_type__in=CANONICAL_VALUES),
                        name="ck_listings_property_type",
                    ),
                ),
            ]
        ),
    ]
