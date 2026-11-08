import re

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import Profile
from .permissions import role_of
from .signals import announce

User = get_user_model()
SIGNUP_ROLES = ("Inventory Staff", "Pharmacist")  # Admin is never self-service


def user_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.first_name or user.username,
        "role": role_of(user),
    }


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        user = authenticate(username=username, password=password)
        if user is None:
            inactive = User.objects.filter(username=username, is_active=False).first()
            if inactive and inactive.check_password(password):
                raise ValidationError({
                    "detail": "Your account is not active yet. Please wait for administrator approval."
                })
            raise ValidationError({"detail": "Invalid username or password."})
        token, _ = Token.objects.get_or_create(user=user)
        announce("users", f"{user.first_name or user.username} logged in")
        return Response({"token": token.key, "user": user_payload(user)})


class RegisterThrottle(AnonRateThrottle):
    rate = "20/hour"  # slows down people spamming the sign-up form


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RegisterThrottle]

    def post(self, request):
        data = request.data
        username = (data.get("username") or "").strip()
        full_name = (data.get("full_name") or "").strip()
        email = (data.get("email") or "").strip()
        phone = (data.get("phone") or "").strip()
        role = data.get("role") or "Inventory Staff"
        password = data.get("password") or ""

        if not (full_name and username and email and phone and password):
            raise ValidationError({"detail": "Please fill in every field."})
        if role not in SIGNUP_ROLES:
            raise ValidationError({
                "detail": "Choose Pharmacist or Inventory Staff. Admin accounts are created by an administrator."
            })
        if password != data.get("confirm_password"):
            raise ValidationError({"detail": "Passwords do not match."})
        try:
            UnicodeUsernameValidator()(username)
            validate_email(email)
        except DjangoValidationError:
            raise ValidationError({"detail": "Enter a valid username and email address."})
        if not re.fullmatch(r"\d{10,15}", re.sub(r"[\s+\-]", "", phone)):
            raise ValidationError({"detail": "Enter a valid phone number (10 to 15 digits)."})
        if User.objects.filter(username__iexact=username).exists():
            raise ValidationError({"detail": "That username is already taken."})

        candidate = User(username=username, first_name=full_name, email=email)
        try:
            validate_password(password, candidate)
        except DjangoValidationError as error:
            raise ValidationError({"detail": list(error.messages)})

        user = User.objects.create_user(
            username=username, email=email, first_name=full_name,
            password=password, is_active=False,  # waits for admin approval
        )
        Profile.objects.create(user=user, role=role, phone=phone)
        announce("users", f"New registration: {full_name} ({role}) is waiting for approval")
        return Response(
            {"detail": "Registration received. An administrator must approve your account before you can log in."},
            status=201,
        )


class MeView(APIView):
    def get(self, request):
        return Response(user_payload(request.user))


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
<<<<<<< HEAD
        return Response(status=204)
=======
        announce("users", f"{request.user.first_name or request.user.username} logged out")
        return Response(status=204)
>>>>>>> 43d68d3 (Add notifications, password toggle, deploy files; remove old requirements.txt)
