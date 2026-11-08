# Deploying MediTrack

Recommended split:

| Part | Where | Why |
|---|---|---|
| `frontend/` | **Vercel** (static site) | Plain HTML, CSS and JS: free and fast |
| `backend/medicine/` | A host that runs long-lived servers (**Render**, Railway or Fly.io) | Runs Daphne, so the WebSockets stay open |
| Database | **PostgreSQL** from the same host | SQLite files do not persist on hosted platforms |
| Broadcasts | **Redis** (key-value) from the same host | Lets every server process announce changes to every browser |

Vercel can also run Django with WebSockets (public beta), but connections are
capped in length and pinned to one instance, so the split above is more reliable.

The platforms change their menus often. The commands and variables below are the
stable part; look for the matching fields in each dashboard.

## 1. Push the project to GitHub

Make sure `db.sqlite3` and your virtual environment are NOT committed
(`.gitignore` handles this) and that `backend/medicine/inventory/migrations/`
IS committed (keep your `0001`, `0002`, `0003` files).

Check there are no model changes missing a migration (run locally):

```bash
python manage.py makemigrations --check --dry-run
```

It should say `No changes detected`.

## 2. Backend (example: Render)

1. Create a **PostgreSQL** database and a **Redis / Key Value** instance
   in the same region as the backend.
2. Create a **Web Service** from your GitHub repo:
   - Root directory: `backend/medicine`
   - Runtime: Python (set `PYTHON_VERSION` to 3.12 or newer, Django 6.1 needs it)
   - Build command:

     ```bash
     pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput && (python manage.py createsuperuser --noinput || true)
     ```

   - Start command:

     ```bash
     daphne -b 0.0.0.0 -p $PORT medicine.asgi:application
     ```

3. Environment variables:

| Variable | Value |
|---|---|
| `DJANGO_DEBUG` | `0` |
| `DJANGO_SECRET_KEY` | a long random string (never reuse the one from development) |
| `DJANGO_ALLOWED_HOSTS` | your backend host, e.g. `meditrack-api.onrender.com` |
| `DATABASE_URL` | the PostgreSQL connection string |
| `REDIS_URL` | the Redis connection string |
| `FRONTEND_ORIGINS` | your Vercel address, e.g. `https://meditrack.vercel.app` (no trailing slash) |
| `DJANGO_SUPERUSER_USERNAME` | your admin username |
| `DJANGO_SUPERUSER_PASSWORD` | a strong admin password |
| `DJANGO_SUPERUSER_EMAIL` | your email |

4. Deploy, then open `https://YOUR-BACKEND/health/`. You should see
   `{"status": "ok", ...}`.

## 3. Front end (Vercel)

1. In `frontend/config.js`, replace `https://YOUR-BACKEND-HOST.onrender.com`
   with your real backend address, commit and push.
2. In Vercel choose **Add New, Project**, import the repo and set:
   - Root Directory: `frontend`
   - Framework Preset: Other
   - Build command: none
3. Deploy, then copy the Vercel address into the backend's `FRONTEND_ORIGINS`
   variable and redeploy the backend once.

## 4. Test

1. Open the Vercel address and sign in with the admin account.
2. Open the site in two windows, issue stock in one, and watch the other update.
   The green **Live** badge must show in both.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Could not load data: Failed to fetch" | Wrong address in `config.js`, or `FRONTEND_ORIGINS` is missing or has a trailing slash |
| Badge says Offline | The backend is asleep or restarting (free plans sleep), or `REDIS_URL` is missing |
| `DisallowedHost` error | The backend host is missing from `DJANGO_ALLOWED_HOSTS` |
| Admin page has no styling | `collectstatic` did not run in the build command |
| Registration blocked after many tries | The sign-up form allows 20 attempts per hour per visitor |
