from rest_framework.permissions import SAFE_METHODS, BasePermission


def role_of(user):
    """Return 'Admin', 'Pharmacist' or 'Inventory Staff' (None if not logged in)."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "Admin"
    profile = getattr(user, "profile", None)
    return profile.role if profile else "Inventory Staff"


class RoleBasedPermission(BasePermission):
    """Everyone logged in can read. Only roles in view.write_roles can change data."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return role_of(request.user) in getattr(view, "write_roles", ())


class AdminOnly(BasePermission):
    def has_permission(self, request, view):
        return role_of(request.user) == "Admin"
