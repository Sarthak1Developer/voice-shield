from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from uuid import uuid4

from app.models.schemas import RegisterRequest, LoginRequest
from app.services.repository import _client, insert, find_by

router = APIRouter()


@router.post("/register")
async def register(req: RegisterRequest):
    # Check if email is already registered in local profiles
    existing_email = find_by("profiles", "email", req.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if phone is already registered in local profiles
    if req.phone:
        existing_phone = find_by("profiles", "phone", req.phone)
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number already registered"
            )

    client = _client()
    user_id = str(uuid4())
    supabase_success = False

    if client:
        try:
            # Sign up in Supabase Auth (sends verification email)
            auth_response = client.auth.sign_up({
                "email": req.email,
                "password": req.password,
                "options": {
                    "data": {
                        "name": req.name,
                        "phone": req.phone
                    }
                }
            })
            if auth_response.user:
                user_id = auth_response.user.id
                supabase_success = True
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Supabase auth registration failed: {str(e)}"
            )

    # Save to the profiles table
    profile_data = {
        "id": user_id,
        "name": req.name,
        "email": req.email,
        "phone": req.phone,
        "role": "user"
    }
    
    try:
        saved_profile = insert("profiles", profile_data)
        return {
            "message": "Registration successful. Please verify your email if required.",
            "supabase_auth": supabase_success,
            "profile": saved_profile
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user profile: {str(e)}"
        )


@router.post("/login")
async def login(req: LoginRequest):
    username = req.username
    password = req.password

    # Resolve email from name if the input is not an email
    email = username
    profile = None

    if "@" not in username:
        profiles = find_by("profiles", "name", username)
        if not profiles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid username or password"
            )
        profile = profiles[0]
        email = profile["email"]
    else:
        profiles = find_by("profiles", "email", username)
        if not profiles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid email or password"
            )
        profile = profiles[0]

    client = _client()
    if client:
        try:
            # Login using Supabase Auth with resolved email
            auth_response = client.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            return {
                "message": "Login successful",
                "access_token": auth_response.session.access_token,
                "user": {
                    "id": auth_response.user.id,
                    "name": profile.get("name"),
                    "email": email,
                    "phone": profile.get("phone")
                }
            }
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Supabase login failed: {str(e)}"
            )
    else:
        # Local fallback login
        return {
            "message": "Login successful (local mock)",
            "access_token": f"mock-jwt-token-{profile['id']}",
            "user": {
                "id": profile["id"],
                "name": profile["name"],
                "email": profile["email"],
                "phone": profile.get("phone")
            }
        }

