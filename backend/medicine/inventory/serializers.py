from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from .models import Batch, Medicine, Profile, StockMovement, Supplier
from .permissions import role_of

User = get_user_model()


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"


class MedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medicine
        fields = "__all__"


class BatchSerializer(serializers.ModelSerializer):
    # the front end sends and receives NAMES, not ids
    supplier = serializers.SlugRelatedField(
        slug_field="supplier_name", queryset=Supplier.objects.all()
    )
    medicine = serializers.SlugRelatedField(
        slug_field="name", queryset=Medicine.objects.all()
    )

    class Meta:
        model = Batch
        fields = "__all__"

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_expiry_date(self, value):
        if self.instance is None and value < timezone.localdate():
            raise serializers.ValidationError("This batch is already expired.")
        return value

    def validate(self, data):
        mfg = data.get("manufacturing_date", getattr(self.instance, "manufacturing_date", None))
        exp = data.get("expiry_date", getattr(self.instance, "expiry_date", None))
        if mfg and exp and exp < mfg:
            raise serializers.ValidationError("Expiry date must be after manufacturing date.")
        return data

    def update(self, instance, validated_data):
        medicine = validated_data.get("medicine", instance.medicine)
        number = validated_data.get("batch_number", instance.batch_number)
        if instance.movements.exists() and (
            medicine != instance.medicine or number != instance.batch_number
        ):
            raise serializers.ValidationError(
                "Medicine and batch number cannot change after stock movements."
            )

        if "quantity" in validated_data:  # quantity entered = total purchased
            moves = instance.movements
            issued = moves.filter(kind="issue").aggregate(t=Sum("quantity"))["t"] or 0
            returned = moves.filter(kind="return").aggregate(t=Sum("quantity"))["t"] or 0
            remaining = validated_data["quantity"] - issued + returned
            if remaining < 0:
                raise serializers.ValidationError(
                    "Purchased quantity cannot be less than units already issued."
                )
            validated_data["quantity"] = remaining
        return super().update(instance, validated_data)


class MovementSerializer(serializers.ModelSerializer):
    medicine = serializers.CharField(write_only=True)
    batch_number = serializers.CharField(write_only=True)
    quantity = serializers.IntegerField(min_value=1)

    class Meta:
        model = StockMovement
        fields = ["id", "medicine", "batch_number", "quantity",
                  "customer_name", "date", "reason", "remarks"]

    def to_representation(self, obj):
        data = super().to_representation(obj)
        data["medicine"] = obj.batch.medicine.name
        data["batch_number"] = obj.batch.batch_number
        data["performed_by"] = obj.user.username if obj.user else "—"
        return data


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="first_name", required=False, allow_blank=True)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Profile.ROLES, write_only=True)
    status = serializers.ChoiceField(
        choices=["Active", "Pending approval"], write_only=True, required=False
    )
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["id", "full_name", "username", "email", "phone",
                  "role", "status", "password"]

    def to_representation(self, user):
        data = super().to_representation(user)
        profile = getattr(user, "profile", None)
        data["role"] = role_of(user)
        data["phone"] = profile.phone if profile else ""
        data["status"] = "Active" if user.is_active else "Pending approval"
        return data

    def create(self, validated_data):
        role = validated_data.pop("role")
        phone = validated_data.pop("phone", "")
        status = validated_data.pop("status", "Active")
        password = validated_data.pop("password", "")
        if not password:
            raise serializers.ValidationError(
                {"password": "Password is required for a new user."}
            )
        user = User.objects.create_user(
            password=password, is_active=(status == "Active"), **validated_data
        )
        Profile.objects.create(user=user, role=role, phone=phone)
        return user

    def update(self, user, validated_data):
        role = validated_data.pop("role", None)
        phone = validated_data.pop("phone", None)
        status = validated_data.pop("status", None)
        password = validated_data.pop("password", "")
        request = self.context.get("request")
        if status and status != "Active" and request and user == request.user:
            raise serializers.ValidationError("You cannot deactivate your own account.")
        for key, value in validated_data.items():
            setattr(user, key, value)
        if password:
            user.set_password(password)
        if status:
            user.is_active = status == "Active"
        user.save()
        changes = {}
        if role:
            changes["role"] = role
        if phone is not None:
            changes["phone"] = phone
        if changes:
            Profile.objects.update_or_create(user=user, defaults=changes)
        return user
