from django.conf import settings
from django.db import models


class Supplier(models.Model):
    supplier_name = models.CharField(max_length=120, unique=True)
    contact_person = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    gst_number = models.CharField(max_length=30, blank=True)

    def __str__(self):
        return self.supplier_name


class Medicine(models.Model):
    name = models.CharField(max_length=120, unique=True)
    generic_name = models.CharField(max_length=120, blank=True)
    category = models.CharField(max_length=80, blank=True)
    manufacturer = models.CharField(max_length=120, blank=True)
    dosage_form = models.CharField(max_length=30, blank=True)
    strength = models.CharField(max_length=50, blank=True)
    reorder_level = models.PositiveIntegerField(default=10)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Batch(models.Model):
    """One purchase = one batch. `quantity` is the stock currently available."""

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT)
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name="batches")
    batch_number = models.CharField(max_length=50)
    purchase_date = models.DateField()
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField()
    quantity = models.PositiveIntegerField()
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)
    remarks = models.TextField(blank=True)

    class Meta:
        unique_together = ("medicine", "batch_number")

    def __str__(self):
        return f"{self.medicine.name} - {self.batch_number}"


class StockMovement(models.Model):
    ISSUE, RETURN = "issue", "return"

    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name="movements")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.PROTECT, related_name="+",
    )
    kind = models.CharField(max_length=10)
    quantity = models.PositiveIntegerField()
    customer_name = models.CharField(max_length=120, blank=True)
    date = models.DateField()
    reason = models.CharField(max_length=200, blank=True)
    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.kind} {self.quantity} x {self.batch}"


class Profile(models.Model):
    ROLES = [
        ("Admin", "Admin"),
        ("Pharmacist", "Pharmacist"),
        ("Inventory Staff", "Inventory Staff"),
    ]
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    role = models.CharField(max_length=20, choices=ROLES, default="Inventory Staff")
    phone = models.CharField(max_length=20, blank=True, default="")

    def __str__(self):
        return f"{self.user.username} ({self.role})"
