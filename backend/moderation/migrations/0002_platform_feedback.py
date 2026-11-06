from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.db.models.functions.datetime


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_seeker_family_and_permanent_address"),
        ("moderation", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformFeedback",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("rating", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("message", models.CharField(max_length=2000)),
                ("status", models.CharField(choices=[("SUBMITTED", "Submitted"), ("UNDER_REVIEW", "Under review"), ("RESOLVED", "Resolved"), ("REJECTED", "Rejected")], db_default="SUBMITTED", default="SUBMITTED", max_length=20)),
                ("created_at", models.DateTimeField(db_default=django.db.models.functions.datetime.Now())),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("author", models.ForeignKey(db_column="author_id", on_delete=django.db.models.deletion.RESTRICT, related_name="platform_feedback_submissions", to=settings.AUTH_USER_MODEL)),
                ("reviewed_by", models.ForeignKey(blank=True, db_column="reviewed_by_id", null=True, on_delete=django.db.models.deletion.RESTRICT, related_name="reviewed_platform_feedback", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "platform_feedback",
                "ordering": ("-created_at", "-id"),
            },
        ),
        migrations.AddConstraint(
            model_name="platformfeedback",
            constraint=models.CheckConstraint(condition=models.Q(("message__regex", r"\S")), name="ck_platform_feedback_message"),
        ),
        migrations.AddConstraint(
            model_name="platformfeedback",
            constraint=models.CheckConstraint(condition=models.Q(("rating__isnull", True), models.Q(("rating__gte", 1), ("rating__lte", 5)), _connector="OR"), name="ck_platform_feedback_rating"),
        ),
        migrations.AddConstraint(
            model_name="platformfeedback",
            constraint=models.CheckConstraint(condition=models.Q(models.Q(("reviewed_at__isnull", True), ("reviewed_by__isnull", True), ("status", "SUBMITTED")), models.Q(("reviewed_at__isnull", False), ("reviewed_by__isnull", False), ("status__in", ("UNDER_REVIEW", "RESOLVED", "REJECTED"))), _connector="OR"), name="ck_platform_feedback_review_state"),
        ),
    ]
