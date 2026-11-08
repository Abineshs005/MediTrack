# MediTrack: Real-Time Medicine Inventory, Batch and Expiry Tracking

A full-stack web application for tracking medicine stock, batches and expiry dates.
When one user issues or returns stock, every other signed-in user sees the change
instantly, with no page refresh.

> Portfolio project: Django REST backend, Django Channels (WebSockets), and a
> Bootstrap and JavaScript front end.

## Features

- **Real-time updates** over WebSockets for stock, purchases, issues and returns.
- **Medicine, supplier and batch management** with server-side validation.
- **Purchases create batches** (batch number, manufacturing and expiry dates, quantity, prices).
- **Issue and return stock**: the server rejects issues above available stock or from expired batches, and returns need a reason.
- **Expiry and low-stock tracking** with filters by medicine, category and status.
- **Login with roles** (Admin, Pharmacist, Inventory Staff), enforced on the server.
- **Registration with admin approval**: new accounts stay pending until an administrator activates them.
- **Audit trail**: every issue and return records the user who made it.
- **Reports**: CSV export and print or save as PDF.

## Roles

| Role | Permissions |
|---|---|
| Admin | Everything, including user management and approvals |
| Pharmacist | View all data, issue and return stock |
| Inventory Staff | View all data, manage medicines, suppliers and purchases |

## Tech stack

Python, Django, Django REST Framework, Django Channels, Daphne (ASGI), PostgreSQL
and Redis in production (SQLite locally), HTML, CSS, JavaScript, Bootstrap 5.

## How the real-time part works

```
Browser A --REST (issue stock)--> Django --> Database
                                     |
                         signal fires after save
                                     |
                       Channels group "inventory"
                                     |
Browser A, B, C <--WebSocket push----+  (each reloads the changed data)
```

## Project structure

```
meditrack/
├── frontend/            index.html, style.css, app.js, config.js
└── backend/medicine/    manage.py, requirements.txt
    ├── medicine/        settings, urls, asgi, wsgi
    └── inventory/       models, serializers, views, permissions,
                         services (stock rules), signals, consumers
```

## Run locally

```bash
cd backend
python -m venv venv
venv\Scripts\activate            # Windows   (macOS/Linux: source venv/bin/activate)
cd medicine
pip install -r requirements.txt
python manage.py makemigrations inventory
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Then open `frontend/index.html` with the VS Code **Live Server** extension
(`http://127.0.0.1:5500`) and sign in with the superuser.

## Deploy

See [DEPLOY.md](DEPLOY.md): front end on Vercel, backend (Daphne) on a host that
runs long-lived servers, with PostgreSQL and Redis.

## API overview

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login/` | Sign in, returns a token |
| `POST /api/auth/register/` | Request an account (needs admin approval) |
| `GET /api/auth/me/` | Current user and role |
| `/api/medicines/`, `/api/suppliers/`, `/api/batches/` | CRUD |
| `/api/issues/`, `/api/returns/` | Record stock movements |
| `/api/users/` | User management (Admin only) |
| `ws://HOST/ws/inventory/?token=...` | Real-time updates |

## Screenshots

![Login](screenshots/login.png)
![Dashboard](screenshots/dashboard.png)
![Medicine issue](screenshots/issue.png)
![Real-time updates across two windows](screenshots/realtime.png)
![Audit trail in the Django admin](screenshots/audit.png)

## Limitations

Learning project. Tokens do not expire, and password reset is done by an
administrator. Do not use it to make real medicine dispensing decisions.

## Author

Abinesh S: Python Full Stack Developer
