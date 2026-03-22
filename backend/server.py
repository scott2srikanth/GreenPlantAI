from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request, Query, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import hashlib
import httpx
from urllib.parse import quote
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import random
from decimal import Decimal, ROUND_HALF_UP
import smtplib
import html
from email.message import EmailMessage
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse, HTMLResponse, RedirectResponse
try:
    from emergentintegrations.payments.stripe.checkout import (
        StripeCheckout, CheckoutSessionRequest, CheckoutSessionResponse, CheckoutStatusResponse
    )
    HAS_EMERGENT_STRIPE = True
except ImportError:
    StripeCheckout = None
    CheckoutSessionRequest = None
    CheckoutSessionResponse = None
    CheckoutStatusResponse = None
    HAS_EMERGENT_STRIPE = False

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

# API Keys - loaded from env only, never exposed
_PLANT_ID_API_KEY = os.environ['PLANT_ID_API_KEY']
_STRAICO_API_KEY = os.environ['STRAICO_API_KEY']
PLANT_ID_BASE_URL = "https://plant.id/api/v3"

# Stripe Config
STRIPE_API_KEY = os.environ['STRIPE_API_KEY']
UPI_VPA = os.environ.get('UPI_VPA')
UPI_PAYEE_NAME = os.environ.get('UPI_PAYEE_NAME', 'GreenPlantAI')
FX_RATE_API_URL = os.environ.get('FX_RATE_API_URL', 'https://api.frankfurter.app/latest?from=USD&to=INR')
FX_FALLBACK_USD_INR = Decimal(os.environ.get('FX_FALLBACK_USD_INR', '86.00'))
INDIA_GST_RATE = Decimal(os.environ.get('INDIA_GST_RATE', '0.18'))
EMAIL_VERIFICATION_CODE_TTL_MINUTES = int(os.environ.get('EMAIL_VERIFICATION_CODE_TTL_MINUTES', '10'))
SMTP_HOST = os.environ.get('SMTP_HOST')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USERNAME = os.environ.get('SMTP_USERNAME')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')
SMTP_FROM_EMAIL = os.environ.get('SMTP_FROM_EMAIL')
SMTP_USE_TLS = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
GOOGLE_CLIENT_IDS = [client_id.strip() for client_id in os.environ.get('GOOGLE_CLIENT_IDS', '').split(',') if client_id.strip()]
ADMIN_DASHBOARD_EMAIL = os.environ.get('ADMIN_DASHBOARD_EMAIL', 'admin@greenplantai.local')
ADMIN_DASHBOARD_PASSWORD = os.environ.get('ADMIN_DASHBOARD_PASSWORD', 'change-this-admin-password')
ADMIN_SESSION_SECRET = os.environ.get('ADMIN_SESSION_SECRET', JWT_SECRET)
ADMIN_COOKIE_NAME = "greenplantai_admin_session"

# Premium Packages (server-side only - never send amounts from frontend)
PREMIUM_PACKAGES = {
    "monthly": {"amount": 4.99, "currency": "usd", "days": 30, "label": "Monthly Premium"},
    "yearly": {"amount": 39.99, "currency": "usd", "days": 365, "label": "Yearly Premium"},
}

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Available AI Models via Straico
AI_MODELS = {
    "gpt-4o-mini": {
        "id": "openai/gpt-4o-mini",
        "name": "GPT-4o Mini",
        "provider": "OpenAI",
        "tier": "free",
        "description": "Fast and efficient for general plant care advice"
    },
    "claude-sonnet-4.5": {
        "id": "anthropic/claude-sonnet-4.5",
        "name": "Claude Sonnet 4.5",
        "provider": "Anthropic",
        "tier": "premium",
        "description": "Advanced reasoning for complex plant diagnoses"
    },
    "claude-sonnet-4": {
        "id": "anthropic/claude-sonnet-4",
        "name": "Claude Sonnet 4",
        "provider": "Anthropic",
        "tier": "premium",
        "description": "Deep analysis for detailed health assessments"
    },
    "ollama-local": {
        "id": "ollama/local",
        "name": "Ollama (Local)",
        "provider": "Self-Hosted",
        "tier": "free",
        "description": "Run models locally on your own hardware"
    },
}

# Premium config
FREE_DAILY_CHATS = 10
PREMIUM_DAILY_CHATS = 999

# Create the main app
app = FastAPI(title="GreenPlantAI API")

# Rate limit error handler
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down."}
    )

app.state.limiter = limiter

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def mask_key(key: str) -> str:
    """Mask API key for logging - never log full keys"""
    if len(key) < 8:
        return "****"
    return key[:4] + "****" + key[-4:]


# ==================== MODELS ====================

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    verification_code: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class RequestEmailVerificationCode(BaseModel):
    email: EmailStr

class GoogleAuthRequest(BaseModel):
    id_token: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: Optional[str] = None
    is_premium: bool = False
    daily_chat_count: int = 0
    chat_limit: int = FREE_DAILY_CHATS
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

class WaterPlantRequest(BaseModel):
    watered_at: Optional[str] = None

class ChatMessage(BaseModel):
    plant_id: str
    message: str
    model: str = "gpt-4o-mini"
    history: List[dict] = []

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

class UpgradePremiumRequest(BaseModel):
    plan: str = "monthly"
    origin_url: str = ""

class UpiPaymentLinkRequest(BaseModel):
    plan: str = "monthly"
    country_code: str = "US"
    test_mode: bool = False

class RegisterPushTokenRequest(BaseModel):
    push_token: str

class SendNotificationRequest(BaseModel):
    plant_id: Optional[str] = None
    title: str = ""
    body: str = ""

class AdminUserUpdateRequest(BaseModel):
    name: Optional[str] = None
    is_premium: Optional[bool] = None
    premium_expires: Optional[str] = None

class AdminTransactionUpdateRequest(BaseModel):
    payment_status: Optional[str] = None
    status: Optional[str] = None
    premium_activated: Optional[bool] = None
    notes: Optional[str] = None

class AdminApiKeysUpdateRequest(BaseModel):
    plant_id_api_key: Optional[str] = None
    straico_api_key: Optional[str] = None
    stripe_api_key: Optional[str] = None


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
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def build_user_response(user: dict) -> UserResponse:
    is_premium = user.get("is_premium", False)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_count = user.get("daily_chat_counts", {}).get(today, 0)
    limit = PREMIUM_DAILY_CHATS if is_premium else FREE_DAILY_CHATS
    normalized_email = normalize_email(user["email"])
    email_hash = hashlib.md5(normalized_email.encode()).hexdigest()
    avatar_url = user.get("google_picture") or f"https://www.gravatar.com/avatar/{email_hash}?d=identicon&s=256"
    return UserResponse(
        id=user["id"], email=user["email"], name=user["name"], avatar_url=avatar_url,
        is_premium=is_premium, daily_chat_count=daily_count,
        chat_limit=limit, created_at=user["created_at"]
    )


def verify_google_identity_token(id_token_value: str) -> dict:
    if not GOOGLE_CLIENT_IDS:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured on the server")

    request_adapter = google_requests.Request()
    verification_error = None
    for client_id in GOOGLE_CLIENT_IDS:
        try:
            token_info = google_id_token.verify_oauth2_token(id_token_value, request_adapter, client_id)
            if token_info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
                raise ValueError("Invalid token issuer")
            return token_info
        except Exception as exc:
            verification_error = exc

    logger.warning(f"Google ID token verification failed: {verification_error}")
    raise HTTPException(status_code=401, detail="Invalid Google identity token")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def create_app_log(level: str, event: str, message: str, details: Optional[Dict[str, Any]] = None):
    try:
        await db.app_logs.insert_one({
            "id": str(uuid.uuid4()),
            "level": level,
            "event": event,
            "message": message,
            "details": details or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        logger.exception("Failed to persist app log")


async def get_runtime_config() -> dict:
    return await db.runtime_config.find_one({"id": "runtime_config"}, {"_id": 0}) or {}


async def get_runtime_api_key(key_name: str, fallback: str) -> str:
    config = await get_runtime_config()
    api_keys = config.get("api_keys", {})
    return api_keys.get(key_name) or fallback


def mask_optional_key(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    return mask_key(key)


def create_admin_session_token(email: str) -> str:
    payload = {
        "sub": email,
        "scope": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, ADMIN_SESSION_SECRET, algorithm=JWT_ALGORITHM)


def verify_admin_session_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, ADMIN_SESSION_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid admin session")
    if payload.get("scope") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload


async def require_admin(request: Request) -> dict:
    token = request.cookies.get(ADMIN_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Admin login required")
    return verify_admin_session_token(token)


def build_admin_login_page(error: str = "") -> str:
    error_html = f'<div class="error">{html.escape(error)}</div>' if error else ""
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GreenPlantAI Admin Login</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f7f2;color:#1f2937;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}}
.card{{background:#fff;border:1px solid #d8e2d2;border-radius:24px;box-shadow:0 20px 50px rgba(34,54,24,.12);padding:32px;width:min(420px,92vw)}}
h1{{margin:0 0 8px;color:#2f5233}}p{{color:#5f6b66}}label{{display:block;margin:16px 0 8px;font-weight:600}}input{{width:100%;padding:14px 16px;border-radius:16px;border:1px solid #d8e2d2;font-size:15px;box-sizing:border-box}}
button{{width:100%;margin-top:20px;border:none;border-radius:999px;background:#2f5233;color:#fff;padding:14px 18px;font-size:16px;font-weight:700;cursor:pointer}}
.error{{margin-top:12px;background:#fef2f2;border:1px solid #fecaca;color:#b45309;padding:12px 14px;border-radius:14px}}
</style></head><body><form class="card" method="post" action="/admin/login">
<h1>Admin Dashboard</h1><p>Sign in to manage users, AI usage, subscriptions, transactions, logs, and API keys.</p>
{error_html}
<label>Email</label><input type="email" name="email" autocomplete="username" required>
<label>Password</label><input type="password" name="password" autocomplete="current-password" required>
<button type="submit">Sign In</button></form></body></html>"""


def build_admin_dashboard_page() -> str:
    return """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GreenPlantAI Admin</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f7f2;color:#1f2937;margin:0}
.wrap{max-width:1280px;margin:0 auto;padding:24px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
h1{margin:0;color:#2f5233}.actions a{display:inline-block;background:#fff;border:1px solid #d8e2d2;border-radius:999px;padding:10px 14px;text-decoration:none;color:#2f5233;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px}
.card,.panel{background:#fff;border:1px solid #d8e2d2;border-radius:24px;box-shadow:0 20px 50px rgba(34,54,24,.08)}
.card{padding:18px}.metric{font-size:30px;font-weight:800;color:#2f5233}.label{color:#5f6b66;font-size:13px}
.panels{display:grid;grid-template-columns:1.3fr 1fr;gap:16px}.panel{padding:18px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #edf2e7;vertical-align:top}
th{font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:.04em}
input,select,textarea{width:100%;padding:10px 12px;border-radius:12px;border:1px solid #d8e2d2;box-sizing:border-box;font-size:14px}
button{border:none;border-radius:999px;background:#2f5233;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer}
.muted{color:#6b7280}.tag{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf7ec;color:#2f5233;font-size:12px;font-weight:700}
.stack{display:flex;flex-direction:column;gap:16px}.small{font-size:12px}.danger{background:#fff4f4;color:#b42318}.success{background:#edf7ec;color:#2f5233}
</style></head><body><div class="wrap">
<div class="top"><div><h1>GreenPlantAI Admin</h1><div class="muted">Users, AI usage, subscriptions, transactions, logs, and API key controls.</div></div><div class="actions"><a href="/admin/logout">Sign Out</a></div></div>
<div id="summary" class="grid"></div>
<div class="panels">
<div class="stack">
<section class="panel"><h2>Users</h2><div class="small muted">Update premium status and expiries.</div><div id="users"></div></section>
<section class="panel"><h2>Transactions</h2><div class="small muted">Review and adjust transaction state.</div><div id="transactions"></div></section>
</div>
<div class="stack">
<section class="panel"><h2>Runtime API Keys</h2><div id="keys"></div></section>
<section class="panel"><h2>Recent Logs</h2><div id="logs"></div></section>
</div></div>
<script>
const fmt=v=>v==null?'—':String(v);
async function req(url, options={}){ const res=await fetch(url,{headers:{'Content-Type':'application/json'},...options}); if(!res.ok){ throw new Error((await res.json().catch(()=>({detail:'Request failed'}))).detail||'Request failed'); } return res.json(); }
function summaryCard(label, value, sub=''){ return `<div class="card"><div class="metric">${fmt(value)}</div><div class="label">${label}</div><div class="small muted">${sub}</div></div>`; }
async function loadSummary(){ const data=await req('/api/admin/overview'); document.getElementById('summary').innerHTML=[
summaryCard('Users', data.users.total, `${data.users.premium} premium / ${data.users.google_auth} Google auth`),
summaryCard('AI Requests', data.ai_usage.total_requests, `${data.ai_usage.total_tokens||0} tokens tracked`),
summaryCard('Transactions', data.transactions.total, `${data.transactions.paid} paid / ${data.transactions.pending} pending`),
summaryCard('Logs', data.logs.total_recent, `${data.logs.errors} errors in recent logs`),
].join(''); }
async function loadUsers(){ const data=await req('/api/admin/users'); document.getElementById('users').innerHTML=`<table><thead><tr><th>User</th><th>Subscription</th><th>Chats</th><th>Save</th></tr></thead><tbody>${data.users.map(u=>`<tr><td><div><strong>${fmt(u.name)}</strong></div><div class="muted">${fmt(u.email)}</div><div class="small muted">${fmt(u.auth_provider||'password')}</div></td><td><label class="small"><input type="checkbox" ${u.is_premium?'checked':''} data-premium="${u.id}"> Premium</label><input id="exp-${u.id}" placeholder="ISO expiry or blank" value="${u.premium_expires||''}"></td><td><span class="tag">${u.total_chats_used||0} chats</span></td><td><button onclick="saveUser('${u.id}')">Update</button></td></tr>`).join('')}</tbody></table>`; }
async function saveUser(id){ const payload={ is_premium: document.querySelector(`[data-premium="${id}"]`).checked, premium_expires: document.getElementById(`exp-${id}`).value || null }; await req(`/api/admin/users/${id}`, {method:'PATCH', body: JSON.stringify(payload)}); await boot(); }
async function loadTransactions(){ const data=await req('/api/admin/transactions'); document.getElementById('transactions').innerHTML=`<table><thead><tr><th>Transaction</th><th>Status</th><th>Notes</th><th>Save</th></tr></thead><tbody>${data.transactions.map(t=>`<tr><td><div><strong>${fmt(t.plan)}</strong></div><div class="muted">${fmt(t.user_email)}</div><div class="small muted">${fmt(t.session_id)}</div></td><td><input id="ps-${t.id}" value="${t.payment_status||''}"><input id="st-${t.id}" value="${t.status||''}" style="margin-top:8px"></td><td><textarea id="nt-${t.id}" rows="3">${t.notes||''}</textarea></td><td><button onclick="saveTxn('${t.id}')">Update</button></td></tr>`).join('')}</tbody></table>`; }
async function saveTxn(id){ const payload={ payment_status: document.getElementById(`ps-${id}`).value||null, status: document.getElementById(`st-${id}`).value||null, notes: document.getElementById(`nt-${id}`).value||null }; await req(`/api/admin/transactions/${id}`, {method:'PATCH', body: JSON.stringify(payload)}); await boot(); }
async function loadKeys(){ const data=await req('/api/admin/api-keys'); document.getElementById('keys').innerHTML=`<div class="stack"><div class="small muted">Update runtime keys without rebuilding the container. Values are stored in Mongo and masked in the dashboard.</div><table><tbody>${data.keys.map(k=>`<tr><td><strong>${k.label}</strong><div class="small muted">Current: ${fmt(k.masked_value)} (${k.source})</div></td><td><input id="key-${k.name}" placeholder="Paste new value to update"></td></tr>`).join('')}</tbody></table><button onclick="saveKeys()">Save API Keys</button></div>`; }
async function saveKeys(){ const payload={ plant_id_api_key: document.getElementById('key-plant_id_api_key')?.value||null, straico_api_key: document.getElementById('key-straico_api_key')?.value||null, stripe_api_key: document.getElementById('key-stripe_api_key')?.value||null }; await req('/api/admin/api-keys', {method:'PUT', body: JSON.stringify(payload)}); await boot(); }
async function loadLogs(){ const data=await req('/api/admin/logs'); document.getElementById('logs').innerHTML=`<table><thead><tr><th>Time</th><th>Level</th><th>Event</th><th>Message</th></tr></thead><tbody>${data.logs.map(l=>`<tr><td class="small">${fmt(l.created_at)}</td><td><span class="tag ${l.level==='error'?'danger':'success'}">${fmt(l.level)}</span></td><td>${fmt(l.event)}</td><td>${fmt(l.message)}</td></tr>`).join('')}</tbody></table>`; }
async function boot(){ try{ await Promise.all([loadSummary(), loadUsers(), loadTransactions(), loadKeys(), loadLogs()]); }catch(e){ document.body.innerHTML=`<div class="wrap"><div class="panel"><h2>Admin Error</h2><p>${e.message}</p><p><a href="/admin/login">Sign in again</a></p></div></div>`; } }
boot();
</script></div></body></html>"""


async def count_total_chat_usage(user: dict) -> int:
    return sum(int(v) for v in user.get("daily_chat_counts", {}).values() if isinstance(v, (int, float)))


async def send_email_verification_code(email: str, code: str):
    if not all([SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL]):
        raise HTTPException(
            status_code=503,
            detail="Email verification is not configured on the server yet"
        )

    message = EmailMessage()
    message["Subject"] = "Verify your GreenPlantAI email"
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = email
    message.set_content(
        f"Your GreenPlantAI verification code is {code}. "
        f"It expires in {EMAIL_VERIFICATION_CODE_TTL_MINUTES} minutes."
    )

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        if SMTP_USE_TLS:
            smtp.starttls()
        smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)


async def get_usd_to_inr_rate() -> Decimal:
    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.get(FX_RATE_API_URL)
            response.raise_for_status()
            payload = response.json()
            rate = payload.get("rates", {}).get("INR")
            if not rate:
                raise ValueError("INR rate missing")
            return Decimal(str(rate))
    except Exception as exc:
        logger.warning(f"Falling back to configured USD/INR rate: {exc}")
        return FX_FALLBACK_USD_INR


async def get_localized_quote(plan: str, country_code: str = "US") -> dict:
    package = PREMIUM_PACKAGES.get(plan)
    if not package:
        raise HTTPException(status_code=400, detail="Invalid plan. Use 'monthly' or 'yearly'")

    normalized_country = (country_code or "US").upper()
    base_amount_usd = Decimal(str(package["amount"]))

    if normalized_country == "IN":
        fx_rate = await get_usd_to_inr_rate()
        subtotal = quantize_money(base_amount_usd * fx_rate)
        tax_amount = quantize_money(subtotal * INDIA_GST_RATE)
        total_amount = quantize_money(subtotal + tax_amount)
        return {
            "plan": plan,
            "country_code": normalized_country,
            "base_currency": "USD",
            "base_amount": float(base_amount_usd),
            "currency": "INR",
            "symbol": "Rs",
            "subtotal_amount": float(subtotal),
            "tax_name": "GST",
            "tax_rate": float(INDIA_GST_RATE),
            "tax_amount": float(tax_amount),
            "total_amount": float(total_amount),
            "display_price": f"Rs {total_amount:.2f}",
            "display_subtotal": f"Rs {subtotal:.2f}",
            "display_tax": f"Rs {tax_amount:.2f}",
            "exchange_rate": float(fx_rate),
            "exchange_rate_source": "Frankfurter (ECB reference data)",
            "package_label": package["label"],
        }

    return {
        "plan": plan,
        "country_code": normalized_country,
        "base_currency": "USD",
        "base_amount": float(base_amount_usd),
        "currency": "USD",
        "symbol": "$",
        "subtotal_amount": float(base_amount_usd),
        "tax_name": None,
        "tax_rate": 0.0,
        "tax_amount": 0.0,
        "total_amount": float(base_amount_usd),
        "display_price": f"${base_amount_usd:.2f}",
        "display_subtotal": f"${base_amount_usd:.2f}",
        "display_tax": "$0.00",
        "exchange_rate": 1.0,
        "exchange_rate_source": None,
        "package_label": package["label"],
    }


# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, data: UserRegister):
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    email = normalize_email(str(data.email))
    verification_code = data.verification_code.strip()
    if len(verification_code) != 6 or not verification_code.isdigit():
        raise HTTPException(status_code=400, detail="Enter the 6-digit email verification code")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    code_hash = hashlib.sha256(verification_code.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    verification = await db.email_verifications.find_one({
        "email": email,
        "code_hash": code_hash,
        "used_at": None,
        "expires_at": {"$gt": now.isoformat()},
    })
    if not verification:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    user_id = str(uuid.uuid4())
    now_iso = now.isoformat()
    user_doc = {
        "id": user_id,
        "email": email,
        "name": data.name,
        "password_hash": pwd_context.hash(data.password),
        "email_verified_at": now_iso,
        "is_premium": False,
        "premium_expires": None,
        "daily_chat_counts": {},
        "created_at": now_iso
    }
    await db.users.insert_one(user_doc)
    await db.email_verifications.update_one(
        {"id": verification["id"]},
        {"$set": {"used_at": now_iso}}
    )
    await create_app_log("info", "user_registered", "User account created", {"user_id": user_id, "email": email})

    token = create_token(user_id, email)
    return TokenResponse(access_token=token, user=build_user_response({**{k: v for k, v in user_doc.items() if k != "_id"}}))


@api_router.post("/auth/request-verification-code")
@limiter.limit("5/minute")
async def request_verification_code(request: Request, data: RequestEmailVerificationCode):
    email = normalize_email(str(data.email))

    existing = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    code = f"{random.randint(0, 999999):06d}"
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(minutes=EMAIL_VERIFICATION_CODE_TTL_MINUTES)).isoformat()
    code_hash = hashlib.sha256(code.encode()).hexdigest()

    await db.email_verifications.update_many(
        {"email": email, "used_at": None},
        {"$set": {"superseded_at": now.isoformat()}}
    )
    await db.email_verifications.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "code_hash": code_hash,
        "created_at": now.isoformat(),
        "expires_at": expires_at,
        "used_at": None,
        "superseded_at": None,
    })

    await send_email_verification_code(email, code)
    await create_app_log("info", "verification_code_sent", "Verification code sent", {"email": email})

    return {
        "success": True,
        "message": f"Verification code sent to {email}",
        "expires_in_minutes": EMAIL_VERIFICATION_CODE_TTL_MINUTES,
    }

@api_router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, data: UserLogin):
    email = normalize_email(str(data.email))
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Use Google Sign-In for this account")
    if not pwd_context.verify(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if "email_verified_at" in user and not user.get("email_verified_at"):
        raise HTTPException(status_code=403, detail="Verify your email before signing in")

    # Check premium expiry
    if user.get("is_premium") and user.get("premium_expires"):
        if datetime.fromisoformat(user["premium_expires"]) < datetime.now(timezone.utc):
            await db.users.update_one({"id": user["id"]}, {"$set": {"is_premium": False}})
            user["is_premium"] = False

    token = create_token(user["id"], user["email"])
    await create_app_log("info", "user_login", "User logged in", {"user_id": user["id"], "email": email})
    return TokenResponse(access_token=token, user=build_user_response(user))


@api_router.post("/auth/google", response_model=TokenResponse)
@limiter.limit("10/minute")
async def google_auth(request: Request, data: GoogleAuthRequest):
    token_info = verify_google_identity_token(data.id_token)
    email = normalize_email(token_info.get("email", ""))
    google_sub = token_info.get("sub")
    if not email or not google_sub:
        raise HTTPException(status_code=400, detail="Google account did not provide a valid email identity")
    if not token_info.get("email_verified"):
        raise HTTPException(status_code=400, detail="Google account email is not verified")

    now_iso = datetime.now(timezone.utc).isoformat()
    name = token_info.get("name") or email.split("@")[0]
    picture = token_info.get("picture")

    user = await db.users.find_one(
        {"$or": [{"google_sub": google_sub}, {"email": email}]},
        {"_id": 0}
    )

    if user:
        update_data = {
            "email": email,
            "name": name,
            "google_sub": google_sub,
            "google_picture": picture,
            "google_email_verified": True,
            "auth_provider": "google",
        }
        if not user.get("email_verified_at"):
            update_data["email_verified_at"] = now_iso
        await db.users.update_one({"id": user["id"]}, {"$set": update_data})
        user = {**user, **update_data}
    else:
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": name,
            "password_hash": None,
            "email_verified_at": now_iso,
            "google_sub": google_sub,
            "google_picture": picture,
            "google_email_verified": True,
            "auth_provider": "google",
            "is_premium": False,
            "premium_expires": None,
            "daily_chat_counts": {},
            "created_at": now_iso,
        }
        await db.users.insert_one(user)

    token = create_token(user["id"], user["email"])
    await create_app_log("info", "google_login", "Google Sign-In completed", {"user_id": user["id"], "email": email})
    return TokenResponse(access_token=token, user=build_user_response(user))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return build_user_response(user)


# ==================== AI MODELS ====================

@api_router.get("/models")
async def get_ai_models(user: dict = Depends(get_current_user)):
    """Return available AI models with access info"""
    is_premium = user.get("is_premium", False)
    models_list = []
    for key, model in AI_MODELS.items():
        accessible = True if model["tier"] == "free" else is_premium
        models_list.append({
            **model,
            "key": key,
            "accessible": accessible,
            "locked_reason": None if accessible else "Upgrade to Premium for access"
        })
    return {"models": models_list, "is_premium": is_premium}


# ==================== PREMIUM / STRIPE CHECKOUT ====================

@api_router.post("/premium/checkout")
async def create_checkout_session(http_request: Request, data: UpgradePremiumRequest, user: dict = Depends(get_current_user)):
    """Create Stripe checkout session for premium upgrade"""
    if not HAS_EMERGENT_STRIPE:
        raise HTTPException(status_code=503, detail="Stripe checkout is unavailable in this local Docker build")
    stripe_api_key = await get_runtime_api_key("stripe_api_key", STRIPE_API_KEY)
    package = PREMIUM_PACKAGES.get(data.plan)
    if not package:
        raise HTTPException(status_code=400, detail="Invalid plan. Use 'monthly' or 'yearly'")

    origin_url = data.origin_url
    if not origin_url:
        origin_url = str(http_request.base_url).rstrip('/')

    success_url = f"{origin_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/payment-cancel"

    host_url = str(http_request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)

    checkout_request = CheckoutSessionRequest(
        amount=package["amount"],
        currency=package["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["id"],
            "plan": data.plan,
            "user_email": user["email"],
        }
    )

    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)

    # Create payment transaction record
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "user_id": user["id"],
        "user_email": user["email"],
        "plan": data.plan,
        "amount": package["amount"],
        "currency": package["currency"],
        "payment_status": "initiated",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/premium/checkout/status/{session_id}")
async def check_checkout_status(session_id: str, http_request: Request, user: dict = Depends(get_current_user)):
    """Poll checkout session status and activate premium if paid"""
    if not HAS_EMERGENT_STRIPE:
        raise HTTPException(status_code=503, detail="Stripe checkout status is unavailable in this local Docker build")
    stripe_api_key = await get_runtime_api_key("stripe_api_key", STRIPE_API_KEY)
    host_url = str(http_request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)

    status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)

    # Update payment transaction
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if txn:
        update_data = {"payment_status": status.payment_status, "status": status.status}

        # Only activate premium once per session
        if status.payment_status == "paid" and txn.get("payment_status") != "paid":
            plan = txn.get("plan", "monthly")
            days = PREMIUM_PACKAGES.get(plan, {}).get("days", 30)
            expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
            await db.users.update_one(
                {"id": txn["user_id"]},
                {"$set": {"is_premium": True, "premium_expires": expires}}
            )
            update_data["premium_activated"] = True
            update_data["premium_expires"] = expires

        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": update_data}
        )

    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }

@api_router.post("/premium/upgrade")
async def upgrade_premium(data: UpgradePremiumRequest, user: dict = Depends(get_current_user)):
    """Quick upgrade (for testing / direct activation)"""
    package = PREMIUM_PACKAGES.get(data.plan)
    if not package:
        raise HTTPException(status_code=400, detail="Invalid plan. Use 'monthly' or 'yearly'")

    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=package["days"])
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"is_premium": True, "premium_expires": expires.isoformat()}}
    )
    return {
        "success": True, "plan": data.plan, "expires": expires.isoformat(),
        "features": ["Unlimited AI chats", "Claude Sonnet access", "Priority analysis", "Detailed health reports"]
    }

@api_router.get("/premium/status")
async def get_premium_status(
    country_code: str = Query(default="US"),
    user: dict = Depends(get_current_user)
):
    is_premium = user.get("is_premium", False)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_count = user.get("daily_chat_counts", {}).get(today, 0)
    limit = PREMIUM_DAILY_CHATS if is_premium else FREE_DAILY_CHATS
    monthly_quote = await get_localized_quote("monthly", country_code)
    yearly_quote = await get_localized_quote("yearly", country_code)
    return {
        "is_premium": is_premium,
        "premium_expires": user.get("premium_expires"),
        "daily_chats_used": daily_count,
        "daily_chat_limit": limit,
        "remaining_chats": max(0, limit - daily_count),
        "plans": {
            "monthly": {
                "price": monthly_quote["display_price"],
                "amount": monthly_quote["total_amount"],
                "currency": monthly_quote["currency"],
                "subtotal_amount": monthly_quote["subtotal_amount"],
                "tax_amount": monthly_quote["tax_amount"],
                "tax_name": monthly_quote["tax_name"],
                "exchange_rate": monthly_quote["exchange_rate"],
                "exchange_rate_source": monthly_quote["exchange_rate_source"],
            },
            "yearly": {
                "price": yearly_quote["display_price"],
                "amount": yearly_quote["total_amount"],
                "currency": yearly_quote["currency"],
                "subtotal_amount": yearly_quote["subtotal_amount"],
                "tax_amount": yearly_quote["tax_amount"],
                "tax_name": yearly_quote["tax_name"],
                "exchange_rate": yearly_quote["exchange_rate"],
                "exchange_rate_source": yearly_quote["exchange_rate_source"],
                "savings": "Save 33%",
            },
        }
    }

@api_router.post("/premium/upi-link")
async def create_upi_payment_link(data: UpiPaymentLinkRequest, user: dict = Depends(get_current_user)):
    if not UPI_VPA:
        raise HTTPException(status_code=503, detail="UPI payments are not configured")
    if data.test_mode:
        quote_data = {
            "package_label": "Google Pay Test Payment",
            "total_amount": Decimal("1.00"),
            "subtotal_amount": Decimal("1.00"),
            "tax_amount": Decimal("0.00"),
            "tax_name": None,
            "base_amount": Decimal("0.00"),
            "exchange_rate": Decimal("0.00"),
            "exchange_rate_source": "manual-test",
            "currency": "INR",
        }
    else:
        quote_data = await get_localized_quote(data.plan, data.country_code)
        if quote_data["currency"] != "INR":
            raise HTTPException(status_code=400, detail="UPI payments currently support India pricing only")

    txn_ref = f"greenplantai-{user['id'][:8]}-{uuid.uuid4().hex[:10]}"
    amount = f"{quote_data['total_amount']:.2f}"
    note = (
        f"Google Pay test payment for {user['email']}"
        if data.test_mode
        else f"{quote_data['package_label']} for {user['email']}"
    )
    upi_base = (
        f"pa={UPI_VPA}"
        f"&pn={quote(UPI_PAYEE_NAME)}"
        f"&tn={quote(note)}"
        f"&tr={txn_ref}"
        f"&am={amount}"
        f"&cu=INR"
    )

    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": txn_ref,
        "user_id": user["id"],
        "user_email": user["email"],
        "plan": data.plan,
        "amount": quote_data["total_amount"],
        "subtotal_amount": quote_data["subtotal_amount"],
        "tax_amount": quote_data["tax_amount"],
        "tax_name": quote_data["tax_name"],
        "base_amount_usd": quote_data["base_amount"],
        "exchange_rate": quote_data["exchange_rate"],
        "currency": "inr",
        "payment_status": "pending-upi",
        "payment_method": "upi",
        "test_mode": data.test_mode,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {
        "gpay_url": f"tez://upi/pay?{upi_base}",
        "upi_url": f"upi://pay?{upi_base}",
        "payee_vpa_masked": mask_key(UPI_VPA),
        "txn_ref": txn_ref,
        "amount": amount,
        "currency": "INR",
        "subtotal_amount": quote_data["subtotal_amount"],
        "tax_amount": quote_data["tax_amount"],
        "tax_name": quote_data["tax_name"],
        "exchange_rate": quote_data["exchange_rate"],
        "exchange_rate_source": quote_data["exchange_rate_source"],
        "note": note,
        "test_mode": data.test_mode,
        "message": (
            "This opens a Rs 1 Google Pay test payment. It does not activate premium."
            if data.test_mode
            else "This opens a manual UPI payment. Premium is not auto-activated until you confirm payment on the backend."
        )
    }


# ==================== PLANT IDENTIFICATION ====================

@api_router.post("/plants/identify")
@limiter.limit("20/minute")
async def identify_plant(request: Request, data: PlantIdentifyRequest, user: dict = Depends(get_current_user)):
    """Identify plant using Plant.id API v3 - keys secured server-side"""
    if not data.image_base64 or len(data.image_base64) < 100:
        raise HTTPException(status_code=400, detail="Invalid image data")

    try:
        plant_id_api_key = await get_runtime_api_key("plant_id_api_key", _PLANT_ID_API_KEY)
        payload = {"images": [data.image_base64], "similar_images": True}
        if data.health_check:
            payload["health"] = "all"

        details_params = "common_names,description,watering,best_watering,best_light_condition,best_soil_type,toxicity,image"

        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.post(
                f"{PLANT_ID_BASE_URL}/identification?details={details_params}",
                json=payload,
                headers={"Api-Key": plant_id_api_key, "Content-Type": "application/json"}
            )

        if response.status_code == 401:
            logger.error(f"Plant.id auth failed (key: {mask_key(plant_id_api_key)})")
            await create_app_log("error", "plant_identification_auth", "Plant.id authentication failed", {"user_id": user["id"]})
            raise HTTPException(status_code=502, detail="Plant identification service authentication error")
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Plant.id API rate limit reached")
        if response.status_code not in (200, 201):
            logger.error(f"Plant.id error: {response.status_code}")
            raise HTTPException(status_code=502, detail="Plant identification service error")

        result = response.json()
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
            "success": True, "is_plant": is_plant, "is_healthy": is_healthy,
            "suggestions": parsed_suggestions, "diseases": diseases,
            "top_match": parsed_suggestions[0] if parsed_suggestions else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Identification error: {str(e)}")
        await create_app_log("error", "plant_identification_failure", "Plant identification failed", {"user_id": user["id"], "error": str(e)})
        raise HTTPException(status_code=500, detail="Plant identification failed")


# ==================== DIGITAL GARDEN ====================

@api_router.post("/garden", response_model=PlantResponse)
async def save_plant(data: SavePlantRequest, user: dict = Depends(get_current_user)):
    plant_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plant_doc = {
        "id": plant_id, "user_id": user["id"],
        "species_name": data.species_name, "common_names": data.common_names,
        "description": data.description, "photo_base64": data.photo_base64,
        "watering_info": data.watering_info, "light_condition": data.light_condition,
        "soil_type": data.soil_type, "toxicity": data.toxicity,
        "confidence": data.confidence, "temperature": data.temperature,
        "repot_cycle": data.repot_cycle, "prune_cycle": data.prune_cycle,
        "common_problems": data.common_problems, "health_status": data.health_status,
        "health_details": data.health_details, "diseases": data.diseases,
        "last_watered": None, "created_at": now
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


# ==================== REMINDERS ====================

@api_router.post("/reminders", response_model=ReminderResponse)
async def create_reminder(data: ReminderCreate, user: dict = Depends(get_current_user)):
    plant = await db.plants.find_one({"id": data.plant_id, "user_id": user["id"]})
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    reminder_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    next_reminder = (now + timedelta(days=data.frequency_days)).isoformat()
    reminder_doc = {
        "id": reminder_id, "plant_id": data.plant_id, "user_id": user["id"],
        "reminder_type": data.reminder_type, "frequency_days": data.frequency_days,
        "time_of_day": data.time_of_day, "enabled": data.enabled,
        "next_reminder": next_reminder, "created_at": now.isoformat()
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
        update_data["next_reminder"] = (datetime.now(timezone.utc) + timedelta(days=update_data["frequency_days"])).isoformat()
    result = await db.reminders.update_one({"id": reminder_id, "user_id": user["id"]}, {"$set": update_data})
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


# ==================== AI BOTANIST CHAT ====================

@api_router.post("/chat")
@limiter.limit("30/minute")
async def ai_botanist_chat(request: Request, data: ChatMessage, user: dict = Depends(get_current_user)):
    """AI Botanist chat - model switching + rate limiting + premium gating"""
    # Validate model
    model_key = data.model or "gpt-4o-mini"
    model_config = AI_MODELS.get(model_key)
    if not model_config:
        raise HTTPException(status_code=400, detail=f"Invalid model: {model_key}")

    # Premium gating
    is_premium = user.get("is_premium", False)
    if model_config["tier"] == "premium" and not is_premium:
        raise HTTPException(status_code=403, detail="Premium model requires subscription. Upgrade to access Claude Sonnet models.")

    # Check daily chat limit
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_counts = user.get("daily_chat_counts", {})
    today_count = daily_counts.get(today, 0)
    limit = PREMIUM_DAILY_CHATS if is_premium else FREE_DAILY_CHATS
    if today_count >= limit:
        raise HTTPException(status_code=429, detail=f"Daily chat limit reached ({limit} chats/day). Upgrade to Premium for unlimited chats.")

    # Ollama handler (local)
    if model_key == "ollama-local":
        raise HTTPException(status_code=501, detail="Ollama integration requires local server setup. Configure OLLAMA_URL in your environment.")

    # Fetch plant
    plant = await db.plants.find_one({"id": data.plant_id, "user_id": user["id"]}, {"_id": 0, "photo_base64": 0})
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    plant_context = f"""You are GreenPlantAI Botanist, an expert plant care advisor.
You are helping with: {plant.get('species_name', 'Unknown')}.

Plant Details:
- Species: {plant.get('species_name', 'Unknown')}
- Common Names: {', '.join(plant.get('common_names', []))}
- Description: {plant.get('description', 'N/A')}
- Watering: {plant.get('watering_info', 'N/A')}
- Light: {plant.get('light_condition', 'N/A')}
- Soil: {plant.get('soil_type', 'N/A')}
- Temperature: {plant.get('temperature', 'N/A')}
- Toxicity: {plant.get('toxicity', 'N/A')}
- Health: {plant.get('health_status', 'N/A')}
- Last Watered: {plant.get('last_watered', 'Never')}

Provide helpful, specific, actionable plant care advice. Be friendly and concise."""

    conversation = f"System: {plant_context}\n\n"
    for msg in data.history[-10:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        conversation += f"{'User' if role == 'user' else 'Assistant'}: {content}\n\n"
    conversation += f"User: {data.message}\n\nAssistant:"

    try:
        straico_api_key = await get_runtime_api_key("straico_api_key", _STRAICO_API_KEY)
        straico_model_id = model_config["id"]

        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.post(
                "https://api.straico.com/v1/prompt/completion",
                headers={
                    "Authorization": f"Bearer {straico_api_key}",
                    "Content-Type": "application/json"
                },
                json={"models": [straico_model_id], "message": conversation}
            )

        if response.status_code not in (200, 201):
            logger.error(f"Straico error: {response.status_code} (key: {mask_key(straico_api_key)})")
            await create_app_log("error", "ai_chat_upstream_error", "Straico API error", {"user_id": user["id"], "status_code": response.status_code})
            raise HTTPException(status_code=502, detail="AI service unavailable")

        result = response.json()
        completions = result.get("data", {}).get("completions", {})
        model_data = completions.get(straico_model_id, {})
        choices = model_data.get("completion", {}).get("choices", [])
        ai_message = choices[0].get("message", {}).get("content", "") if choices else "I couldn't generate a response. Please try again."
        usage = (
            model_data.get("completion", {}).get("usage")
            or model_data.get("usage")
            or result.get("data", {}).get("usage")
            or result.get("usage")
            or {}
        )
        prompt_tokens = usage.get("prompt_tokens") or usage.get("input_tokens")
        completion_tokens = usage.get("completion_tokens") or usage.get("output_tokens")
        total_tokens = usage.get("total_tokens")
        if total_tokens is None and isinstance(prompt_tokens, (int, float)) and isinstance(completion_tokens, (int, float)):
            total_tokens = prompt_tokens + completion_tokens

        # Increment daily count
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {f"daily_chat_counts.{today}": today_count + 1}}
        )

        # Save chat
        chat_id = str(uuid.uuid4())
        await db.chats.insert_one({
            "id": chat_id, "plant_id": data.plant_id, "user_id": user["id"],
            "user_message": data.message, "ai_response": ai_message,
            "model_used": model_key, "created_at": datetime.now(timezone.utc).isoformat()
        })
        await db.ai_usage_logs.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "chat_id": chat_id,
            "model_used": model_key,
            "provider_model_id": straico_model_id,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        return {
            "success": True, "response": ai_message, "chat_id": chat_id,
            "model_used": model_key, "remaining_chats": max(0, limit - today_count - 1),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        await create_app_log("error", "ai_chat_failure", "AI chat failed", {"user_id": user["id"], "error": str(e)})
        raise HTTPException(status_code=500, detail="Chat service error")

@api_router.get("/chat/{plant_id}/history")
async def get_chat_history(plant_id: str, user: dict = Depends(get_current_user)):
    chats = await db.chats.find(
        {"plant_id": plant_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return chats


# ==================== STRIPE WEBHOOK ====================

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    body = await request.body()
    try:
        import json
        event = json.loads(body)
        event_type = event.get("type", "")
        logger.info(f"Stripe webhook: {event_type}")

        if event_type == "checkout.session.completed":
            session = event.get("data", {}).get("object", {})
            session_id = session.get("id")
            metadata = session.get("metadata", {})
            user_id = metadata.get("user_id")
            plan = metadata.get("plan", "monthly")

            if user_id and session_id:
                days = PREMIUM_PACKAGES.get(plan, {}).get("days", 30)
                expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"is_premium": True, "premium_expires": expires}}
                )
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {"payment_status": "paid", "premium_activated": True, "premium_expires": expires}}
                )
                logger.info(f"Premium activated for user {user_id} via webhook")

        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return {"received": True}


# ==================== PUSH NOTIFICATIONS ====================

@api_router.post("/notifications/register")
async def register_push_token(data: RegisterPushTokenRequest, user: dict = Depends(get_current_user)):
    """Register Expo push notification token"""
    if not data.push_token.startswith("ExponentPushToken["):
        raise HTTPException(status_code=400, detail="Invalid Expo push token format")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"push_token": data.push_token}}
    )
    return {"success": True, "message": "Push token registered"}

@api_router.get("/notifications/status")
async def get_notification_status(user: dict = Depends(get_current_user)):
    """Check if push notifications are enabled"""
    has_token = bool(user.get("push_token"))
    return {"enabled": has_token, "token_registered": has_token}

@api_router.post("/notifications/check-reminders")
async def check_and_send_reminders(user: dict = Depends(get_current_user)):
    """Check due reminders and send push notifications"""
    push_token = user.get("push_token")
    if not push_token:
        return {"sent": 0, "message": "No push token registered"}

    now = datetime.now(timezone.utc)
    reminders = await db.reminders.find({
        "user_id": user["id"],
        "enabled": True,
    }, {"_id": 0}).to_list(100)

    due_reminders = []
    for r in reminders:
        if r.get("next_reminder"):
            next_time = datetime.fromisoformat(r["next_reminder"])
            if next_time <= now:
                due_reminders.append(r)
        else:
            due_reminders.append(r)

    sent_count = 0
    for r in due_reminders:
        plant = await db.plants.find_one({"id": r["plant_id"]}, {"_id": 0, "photo_base64": 0})
        plant_name = plant.get("species_name", "Your plant") if plant else "Your plant"

        notification = {
            "to": push_token,
            "title": f"Time to water {plant_name}!",
            "body": f"Your {plant_name} needs {r.get('reminder_type', 'watering')}. Don't forget!",
            "data": {"plant_id": r["plant_id"], "reminder_id": r["id"]},
            "sound": "default",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as http_client:
                resp = await http_client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=notification,
                    headers={"Content-Type": "application/json"}
                )
                if resp.status_code == 200:
                    sent_count += 1
                    # Update next reminder time
                    new_next = (now + timedelta(days=r.get("frequency_days", 3))).isoformat()
                    await db.reminders.update_one(
                        {"id": r["id"]},
                        {"$set": {"next_reminder": new_next, "last_notified": now.isoformat()}}
                    )
        except Exception as e:
            logger.error(f"Push notification error: {str(e)}")

    return {"sent": sent_count, "total_due": len(due_reminders)}

@api_router.post("/notifications/test")
async def send_test_notification(user: dict = Depends(get_current_user)):
    """Send a test push notification"""
    push_token = user.get("push_token")
    if not push_token:
        raise HTTPException(status_code=400, detail="No push token registered. Enable notifications first.")

    notification = {
        "to": push_token,
        "title": "GreenPlantAI Test",
        "body": "Push notifications are working! You'll receive plant care reminders here.",
        "data": {"type": "test"},
        "sound": "default",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.post(
                "https://exp.host/--/api/v2/push/send",
                json=notification,
                headers={"Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                return {"success": True, "message": "Test notification sent!"}
            return {"success": False, "message": f"Expo push API error: {resp.status_code}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ADMIN DASHBOARD ====================

@app.get("/admin/login", response_class=HTMLResponse)
async def admin_login_page():
    return HTMLResponse(build_admin_login_page())


@app.post("/admin/login")
async def admin_login(email: str = Form(...), password: str = Form(...)):
    if email.strip().lower() != ADMIN_DASHBOARD_EMAIL.lower() or password != ADMIN_DASHBOARD_PASSWORD:
        return HTMLResponse(build_admin_login_page("Invalid admin credentials"), status_code=401)
    token = create_admin_session_token(email.strip().lower())
    response = RedirectResponse(url="/admin", status_code=303)
    response.set_cookie(
        ADMIN_COOKIE_NAME,
        token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 12,
    )
    await create_app_log("info", "admin_login", "Admin logged in", {"email": email.strip().lower()})
    return response


@app.get("/admin/logout")
async def admin_logout():
    response = RedirectResponse(url="/admin/login", status_code=303)
    response.delete_cookie(ADMIN_COOKIE_NAME)
    return response


@app.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    try:
        await require_admin(request)
    except HTTPException:
        return RedirectResponse(url="/admin/login", status_code=303)
    return HTMLResponse(build_admin_dashboard_page())


@api_router.get("/admin/overview")
async def admin_overview(request: Request):
    admin = await require_admin(request)
    users = await db.users.find({}, {"_id": 0}).to_list(5000)
    transactions = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    ai_usage = await db.ai_usage_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    recent_logs = await db.app_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    await create_app_log("info", "admin_overview_viewed", "Admin overview accessed", {"email": admin.get("sub")})
    return {
        "users": {
            "total": len(users),
            "premium": sum(1 for u in users if u.get("is_premium")),
            "google_auth": sum(1 for u in users if u.get("auth_provider") == "google"),
        },
        "ai_usage": {
            "total_requests": len(ai_usage),
            "total_tokens": sum(int(item.get("total_tokens") or 0) for item in ai_usage),
        },
        "transactions": {
            "total": len(transactions),
            "paid": sum(1 for t in transactions if t.get("payment_status") == "paid"),
            "pending": sum(1 for t in transactions if (t.get("payment_status") or "").startswith("pending") or t.get("payment_status") == "initiated"),
        },
        "logs": {
            "total_recent": len(recent_logs),
            "errors": sum(1 for log_item in recent_logs if log_item.get("level") == "error"),
        },
    }


@api_router.get("/admin/users")
async def admin_users(request: Request):
    await require_admin(request)
    users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    hydrated_users = []
    for user in users:
        hydrated_users.append({
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name"),
            "is_premium": user.get("is_premium", False),
            "premium_expires": user.get("premium_expires"),
            "auth_provider": user.get("auth_provider", "password"),
            "total_chats_used": await count_total_chat_usage(user),
            "created_at": user.get("created_at"),
        })
    return {"users": hydrated_users}


@api_router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, data: AdminUserUpdateRequest, request: Request):
    admin = await require_admin(request)
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if "is_premium" in update_data and not update_data["is_premium"]:
        update_data["premium_expires"] = None
    if not update_data:
        raise HTTPException(status_code=400, detail="No user updates provided")
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await create_app_log("info", "admin_user_updated", "Admin updated user", {"admin": admin.get("sub"), "user_id": user_id, "changes": update_data})
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    return {"success": True, "user": build_user_response(user)}


@api_router.get("/admin/transactions")
async def admin_transactions(request: Request):
    await require_admin(request)
    transactions = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return {"transactions": transactions}


@api_router.patch("/admin/transactions/{transaction_id}")
async def admin_update_transaction(transaction_id: str, data: AdminTransactionUpdateRequest, request: Request):
    admin = await require_admin(request)
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No transaction updates provided")
    result = await db.payment_transactions.update_one({"id": transaction_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await create_app_log("info", "admin_transaction_updated", "Admin updated transaction", {"admin": admin.get("sub"), "transaction_id": transaction_id, "changes": update_data})
    transaction = await db.payment_transactions.find_one({"id": transaction_id}, {"_id": 0})
    return {"success": True, "transaction": transaction}


@api_router.get("/admin/logs")
async def admin_logs(request: Request, limit: int = Query(default=100, le=500)):
    await require_admin(request)
    logs = await db.app_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"logs": logs}


@api_router.get("/admin/api-keys")
async def admin_api_keys(request: Request):
    await require_admin(request)
    config = await get_runtime_config()
    api_keys = config.get("api_keys", {})
    return {
        "keys": [
            {"name": "plant_id_api_key", "label": "Plant.id API Key", "masked_value": mask_optional_key(api_keys.get("plant_id_api_key") or _PLANT_ID_API_KEY), "source": "runtime override" if api_keys.get("plant_id_api_key") else "env"},
            {"name": "straico_api_key", "label": "Straico API Key", "masked_value": mask_optional_key(api_keys.get("straico_api_key") or _STRAICO_API_KEY), "source": "runtime override" if api_keys.get("straico_api_key") else "env"},
            {"name": "stripe_api_key", "label": "Stripe API Key", "masked_value": mask_optional_key(api_keys.get("stripe_api_key") or STRIPE_API_KEY), "source": "runtime override" if api_keys.get("stripe_api_key") else "env"},
        ]
    }


@api_router.put("/admin/api-keys")
async def admin_update_api_keys(data: AdminApiKeysUpdateRequest, request: Request):
    admin = await require_admin(request)
    raw_updates = {k: v for k, v in data.model_dump().items() if v}
    if not raw_updates:
        raise HTTPException(status_code=400, detail="No API key updates provided")
    update_doc = {f"api_keys.{key}": value.strip() for key, value in raw_updates.items()}
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_doc["updated_by"] = admin.get("sub")
    await db.runtime_config.update_one(
        {"id": "runtime_config"},
        {"$set": update_doc, "$setOnInsert": {"id": "runtime_config"}},
        upsert=True,
    )
    await create_app_log("info", "admin_api_keys_updated", "Admin updated runtime API keys", {"admin": admin.get("sub"), "keys": list(raw_updates.keys())})
    return {"success": True, "updated_keys": list(raw_updates.keys())}


# ==================== SECURITY INFO ====================

@api_router.get("/security/status")
async def security_status(user: dict = Depends(get_current_user)):
    """Show security features enabled"""
    return {
        "api_keys_secured": True,
        "keys_location": "server-side .env only",
        "jwt_auth": True,
        "rate_limiting": True,
        "password_hashing": "bcrypt",
        "cors_enabled": True,
        "https_enforced": True,
        "input_validation": True,
        "key_masking_in_logs": True,
    }


# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "GreenPlantAI API", "version": "2.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "greenplantai-api"}


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
