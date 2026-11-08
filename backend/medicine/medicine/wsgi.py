"""WSGI config (kept for tools that expect it; MediTrack itself runs on ASGI)."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "medicine.settings")

application = get_wsgi_application()
