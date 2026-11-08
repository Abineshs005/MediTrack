from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework.authtoken.models import Token


@database_sync_to_async
def user_for_token(key):
    try:
        return Token.objects.select_related("user").get(key=key).user
    except Token.DoesNotExist:
        return None


class InventoryConsumer(AsyncJsonWebsocketConsumer):
    group = "inventory"

    async def connect(self):
        query = parse_qs(self.scope["query_string"].decode())
        key = (query.get("token") or [""])[0]
        user = await user_for_token(key) if key else None
        if user is None or not user.is_active:
            await self.close(code=4401)  # not logged in: refuse
            return
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def inventory_update(self, event):
        await self.send_json(
            {"resource": event["resource"], "message": event["message"]}
        )
