# Daily availability refresh

The Django management command `refresh_listing_availability` already applies the
approved seven-day rule. This systemd timer runs it every day at 00:15 Asia/Dhaka.
`Persistent=true` runs one catch-up execution after a host outage. The command's
database update changes only stale Published listings that are not already in
Needs Reconfirmation, so repeated or overlapping invocations do not repeatedly
process the same listing.

## Install on the backend host

These units target a Linux host running systemd. Install the application and its
virtual environment at `/opt/basachai/backend`, or edit the service's user,
working directory, and Python executable to match the deployment. The `basachai`
system user and group must exist.

Provide `/etc/basachai/backend.env` to systemd with the same Django and database
environment used by the web service, including `DJANGO_SECRET_KEY`,
`PASSWORD_RESET_FRONTEND_URL` (required when `DJANGO_DEBUG` is false), and the
required `DB_*` settings. Keep that deployment file outside the repository.

Copy both unit files to `/etc/systemd/system/`, then run:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now basachai-availability-refresh.timer
systemctl list-timers basachai-availability-refresh.timer
```

Inspect executions with:

```sh
sudo journalctl -u basachai-availability-refresh.service
```

The scheduler only changes availability status. It does not send notifications.
