from django.db import migrations, models


def copy_single_contact_choices(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.all().iterator():
        method = user.preferred_contact_method
        contact_time = user.preferred_contact_time
        user.preferred_contact_methods = [method] if method else []
        user.preferred_contact_times = [contact_time] if contact_time else []
        user.save(update_fields=("preferred_contact_methods", "preferred_contact_times"))


def restore_single_contact_choices(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.all().iterator():
        methods = user.preferred_contact_methods or []
        times = user.preferred_contact_times or []
        user.preferred_contact_method = methods[0] if methods else ""
        user.preferred_contact_time = times[0] if times else ""
        user.save(update_fields=("preferred_contact_method", "preferred_contact_time"))


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_owner_profile_details"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="preferred_contact_methods",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="user",
            name="preferred_contact_times",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(copy_single_contact_choices, restore_single_contact_choices),
        migrations.RemoveField(
            model_name="user",
            name="preferred_contact_method",
        ),
        migrations.RemoveField(
            model_name="user",
            name="preferred_contact_time",
        ),
    ]
