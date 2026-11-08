"""
ASGI config: normal web requests go to Django, WebSocket connections go to
the Channels consumer that pushes real-time inventory updates.
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "medicine.settings")
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.urls import path  # noqa: E402

from inventory.consumers import InventoryConsumer  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(
            [path("ws/inventory/", InventoryConsumer.as_asgi())]
        ),
    }
)
