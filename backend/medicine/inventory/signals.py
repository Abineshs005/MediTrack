"""Announce every change to all connected browsers (the real-time part)."""
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Batch, Medicine, StockMovement, Supplier


def announce(resource, message):
    layer = get_channel_layer()
    payload = {"type": "inventory.update", "resource": resource, "message": message}
    # on_commit: only announce after the data is really saved
    transaction.on_commit(
        lambda: async_to_sync(layer.group_send)("inventory", payload)
    )


@receiver([post_save, post_delete], sender=Supplier)
def supplier_changed(sender, instance, **kwargs):
    announce("suppliers", f"Supplier updated: {instance}")


@receiver([post_save, post_delete], sender=Medicine)
def medicine_changed(sender, instance, **kwargs):
    announce("medicines", f"Medicine updated: {instance}")


@receiver([post_save, post_delete], sender=Batch)
def batch_changed(sender, instance, **kwargs):
    announce("purchases", f"Stock updated: {instance} now {instance.quantity} units")


@receiver([post_save, post_delete], sender=StockMovement)
def movement_changed(sender, instance, **kwargs):
    resource = "issues" if instance.kind == "issue" else "returns"
    announce(resource, f"{instance.kind.title()}: {instance.quantity} x {instance.batch}")
