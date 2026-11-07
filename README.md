# BasaChai

BasaChai is a rental housing platform with a Django REST API and a React/Vite
frontend.

## Local backend development

From `backend`, copy `.env.example` to `.env`, then opt in to local env loading
before starting Django:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
$env:BASACHAI_ENV = "development"
python manage.py runserver
```

The local `.env` is ignored by Git. Configure its database values for your local
PostgreSQL instance. A `DJANGO_SECRET_KEY` is not needed with `DJANGO_DEBUG=true`;
the development process creates a temporary key. Existing shell or IDE
environment values take precedence over `.env`. Production does not load this
file; it continues to require an explicit `DJANGO_SECRET_KEY` with
`DJANGO_DEBUG=false`.

## Deployment environment variables

Set backend variables in the Render service's environment settings. Set
frontend variables in the Vercel project's environment settings. Keep secret
values in those platforms; do not add them to this repository.

### Render backend

Required for production:

- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS` — comma-separated backend hostnames; do not use `*`.
- `DATABASE_URL`, or the individual `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
  `DB_HOST`, and `DB_PORT` settings.
- `SUPABASE_S3_ACCESS_KEY_ID`
- `SUPABASE_S3_SECRET_ACCESS_KEY`
- `SUPABASE_S3_ENDPOINT_URL` — must use HTTPS.
- `PASSWORD_RESET_FRONTEND_URL` — frontend origin used to construct reset links.
- `CORS_ALLOWED_ORIGINS` — comma-separated, exact frontend origins. Credentialed
  cross-origin requests are limited to these origins.

Set `DJANGO_DEBUG` to `false` in production (it defaults to false). If the
frontend origins differ from `CORS_ALLOWED_ORIGINS`, set
`CSRF_TRUSTED_ORIGINS` to the exact HTTPS origins too; otherwise it defaults to
`CORS_ALLOWED_ORIGINS`.

For SMTP password-reset email delivery, configure the mail service with:

- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `EMAIL_USE_TLS` or `EMAIL_USE_SSL` (enable at most one)
- `DEFAULT_FROM_EMAIL`

The production default `EMAIL_BACKEND` is Django's SMTP backend. You may set
`EMAIL_BACKEND` explicitly if using a different Django email backend.

Optional backend settings read from the environment:

- `JWT_SIGNING_KEY` — defaults to `DJANGO_SECRET_KEY`.
- `JWT_REFRESH_COOKIE_SAMESITE` — defaults to `None` in production and `Lax` in
  debug mode. Production cookies are Secure. `None` supports cross-site
  frontend/API origins, subject to browser third-party-cookie policies.
- `JWT_ACCESS_LIFETIME_MINUTES` and `JWT_REFRESH_LIFETIME_DAYS`.
- `DJANGO_SECURE_HSTS_SECONDS`, `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS`, and
  `DJANGO_SECURE_HSTS_PRELOAD`.
- `EMAIL_BACKEND` and `EMAIL_TIMEOUT`.
- `MESSAGE_ATTACHMENT_ROOT` for local filesystem storage in debug mode.
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` when not using
  `DATABASE_URL`.

Render supplies `PORT` to the web service. Do not define it as a secret.

### Vercel frontend

- `VITE_API_ROOT` — API base URL including `/api/v1`. Set it to the deployed
  backend API origin. The current Vercel rewrite serves the SPA and does not
  proxy API requests.

The backend must allow the exact deployed Vercel origin through
`CORS_ALLOWED_ORIGINS` and, when set separately, `CSRF_TRUSTED_ORIGINS`. Do not
use wildcard origins with credentialed cookies. If browser privacy settings
block cross-site cookies between the default Vercel and Render domains, use
same-site custom domains or a same-origin API proxy.
