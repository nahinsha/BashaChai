from django.db import migrations, models
from django.db.models import Q


CANONICAL_VALUES = (
    "Flat / Apartment",
    "Full House",
    "Duplex",
    "Sublet",
    "Mess / Shared Accommodation",
)


def remove_property_type_constraint_if_present(apps, schema_editor):
    Listing = apps.get_model("listings", "Listing")
    constraint_name = "ck_listings_property_type"
    with schema_editor.connection.cursor() as cursor:
        constraints = schema_editor.connection.introspection.get_constraints(
            cursor, Listing._meta.db_table
        )
    if constraint_name in constraints:
        constraint = models.CheckConstraint(
            condition=Q(property_type__isnull=True)
            | Q(property_type__in=CANONICAL_VALUES),
            name=constraint_name,
        )
        schema_editor.remove_constraint(Listing, constraint)


class Migration(migrations.Migration):
    dependencies = [("listings", "0002_listing_property_type_choices")]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    remove_property_type_constraint_if_present,
                ),
            ],
            state_operations=[
                migrations.RemoveConstraint(
                    model_name="listing",
                    name="ck_listings_property_type",
                ),
            ],
        ),
        migrations.AlterField(
            model_name="listing",
            name="property_type",
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]
