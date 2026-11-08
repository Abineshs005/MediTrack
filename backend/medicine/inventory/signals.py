from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Supplier, Medicine, Batch, StockMovement


def announce(resource, message, notify=True):
    """Tell every open browser to refresh `resource` and (if notify) show a bell notification."""
    layer = get_channel_layer()
    payload = {"type": "inventory.update", "resource": resource,
               "message": message, "notify": notify}
    # on_commit: only announce after the data is really saved
    transaction.on_commit(
        lambda: async_to_sync(layer.group_send)("inventory", payload)
    )


def _crud_notifications(model, resource, label, name_of):
    """Added / updated / deleted notifications for a simple model."""
    @receiver(post_save, sender=model, weak=False,
              dispatch_uid=f"{resource}_saved")
    def saved(sender, instance, created, **kwargs):
        verb = "added" if created else "updated"
        announce(resource, f"{label} {verb}: {name_of(instance)}")

    @receiver(post_delete, sender=model, weak=False,
              dispatch_uid=f"{resource}_deleted")
    def deleted(sender, instance, **kwargs):
        announce(resource, f"{label} deleted: {name_of(instance)}")


_crud_notifications(Supplier, "suppliers", "Supplier", str)
_crud_notifications(Medicine, "medicines", "Medicine", str)


# ---- purchases / batches ----
@receiver(post_save, sender=Batch)
def batch_saved(sender, instance, created, **kwargs):
    if created:
        announce("purchases",
                 f"Purchase added: {instance} ({instance.quantity} units from {instance.supplier})")
    elif kwargs.get("update_fields") == frozenset({"quantity"}):
        # stock changed by an issue/return: refresh pages quietly
        announce("purchases", f"Stock updated: {instance}", notify=False)
    else:
        announce("purchases",
                 f"Batch updated: {instance}, stock now {instance.quantity} units")


@receiver(post_delete, sender=Batch)
def batch_deleted(sender, instance, **kwargs):
    announce("purchases", f"Batch deleted: {instance}")


# ---- issue / return ----
@receiver(post_save, sender=StockMovement)
def movement_saved(sender, instance, created, **kwargs):
    if not created:
        return
    resource = "issues" if instance.kind == StockMovement.ISSUE else "returns"
    verb = "Issued" if instance.kind == StockMovement.ISSUE else "Returned"
    who = f" by {instance.user.username}" if instance.user else ""
    announce(resource, f"{verb} {instance.quantity} x {instance.batch}{who}")

    if instance.kind == StockMovement.ISSUE:
        batch = instance.batch
        limit = batch.medicine.reorder_level
        if batch.quantity <= limit:
            announce("purchases",
                     f"Low stock: {batch} has {batch.quantity} units left (reorder level {limit})")


@receiver(post_delete, sender=StockMovement)
def movement_deleted(sender, instance, **kwargs):
    resource = "issues" if instance.kind == StockMovement.ISSUE else "returns"
    announce(resource, f"{instance.kind.title()} record deleted", notify=False)


# ---- users ----
@receiver(post_delete, sender=get_user_model())
def user_deleted(sender, instance, **kwargs):
    announce("users", f"User deleted: {instance.username}")