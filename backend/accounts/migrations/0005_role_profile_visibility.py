from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_owner_contact_multi_select"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="show_owner_about_me_publicly",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="show_owner_profession_publicly",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="show_owner_contact_preferences_publicly",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="seeker_about_me",
            field=models.CharField(blank=True, default="", max_length=280),
        ),
        migrations.AddField(
            model_name="user",
            name="seeker_profession",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="user",
            name="seeker_phone_number",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="user",
            name="show_seeker_about_me_publicly",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="show_seeker_profession_publicly",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="show_seeker_phone_number_publicly",
            field=models.BooleanField(default=False),
        ),
    ]
