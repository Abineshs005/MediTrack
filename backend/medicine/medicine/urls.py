from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    """Simple check used by hosting platforms (and handy in the browser)."""
    return JsonResponse({"status": "ok", "app": "MediTrack API"})


urlpatterns = [
    path("", health),
    path("health/", health),
    path("admin/", admin.site.urls),
    path("api/", include("inventory.urls")),
]
