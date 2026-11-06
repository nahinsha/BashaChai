from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_user_profile_picture"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="age",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="profession",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="user",
            name="about_me",
            field=models.CharField(blank=True, default="", max_length=280),
        ),
        migrations.AddField(
            model_name="user",
            name="phone_number",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="user",
            name="show_phone_number_publicly",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="preferred_contact_method",
            field=models.CharField(
                blank=True,
                choices=[
                    ("IN_APP_MESSAGE", "In-app message"),
                    ("PHONE_CALL", "Phone call"),
                ],
                default="",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="preferred_contact_time",
            field=models.CharField(
                blank=True,
                choices=[
                    ("MORNING", "Morning"),
                    ("AFTERNOON", "Afternoon"),
                    ("EVENING", "Evening"),
                ],
                default="",
                max_length=20,
            ),
        ),
    ]
