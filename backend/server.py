from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ['JWT_ALGORITHM']
JWT_EXPIRATION_HOURS = int(os.environ['JWT_EXPIRATION_HOURS'])

# Plant.id Config
PLANT_ID_API_KEY = os.environ['PLANT_ID_API_KEY']
PLANT_ID_BASE_URL = "https://plant.id/api/v3"

# Straico Config
STRAICO_API_KEY = os.environ['STRAICO_API_KEY']
STRAICO_MODEL = os.environ.get('STRAICO_MODEL', 'openai/gpt-4o-mini')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Create the main app
app = FastAPI(title="LeafCheck API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ==================== MODELS ====================

class UserRegister(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class PlantIdentifyRequest(BaseModel):
    image_base64: str
    health_check: bool = True

class SavePlantRequest(BaseModel):
    species_name: str
    common_names: List[str] = []
    description: Optional[str] = None
    photo_base64: Optional[str] = None
    watering_info: Optional[str] = None
    light_condition: Optional[str] = None
    soil_type: Optional[str] = None
    toxicity: Optional[str] = None
    confidence: Optional[float] = None
    temperature: Optional[str] = None
    repot_cycle: Optional[str] = None
    prune_cycle: Optional[str] = None
    common_problems: Optional[str] = None
    health_status: Optional[str] = None
    health_details: Optional[str] = None
    diseases: Optional[List[dict]] = None

class PlantResponse(BaseModel):
    id: str
    user_id: str
    species_name: str
    common_names: List[str] = []
    description: Optional[str] = None
    photo_base64: Optional[str] = None
    watering_info: Optional[str] = None
    light_condition: Optional[str] = None
    soil_type: Optional[str] = None
    toxicity: Optional[str] = None
    confidence: Optional[float] = None
    last_watered: Optional[str] = None
    temperature: Optional[str] = None
    repot_cycle: Optional[str] = None
    prune_cycle: Optional[str] = None
    common_problems: Optional[str] = None
    health_status: Optional[str] = None
    health_details: Optional[str] = None
    diseases: Optional[List[dict]] = None
    created_at: str

class UpdatePlantCareRequest(BaseModel):
    watering_info: Optional[str] = None
    light_condition: Optional[str] = None
    soil_type: Optional[str] = None
    temperature: Optional[str] = None
    repot_cycle: Optional[str] = None
    prune_cycle: Optional[str] = None

class ChatMessage(BaseModel):
    plant_id: str
    message: str
    history: List[dict] = []

class WaterPlantRequest(BaseModel):
    watered_at: Optional[str] = None

class ReminderCreate(BaseModel):
    plant_id: str
    reminder_type: str = "watering"
    frequency_days: int = 3
    time_of_day: str = "09:00"
    enabled: bool = True

class ReminderUpdate(BaseModel):
    frequency_days: Optional[int] = None
    time_of_day: Optional[str] = None
    enabled: Optional[bool] = None

class ReminderResponse(BaseModel):
    id: str
    plant_id: str
    user_id: str
    reminder_type: str
    frequency_days: int
    time_of_day: str
    enabled: bool
    next_reminder: Optional[str] = None
    created_at: str


# ==================== AUTH HELPERS ====================

def create_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": pwd_context.hash(data.password),
        "created_at": now
    }
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id, data.email)
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=user_id, email=data.email, name=data.name, created_at=now)
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not pwd_context.verify(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["email"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=user["id"], email=user["email"], name=user["name"], created_at=user["created_at"])
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(id=user["id"], email=user["email"], name=user["name"], created_at=user["created_at"])


# ==================== PLANT IDENTIFICATION ====================

@api_router.post("/plants/identify")
async def identify_plant(data: PlantIdentifyRequest):
    """Identify plant using Plant.id API v3"""
    try:
        # Build request to Plant.id
        payload = {
            "images": [data.image_base64],
            "similar_images": True,
        }
        
        if data.health_check:
            payload["health"] = "all"
        
        details_params = "common_names,description,watering,best_watering,best_light_condition,best_soil_type,toxicity,image"
        
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.post(
                f"{PLANT_ID_BASE_URL}/identification?details={details_params}",
                json=payload,
                headers={
                    "Api-Key": PLANT_ID_API_KEY,
                    "Content-Type": "application/json"
                }
            )
        
        if response.status_code == 401:
            raise HTTPException(status_code=502, detail="Plant.id API key is invalid")
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Plant.id API credit limit reached")
        if response.status_code != 200 and response.status_code != 201:
            logger.error(f"Plant.id API error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=502, detail=f"Plant.id API error: {response.status_code}")
        
        result = response.json()
        
        # Parse the response
        is_plant = result.get("result", {}).get("is_plant", {})
        classification = result.get("result", {}).get("classification", {})
        disease_info = result.get("result", {}).get("disease", None)
        is_healthy = result.get("result", {}).get("is_healthy", None)
        
        suggestions = classification.get("suggestions", [])
        
        parsed_suggestions = []
        for s in suggestions[:5]:
            details = s.get("details", {})
            parsed_suggestions.append({
                "name": s.get("name", "Unknown"),
                "probability": s.get("probability", 0),
                "common_names": details.get("common_names", []),
                "description": details.get("description", {}).get("value") if isinstance(details.get("description"), dict) else details.get("description"),
                "watering": details.get("watering"),
                "best_watering": details.get("best_watering"),
                "best_light_condition": details.get("best_light_condition"),
                "best_soil_type": details.get("best_soil_type"),
                "toxicity": details.get("toxicity"),
                "image_url": details.get("image", {}).get("value") if isinstance(details.get("image"), dict) else details.get("image"),
            })
        
        # Parse disease info
        diseases = []
        if disease_info and disease_info.get("suggestions"):
            for d in disease_info["suggestions"][:5]:
                d_details = d.get("details", {})
                treatment = d_details.get("treatment", {})
                diseases.append({
                    "name": d.get("name", "Unknown"),
                    "probability": d.get("probability", 0),
                    "description": d_details.get("description") if isinstance(d_details.get("description"), str) else (d_details.get("description", {}).get("value") if isinstance(d_details.get("description"), dict) else None),
                    "is_harmful": d_details.get("is_harmful", True),
                    "treatment": {
                        "biological": treatment.get("biological") if isinstance(treatment, dict) else None,
                        "chemical": treatment.get("chemical") if isinstance(treatment, dict) else None,
                        "prevention": treatment.get("prevention") if isinstance(treatment, dict) else None,
                    } if treatment else None
                })
        
        return {
            "success": True,
            "is_plant": is_plant,
            "is_healthy": is_healthy,
            "suggestions": parsed_suggestions,
            "diseases": diseases,
            "top_match": parsed_suggestions[0] if parsed_suggestions else None,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Identification error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DIGITAL GARDEN ====================

@api_router.post("/garden", response_model=PlantResponse)
async def save_plant(data: SavePlantRequest, user: dict = Depends(get_current_user)):
    plant_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plant_doc = {
        "id": plant_id,
        "user_id": user["id"],
        "species_name": data.species_name,
        "common_names": data.common_names,
        "description": data.description,
        "photo_base64": data.photo_base64,
        "watering_info": data.watering_info,
        "light_condition": data.light_condition,
        "soil_type": data.soil_type,
        "toxicity": data.toxicity,
        "confidence": data.confidence,
        "temperature": data.temperature,
        "repot_cycle": data.repot_cycle,
        "prune_cycle": data.prune_cycle,
        "common_problems": data.common_problems,
        "health_status": data.health_status,
        "health_details": data.health_details,
        "diseases": data.diseases,
        "last_watered": None,
        "created_at": now
    }
    await db.plants.insert_one(plant_doc)
    return PlantResponse(**{k: v for k, v in plant_doc.items() if k != "_id"})

@api_router.get("/garden", response_model=List[PlantResponse])
async def get_garden(user: dict = Depends(get_current_user)):
    plants = await db.plants.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [PlantResponse(**p) for p in plants]

@api_router.get("/garden/{plant_id}", response_model=PlantResponse)
async def get_plant(plant_id: str, user: dict = Depends(get_current_user)):
    plant = await db.plants.find_one({"id": plant_id, "user_id": user["id"]}, {"_id": 0})
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return PlantResponse(**plant)

@api_router.delete("/garden/{plant_id}")
async def delete_plant(plant_id: str, user: dict = Depends(get_current_user)):
    result = await db.plants.delete_one({"id": plant_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plant not found")
    # Also delete associated reminders
    await db.reminders.delete_many({"plant_id": plant_id, "user_id": user["id"]})
    return {"success": True, "message": "Plant removed from garden"}

@api_router.post("/garden/{plant_id}/water")
async def water_plant(plant_id: str, data: WaterPlantRequest, user: dict = Depends(get_current_user)):
    watered_at = data.watered_at or datetime.now(timezone.utc).isoformat()
    result = await db.plants.update_one(
        {"id": plant_id, "user_id": user["id"]},
        {"$set": {"last_watered": watered_at}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plant not found")
    return {"success": True, "last_watered": watered_at}


# ==================== REMINDERS ====================

@api_router.post("/reminders", response_model=ReminderResponse)
async def create_reminder(data: ReminderCreate, user: dict = Depends(get_current_user)):
    # Verify plant exists
    plant = await db.plants.find_one({"id": data.plant_id, "user_id": user["id"]})
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    
    reminder_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    next_reminder = (now + timedelta(days=data.frequency_days)).isoformat()
    
    reminder_doc = {
        "id": reminder_id,
        "plant_id": data.plant_id,
        "user_id": user["id"],
        "reminder_type": data.reminder_type,
        "frequency_days": data.frequency_days,
        "time_of_day": data.time_of_day,
        "enabled": data.enabled,
        "next_reminder": next_reminder,
        "created_at": now.isoformat()
    }
    await db.reminders.insert_one(reminder_doc)
    return ReminderResponse(**{k: v for k, v in reminder_doc.items() if k != "_id"})

@api_router.get("/reminders", response_model=List[ReminderResponse])
async def get_reminders(user: dict = Depends(get_current_user)):
    reminders = await db.reminders.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return [ReminderResponse(**r) for r in reminders]

@api_router.put("/reminders/{reminder_id}", response_model=ReminderResponse)
async def update_reminder(reminder_id: str, data: ReminderUpdate, user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    if "frequency_days" in update_data:
        next_reminder = (datetime.now(timezone.utc) + timedelta(days=update_data["frequency_days"])).isoformat()
        update_data["next_reminder"] = next_reminder
    
    result = await db.reminders.update_one(
        {"id": reminder_id, "user_id": user["id"]},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    
    reminder = await db.reminders.find_one({"id": reminder_id}, {"_id": 0})
    return ReminderResponse(**reminder)

@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, user: dict = Depends(get_current_user)):
    result = await db.reminders.delete_one({"id": reminder_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"success": True}


# ==================== PLANT CARE UPDATE ====================

@api_router.put("/garden/{plant_id}/care", response_model=PlantResponse)
async def update_plant_care(plant_id: str, data: UpdatePlantCareRequest, user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.plants.update_one(
        {"id": plant_id, "user_id": user["id"]},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plant not found")
    plant = await db.plants.find_one({"id": plant_id}, {"_id": 0})
    return PlantResponse(**plant)


# ==================== AI BOTANIST CHAT ====================

@api_router.post("/chat")
async def ai_botanist_chat(data: ChatMessage, user: dict = Depends(get_current_user)):
    """AI Botanist chat using Straico API with GPT-4o-mini"""
    # Fetch plant data for context
    plant = await db.plants.find_one({"id": data.plant_id, "user_id": user["id"]}, {"_id": 0, "photo_base64": 0})
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    # Build system context
    plant_context = f"""You are LeafCheck AI Botanist, an expert plant care advisor.
You are helping the user with their plant: {plant.get('species_name', 'Unknown')}.

Plant Details:
- Species: {plant.get('species_name', 'Unknown')}
- Common Names: {', '.join(plant.get('common_names', []))}
- Description: {plant.get('description', 'N/A')}
- Watering: {plant.get('watering_info', 'N/A')}
- Light: {plant.get('light_condition', 'N/A')}
- Soil: {plant.get('soil_type', 'N/A')}
- Temperature: {plant.get('temperature', 'N/A')}
- Toxicity: {plant.get('toxicity', 'N/A')}
- Health Status: {plant.get('health_status', 'N/A')}
- Last Watered: {plant.get('last_watered', 'Never')}

Provide helpful, specific, and actionable plant care advice. Be friendly and concise.
If the user asks about disease treatment, provide practical remedies.
If unsure, recommend consulting a local plant nursery expert."""

    # Build the message with conversation history
    conversation = f"System: {plant_context}\n\n"
    for msg in data.history[-10:]:  # Keep last 10 messages
        role = msg.get("role", "user")
        content = msg.get("content", "")
        conversation += f"{'User' if role == 'user' else 'Assistant'}: {content}\n\n"
    conversation += f"User: {data.message}\n\nAssistant:"

    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.post(
                "https://api.straico.com/v1/prompt/completion",
                headers={
                    "Authorization": f"Bearer {STRAICO_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "models": [STRAICO_MODEL],
                    "message": conversation
                }
            )

        if response.status_code not in (200, 201):
            logger.error(f"Straico API error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=502, detail="AI service unavailable")

        result = response.json()
        completions = result.get("data", {}).get("completions", {})
        model_data = completions.get(STRAICO_MODEL, {})
        completion = model_data.get("completion", {})
        choices = completion.get("choices", [])

        if choices:
            ai_message = choices[0].get("message", {}).get("content", "")
        else:
            ai_message = "I'm sorry, I couldn't generate a response. Please try again."

        # Save chat to DB
        chat_id = str(uuid.uuid4())
        await db.chats.insert_one({
            "id": chat_id,
            "plant_id": data.plant_id,
            "user_id": user["id"],
            "user_message": data.message,
            "ai_response": ai_message,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        return {
            "success": True,
            "response": ai_message,
            "chat_id": chat_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/chat/{plant_id}/history")
async def get_chat_history(plant_id: str, user: dict = Depends(get_current_user)):
    """Get chat history for a plant"""
    chats = await db.chats.find(
        {"plant_id": plant_id, "user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return chats


# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "LeafCheck API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "leafcheck-api"}


# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
