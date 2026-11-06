from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_seeker_profile_additional_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="seeker_family_members",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="user",
            name="seeker_permanent_address",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="user",
            name="show_seeker_family_members_publicly",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="show_seeker_permanent_address_publicly",
            field=models.BooleanField(default=False),
        ),
    ]
