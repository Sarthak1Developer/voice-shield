from fastapi import APIRouter, HTTPException

from app.models.schemas import UserCreate
from app.services.repository import get, insert

router = APIRouter()


@router.post("/")
async def create_user(user: UserCreate):
    return insert("profiles", user.model_dump())


@router.get("/{user_id}")
async def get_user(user_id: str):
    user = get("profiles", user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
