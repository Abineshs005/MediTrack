from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Batch, StockMovement


def move_stock(kind, medicine, batch_number, quantity, **extra):
    """Issue or return stock. All checks happen here, on the server."""
    with transaction.atomic():
        try:
            batch = Batch.objects.select_for_update().get(
                medicine__name=medicine, batch_number=batch_number
            )
        except Batch.DoesNotExist:
            raise ValidationError("Choose a valid medicine batch.")

        if kind == StockMovement.ISSUE:
            if batch.expiry_date < timezone.localdate():
                raise ValidationError("This batch is expired and cannot be issued.")
            if quantity > batch.quantity:
                raise ValidationError("Insufficient stock for this issue.")
            batch.quantity -= quantity
        else:
            if not extra.get("reason"):
                raise ValidationError("Please enter the return reason.")
            batch.quantity += quantity

        batch.save(update_fields=["quantity"])
        return StockMovement.objects.create(
            batch=batch, kind=kind, quantity=quantity, **extra
        )
