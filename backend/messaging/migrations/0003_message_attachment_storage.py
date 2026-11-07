import messaging.models
from django.core.files.storage import storages
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("messaging", "0002_message_attachments"),
    ]

    operations = [
        migrations.AlterField(
            model_name="messageattachment",
            name="file",
            field=models.FileField(
                max_length=255,
                storage=storages["private_attachments"],
                upload_to=messaging.models.message_attachment_path,
            ),
        ),
    ]
