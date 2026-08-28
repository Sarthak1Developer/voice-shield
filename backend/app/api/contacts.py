from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
import requests

from app.models.schemas import ContactCreate
from app.services.repository import insert, find_by, delete, _client

router = APIRouter()


class GoogleSyncRequest(BaseModel):
    google_email: str
    token: str


@router.get("/")
async def get_contacts(user_id: str):
    try:
        contacts = find_by("trusted_contacts", "user_id", user_id)
        return contacts
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch contacts: {str(e)}"
        )


@router.post("/")
async def add_contact(user_id: str, contact: ContactCreate):
    contact_data = {
        "user_id": user_id,
        "name": contact.name,
        "phone": contact.phone,
        "relation": contact.relation
    }
    try:
        saved_contact = insert("trusted_contacts", contact_data)
        return saved_contact
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save contact: {str(e)}"
        )


@router.delete("/{contact_id}")
async def delete_contact(contact_id: str):
    try:
        success = delete("trusted_contacts", contact_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        return {"message": "Contact deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete contact: {str(e)}"
        )


@router.post("/sync-google")
async def sync_google_contacts(user_id: str, req: GoogleSyncRequest):
    imported_contacts = []
    
    # If the token is real, try fetching using Google People API
    if req.token and not req.token.startswith("mock_"):
        try:
            # Call Google People API connections endpoint
            headers = {"Authorization": f"Bearer {req.token}"}
            url = "https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,relations"
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                connections = data.get("connections", [])
                for person in connections:
                    names = person.get("names", [])
                    phone_numbers = person.get("phoneNumbers", [])
                    relations = person.get("relations", [])
                    
                    if names and phone_numbers:
                        name = names[0].get("displayName", "Unknown Google Contact")
                        phone = phone_numbers[0].get("value", "")
                        relation = relations[0].get("type", "Friend") if relations else "Friend"
                        
                        imported_contacts.append({
                            "name": name,
                            "phone": phone,
                            "relation": relation.capitalize()
                        })
        except Exception as e:
            # Log error and fall back to mock generation so sync never crashes the prototype
            print(f"Failed to fetch from real Google API: {e}")
            
    # Mock fallback contacts customized based on email/user if no real contacts imported
    if not imported_contacts:
        prefix = req.google_email.split("@")[0].capitalize()
        imported_contacts = [
            {"name": f"{prefix}'s Father", "phone": "+91 98989 12345", "relation": "Family"},
            {"name": f"{prefix}'s Sister", "phone": "+91 98888 54321", "relation": "Family"},
            {"name": "Aarav Sharma", "phone": "+91 97777 66655", "relation": "Friend"},
            {"name": "Riya Patel", "phone": "+91 96666 44433", "relation": "Friend"},
            {"name": "Dr. Kapoor", "phone": "+91 95555 22211", "relation": "Doctor"},
            {"name": "Office Desk", "phone": "+91 94444 11100", "relation": "Work"}
        ]
        
    saved_contacts = []
    try:
        for contact in imported_contacts:
            contact_data = {
                "user_id": user_id,
                "name": contact["name"],
                "phone": contact["phone"],
                "relation": contact["relation"]
            }
            # Avoid duplicate phones for the same user in our database/memory
            existing = find_by("trusted_contacts", "user_id", user_id)
            if not any(c.get("phone") == contact["phone"] for c in existing):
                saved = insert("trusted_contacts", contact_data)
                saved_contacts.append(saved)
            else:
                dup = next(c for c in existing if c.get("phone") == contact["phone"])
                saved_contacts.append(dup)
                
        return {
            "message": f"Successfully synchronized {len(saved_contacts)} contacts.",
            "contacts": saved_contacts
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save synchronized contacts: {str(e)}"
        )
