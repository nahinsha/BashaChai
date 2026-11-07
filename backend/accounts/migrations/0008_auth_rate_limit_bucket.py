from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_seeker_family_and_permanent_address"),
    ]

    operations = [
        migrations.CreateModel(
            name="AuthRateLimitBucket",
            fields=[
                (
                    "key",
                    models.CharField(max_length=64, primary_key=True, serialize=False),
                ),
                ("window_started_at", models.DateTimeField()),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("count", models.PositiveIntegerField(default=0)),
            ],
            options={
                "db_table": "auth_rate_limit_buckets",
            },
        ),
    ]
