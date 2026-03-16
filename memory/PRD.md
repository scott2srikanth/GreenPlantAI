# GreenPlantAI - Plant Identification & Care App

## Product Requirements Document (PRD) v2.0

### Overview
GreenPlantAI is a plant identification and care mobile application that uses Plant.id (Kindwise) API for identification, Straico API for AI-powered botanist chat, and a premium subscription system for advanced features.

### Tech Stack
- **Frontend**: Expo React Native (SDK 54) with Expo Router
- **Backend**: FastAPI (Python) with rate limiting
- **Database**: MongoDB
- **Plant AI**: Plant.id (Kindwise) API v3
- **AI Chat**: Straico API (GPT-4o-mini, Claude Sonnet 4.5)
- **Auth**: JWT (bcrypt + python-jose)

### Security Architecture
- **API Keys**: Stored server-side only in `.env` — NEVER exposed to frontend
- **Key Masking**: All API keys masked in logs (e.g., `pnT7****mlAJ`)
- **JWT Authentication**: Secure token-based auth with configurable expiry
- **Rate Limiting**: 5/min register, 10/min login, 20/min identify, 30/min chat
- **Password Hashing**: bcrypt via passlib
- **Input Validation**: All user inputs validated server-side
- **HTTPS**: Enforced for all API communication

### Features

#### 1. Authentication (JWT)
- Register/login with email validation
- Secure token storage (SecureStore mobile, localStorage web)
- Auto-login, password strength requirements

#### 2. Plant Identification
- Camera capture + gallery picker
- Plant.id API v3 integration (species, health, care details)
- Results with confidence scores, disease detection

#### 3. Digital Garden
- Save/manage identified plants
- Track watering history
- View plant photos, species info

#### 4. Enhanced Plant Detail (Tabbed Menu)
- **About**: Species, description, toxicity, confidence
- **Health Assessment**: Health status, detected diseases with treatments
- **Plant Care** (editable): Soil, Light, Temperature, Water, Repot Cycle, Prune Cycle
- **Common Problems**: Disease records, AI Botanist links

#### 5. AI Botanist Chat (Multi-Model)
- GPT-4o-mini (free tier)
- Claude Sonnet 4.5 (premium)
- Claude Sonnet 4 (premium)
- Ollama (self-hosted, coming soon)
- Model picker UI with PRO badges
- Remaining chats counter
- Chat history persistence

#### 6. Premium Subscription
- Free: 10 AI chats/day, GPT-4o-mini only
- Monthly ($4.99): Unlimited chats, Claude access, priority analysis
- Yearly ($39.99): Same + 33% savings
- **MOCKED** payment (Stripe integration ready for production)

#### 7. Care Reminders
- Per-plant watering reminders
- Configurable frequency + time
- Toggle on/off, overdue detection

### API Endpoints (18 total)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register (rate: 5/min) |
| POST | /api/auth/login | No | Login (rate: 10/min) |
| GET | /api/auth/me | Yes | Get current user + premium status |
| GET | /api/models | Yes | List AI models with access info |
| GET | /api/premium/status | Yes | Subscription info + chat limits |
| POST | /api/premium/upgrade | Yes | Upgrade to premium (MOCKED) |
| POST | /api/plants/identify | Yes | Plant.id identification (rate: 20/min) |
| POST | /api/garden | Yes | Save plant |
| GET | /api/garden | Yes | List plants |
| GET | /api/garden/:id | Yes | Plant detail |
| DELETE | /api/garden/:id | Yes | Remove plant |
| POST | /api/garden/:id/water | Yes | Log watering |
| PUT | /api/garden/:id/care | Yes | Update editable care fields |
| POST | /api/reminders | Yes | Create reminder |
| GET | /api/reminders | Yes | List reminders |
| PUT | /api/reminders/:id | Yes | Update reminder |
| DELETE | /api/reminders/:id | Yes | Delete reminder |
| POST | /api/chat | Yes | AI Botanist chat (rate: 30/min) |
| GET | /api/chat/:plantId/history | Yes | Chat history |
| GET | /api/security/status | Yes | Security features status |

### Test Results
- Iteration 1: 23/23 passed (MVP)
- Iteration 2: 37/37 passed (tabs + chat)
- Iteration 3: Backend 88%, Frontend 100% (security + premium + models)
