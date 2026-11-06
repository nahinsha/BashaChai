from django.core.management.base import BaseCommand

from listings.services import refresh_expired_availability


class Command(BaseCommand):
    help = "Set stale Published listings to Needs Reconfirmation."

    def handle(self, *args, **options):
        count = refresh_expired_availability()
        self.stdout.write(f"Updated {count} listing(s).")
