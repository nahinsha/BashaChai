from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import User


class BasaChaiUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("email", "full_name")


class BasaChaiUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


@admin.register(User)
class BasaChaiUserAdmin(UserAdmin):
    add_form = BasaChaiUserCreationForm
    form = BasaChaiUserChangeForm
    model = User
    list_display = ("email", "full_name", "is_active", "is_staff", "is_superuser", "date_joined")
    list_filter = ("is_active", "is_staff", "is_superuser", "groups")
    search_fields = ("email", "full_name")
    ordering = ("email",)
    readonly_fields = ("date_joined", "last_login", "roles_display")
    actions = ("delete_selected",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("full_name", "profile_picture", "roles_display")}),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "full_name", "password1", "password2"),
            },
        ),
    )

    @admin.display(description="BasaChai roles")
    def roles_display(self, user):
        return ", ".join(user.roles) or "—"

    def delete_model(self, request, obj):
        # Keep the model and default manager delete guards in place outside admin.
        # The base manager's collector still enforces every PROTECT/RESTRICT relation.
        User._base_manager.using(obj._state.db).filter(pk=obj.pk).delete()

    def delete_queryset(self, request, queryset):
        User._base_manager.using(queryset.db).filter(pk__in=queryset.values("pk")).delete()
