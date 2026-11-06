from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_role_profile_visibility"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="seeker_age",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="seeker_present_address",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="user",
            name="show_seeker_age_publicly",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="show_seeker_present_address_publicly",
            field=models.BooleanField(default=False),
        ),
    ]

