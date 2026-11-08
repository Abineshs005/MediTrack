# Deploying MediTrack on Vercel

Two Vercel projects from the same GitHub repository:

| Project | Root Directory | What it is |
|---|---|---|
| `meditrack-api` | `backend/medicine` | Django + Channels (REST API and WebSockets) |
| `meditrack` | `frontend` | The website (static files) |

Plus two add-ons from the Vercel Marketplace: **PostgreSQL** and **Redis**.

## 0. Before you start

- The project is pushed to GitHub (`backend/medicine/inventory/migrations/` included, `db.sqlite3` and your virtual environment NOT included).
- Locally, `python manage.py makemigrations --check --dry-run` says `No changes detected`.

## 1. Backend project

1. Vercel: **Add New, Project**, import the repo.
2. Name: `meditrack-api`. **Root Directory: `backend/medicine`**. Framework should be detected as Django (it finds `manage.py`).
3. Environment variables (add them before the first deploy):

| Key | Value |
|---|---|
| `DJANGO_DEBUG` | `0` |
| `DJANGO_SECRET_KEY` | a long random string (not the development one) |
| `FRONTEND_ORIGINS` | add later, when the front end has an address |

4. Deploy. Vercel adds its own host name to Django's allowed hosts automatically.

## 2. Database and Redis

1. In the backend project, open **Storage** (or the Marketplace) and add a **PostgreSQL** database. Connect it to `meditrack-api`. Vercel sets `DATABASE_URL`.
2. Add a **Redis** database the same way. Make sure the project has a variable named exactly `REDIS_URL` holding the normal `redis://` or `rediss://` address (not a REST address). If the provider used another name, add `REDIS_URL` yourself with that value.
3. Redeploy the backend.

## 3. Create the tables and the admin user (once, from your computer)

Copy the `DATABASE_URL` value, then in the VS Code terminal:

```bash
cd backend\medicine
..\med\Scripts\activate
set DATABASE_URL=PASTE-THE-URL-HERE
python manage.py migrate
python manage.py createsuperuser
```

PowerShell uses `$env:DATABASE_URL="PASTE-THE-URL-HERE"` instead of `set`.

## 4. Check the backend

Open `https://YOUR-BACKEND/health/`. You should see `{"status": "ok", ...}`.

## 5. Front-end project

1. In `frontend/config.js`, put your backend address (no slash at the end) in place of `https://YOUR-BACKEND-HOST.onrender.com`, then commit and push.
2. Vercel: **Add New, Project**, same repo. **Root Directory: `frontend`**, Framework Preset: Other, no build command.
3. Deploy and copy its address.

## 6. Allow the front end

In the backend project set `FRONTEND_ORIGINS` to the front-end address (for example `https://meditrack.vercel.app`, no slash at the end) and redeploy the backend.

## 7. Test

Open the front-end address, sign in, and open it in a second window. Issue stock in one window and watch the other update. The green **Live** badge should show in both.

## Notes

- WebSocket connections close when the Vercel Function reaches its maximum duration. MediTrack reconnects every 3 seconds and reloads its data.
- Redis is required: without it, users connected to different function instances would not see each other's updates.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Failed to fetch" | Wrong address in `config.js`, or `FRONTEND_ORIGINS` missing or with a trailing slash |
| Badge says Offline, but data loads | `REDIS_URL` missing or wrong, or the WebSocket path is blocked. Tell me the Console message |
| `DisallowedHost` | Add the backend host to `DJANGO_ALLOWED_HOSTS` |
| Build says the Python version is too old | Add a `pyproject.toml` with `requires-python = ">=3.12"` |
| `ImproperlyConfigured: Set DJANGO_SECRET_KEY` | The variable is missing in the backend project |
