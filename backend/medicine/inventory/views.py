from django.contrib.auth import get_user_model
from django.db.models import ProtectedError
from rest_framework import mixins, viewsets
from rest_framework.exceptions import ValidationError
from .models import Supplier, Medicine, Batch, StockMovement
from .permissions import RoleBasedPermission, AdminOnly, role_of
from .signals import announce
from .serializers import (SupplierSerializer, MedicineSerializer, BatchSerializer,
                          MovementSerializer, UserSerializer)
from .services import move_stock

User = get_user_model()

STAFF_ROLES = ("Admin", "Inventory Staff")  # manage medicines, suppliers, purchases
STOCK_ROLES = ("Admin", "Pharmacist")       # issue and return stock


class SafeDeleteMixin:
    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            raise ValidationError(
                "This record is used by other records and cannot be deleted."
            )


class SupplierViewSet(SafeDeleteMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = STAFF_ROLES


class MedicineViewSet(SafeDeleteMixin, viewsets.ModelViewSet):
    queryset = Medicine.objects.all()
    serializer_class = MedicineSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = STAFF_ROLES


class BatchViewSet(SafeDeleteMixin, viewsets.ModelViewSet):
    queryset = Batch.objects.select_related("supplier", "medicine").all()
    serializer_class = BatchSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = STAFF_ROLES


class UserViewSet(SafeDeleteMixin, viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = UserSerializer
    permission_classes = [AdminOnly]

    def perform_create(self, serializer):
        user = serializer.save()
        announce("users", f"User added: {user.username} ({role_of(user)})")

    def perform_update(self, serializer):
        was_active = serializer.instance.is_active
        user = serializer.save()
        if not was_active and user.is_active:
            announce("users", f"User approved: {user.username}")
        elif was_active and not user.is_active:
            announce("users", f"User deactivated: {user.username}")
        else:
            announce("users", f"User updated: {user.username}")

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError("You cannot delete your own account.")
        instance.delete()


class MovementViewSet(mixins.ListModelMixin, mixins.CreateModelMixin,
                      viewsets.GenericViewSet):
    serializer_class = MovementSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = STOCK_ROLES
    kind = None

    def get_queryset(self):
        return (StockMovement.objects.filter(kind=self.kind)
                .select_related("batch__medicine", "user"))

    def perform_create(self, serializer):
        d = dict(serializer.validated_data)
        serializer.instance = move_stock(
            kind=self.kind,
            medicine=d.pop("medicine"),
            batch_number=d.pop("batch_number"),
            quantity=d.pop("quantity"),
            user=self.request.user,
            **d,
        )


class IssueViewSet(MovementViewSet):
    kind = "issue"


class ReturnViewSet(MovementViewSet):
    kind = "return"
