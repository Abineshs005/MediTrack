from django.urls import path
from rest_framework.routers import DefaultRouter

from .auth_views import LoginView, LogoutView, MeView, RegisterView
from .views import (BatchViewSet, IssueViewSet, MedicineViewSet,
                    ReturnViewSet, SupplierViewSet, UserViewSet)

router = DefaultRouter()
router.register("suppliers", SupplierViewSet)
router.register("medicines", MedicineViewSet)
router.register("batches", BatchViewSet)
router.register("issues", IssueViewSet, basename="issue")
router.register("returns", ReturnViewSet, basename="return")
router.register("users", UserViewSet)

urlpatterns = [
    path("auth/login/", LoginView.as_view()),
    path("auth/register/", RegisterView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
] + router.urls
