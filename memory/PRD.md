# LeafCheck - Plant Identification & Care App

## Product Requirements Document (PRD)

### Overview
LeafCheck is a plant identification and care mobile application that uses the Plant.id (Kindwise) API to identify plants from photos, detect diseases, and provide care recommendations. Users can build a digital garden and set watering reminders.

### Tech Stack
- **Frontend**: Expo React Native (SDK 54) with Expo Router
- **Backend**: FastAPI (Python) 
- **Database**: MongoDB
- **AI/ML**: Plant.id (Kindwise) API v3
- **Authentication**: JWT (bcrypt + python-jose)

### Architecture
```
Mobile App (Expo) → FastAPI Backend → MongoDB
                                    → Plant.id API v3
```

### Features Implemented

#### 1. Authentication (JWT)
- User registration with email, password, name
- User login with JWT token
- Secure token storage (expo-secure-store on mobile, localStorage on web)
- Auto-login on app restart

#### 2. Plant Identification
- Camera capture or gallery image selection
- Image sent as base64 to backend
- Backend forwards to Plant.id API v3 with:
  - Species classification
  - Health assessment (disease detection)
  - Care details (watering, light, soil, toxicity)
- Results displayed with confidence scores

#### 3. Digital Garden
- Save identified plants to personal collection
- View all saved plants with images
- Track watering history
- Delete plants from garden

#### 4. Enhanced Plant Detail (Tabbed Menu)
- **About Tab**: Species name, common names, description, toxicity, confidence, last watered
- **Health Assessment Tab**: Health status banner (healthy/unhealthy), detected diseases with treatment (prevention, biological, chemical), link to AI Botanist chat
- **Plant Care Tab**: 6 editable care fields:
  - Soil type
  - Light condition
  - Temperature
  - Watering info
  - Repot cycle
  - Prune cycle
  - Auto-filled from Plant.id API, user-editable via modal
- **Common Problems Tab**: Recorded issues, link to AI Botanist

#### 5. AI Botanist Chat
- Per-plant conversational AI powered by **Straico API (GPT-4o-mini)**
- Context-aware: sends plant species, care info, health status to AI
- Chat history persistence in MongoDB
- Quick prompts for common questions
- Accessible from plant detail (Health tab, Issues tab, hero actions)

#### 6. Care Reminders
- Create watering reminders per plant
- Configurable frequency (days) and time
- Toggle reminders on/off
- View overdue reminders on home screen

#### 5. Plant Detail View
- Full plant information display
- Quick actions (water, remind, delete)
- Care guide (watering, light, soil, toxicity)
- Add reminder modal

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register user |
| POST | /api/auth/login | No | Login user |
| GET | /api/auth/me | Yes | Get current user |
| POST | /api/plants/identify | Yes | Identify plant from image |
| POST | /api/garden | Yes | Save plant to garden |
| GET | /api/garden | Yes | List user's plants |
| GET | /api/garden/:id | Yes | Get plant details |
| DELETE | /api/garden/:id | Yes | Remove plant |
| POST | /api/garden/:id/water | Yes | Log watering |
| PUT | /api/garden/:id/care | Yes | Update care fields (editable) |
| POST | /api/reminders | Yes | Create reminder |
| GET | /api/reminders | Yes | List reminders |
| PUT | /api/reminders/:id | Yes | Update reminder |
| DELETE | /api/reminders/:id | Yes | Delete reminder |
| POST | /api/chat | Yes | AI Botanist chat (Straico/GPT-4o-mini) |
| GET | /api/chat/:plantId/history | Yes | Get chat history for plant |

### MongoDB Collections
- **users**: id, email, name, password_hash, created_at
- **plants**: id, user_id, species_name, common_names, description, photo_base64, watering_info, light_condition, soil_type, toxicity, confidence, last_watered, created_at
- **reminders**: id, plant_id, user_id, reminder_type, frequency_days, time_of_day, enabled, next_reminder, created_at

### Design System
- **Theme**: Nature/Organic (greens, earth tones)
- **Primary**: #2F5233 (Forest Green)
- **Background**: #F7F9F8 (Light Sage)
- **Navigation**: Tab-based (Home, Garden, Reminders, Profile)
- **Components**: React Native native with StyleSheet

### Plant.id API Integration
- **Endpoint**: POST https://plant.id/api/v3/identification
- **Features used**: Species classification, health assessment, disease detection, care details
- **Details requested**: common_names, description, watering, best_watering, best_light_condition, best_soil_type, toxicity, image

### Test Results
- Backend: 23/23 tests passed (100%)
- Frontend: All UI flows working correctly
- Auth flow: Working
- Navigation: All tabs functional
- Plant.id API: Validated

### Environment Variables
- Backend: MONGO_URL, DB_NAME, PLANT_ID_API_KEY, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
- Frontend: EXPO_PUBLIC_BACKEND_URL (auto-configured)
