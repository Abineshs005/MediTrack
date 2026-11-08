from django.contrib import admin

from .models import Batch, Medicine, Profile, StockMovement, Supplier

admin.site.register(Supplier)
admin.site.register(Medicine)
admin.site.register(Batch)
admin.site.register(StockMovement)
admin.site.register(Profile)
