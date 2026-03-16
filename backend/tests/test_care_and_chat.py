"""
Test care update and AI chat endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://plant-scan-ai.preview.emergentagent.com').rstrip('/')

class TestPlantCareUpdate:
    """Test PUT /api/garden/{plant_id}/care endpoint"""
    
    def test_update_care_single_field(self, auth_headers, test_plant_id):
        """Update single care field"""
        response = requests.put(
            f"{BASE_URL}/api/garden/{test_plant_id}/care",
            headers=auth_headers,
            json={"watering_info": "TEST_Water twice weekly"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["watering_info"] == "TEST_Water twice weekly"
        
        # Verify persistence
        get_response = requests.get(
            f"{BASE_URL}/api/garden/{test_plant_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["watering_info"] == "TEST_Water twice weekly"
    
    def test_update_care_multiple_fields(self, auth_headers, test_plant_id):
        """Update multiple care fields at once"""
        care_data = {
            "soil_type": "TEST_Well-draining potting mix",
            "light_condition": "TEST_Bright indirect light",
            "temperature": "TEST_18-24°C (65-75°F)"
        }
        response = requests.put(
            f"{BASE_URL}/api/garden/{test_plant_id}/care",
            headers=auth_headers,
            json=care_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["soil_type"] == care_data["soil_type"]
        assert data["light_condition"] == care_data["light_condition"]
        assert data["temperature"] == care_data["temperature"]
        
        # Verify persistence
        get_response = requests.get(
            f"{BASE_URL}/api/garden/{test_plant_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["soil_type"] == care_data["soil_type"]
        assert get_data["light_condition"] == care_data["light_condition"]
        assert get_data["temperature"] == care_data["temperature"]
    
    def test_update_care_repot_and_prune_cycles(self, auth_headers, test_plant_id):
        """Update repot and prune cycle fields"""
        response = requests.put(
            f"{BASE_URL}/api/garden/{test_plant_id}/care",
            headers=auth_headers,
            json={
                "repot_cycle": "TEST_Every 2 years in spring",
                "prune_cycle": "TEST_Prune in early spring"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["repot_cycle"] == "TEST_Every 2 years in spring"
        assert data["prune_cycle"] == "TEST_Prune in early spring"
    
    def test_update_care_invalid_plant(self, auth_headers):
        """Updating care for non-existent plant returns 404"""
        response = requests.put(
            f"{BASE_URL}/api/garden/invalid-plant-id/care",
            headers=auth_headers,
            json={"watering_info": "Test"}
        )
        assert response.status_code == 404
    
    def test_update_care_no_auth(self, test_plant_id):
        """Care update without auth returns 401"""
        response = requests.put(
            f"{BASE_URL}/api/garden/{test_plant_id}/care",
            json={"watering_info": "Test"}
        )
        assert response.status_code == 403
    
    def test_update_care_empty_payload(self, auth_headers, test_plant_id):
        """Empty care update returns 400"""
        response = requests.put(
            f"{BASE_URL}/api/garden/{test_plant_id}/care",
            headers=auth_headers,
            json={}
        )
        assert response.status_code == 400


class TestAIBotanistChat:
    """Test POST /api/chat and GET /api/chat/{plant_id}/history endpoints"""
    
    def test_chat_send_message(self, auth_headers, test_plant_id):
        """Send message to AI Botanist and get response"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            headers=auth_headers,
            json={
                "plant_id": test_plant_id,
                "message": "How often should I water this plant?",
                "history": []
            }
        )
        assert response.status_code in (200, 201)
        data = response.json()
        assert data["success"] is True
        assert "response" in data
        assert len(data["response"]) > 0
        assert "chat_id" in data
    
    def test_chat_with_history(self, auth_headers, test_plant_id):
        """Send message with conversation history"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            headers=auth_headers,
            json={
                "plant_id": test_plant_id,
                "message": "What about fertilizer?",
                "history": [
                    {"role": "user", "content": "How often should I water?"},
                    {"role": "assistant", "content": "Water twice weekly."}
                ]
            }
        )
        assert response.status_code in (200, 201)
        data = response.json()
        assert data["success"] is True
        assert "response" in data
    
    def test_chat_history(self, auth_headers, test_plant_id):
        """Get chat history for a plant"""
        # First send a message to create history
        requests.post(
            f"{BASE_URL}/api/chat",
            headers=auth_headers,
            json={
                "plant_id": test_plant_id,
                "message": "TEST_Chat history test message",
                "history": []
            }
        )
        
        # Get history
        response = requests.get(
            f"{BASE_URL}/api/chat/{test_plant_id}/history",
            headers=auth_headers
        )
        assert response.status_code == 200
        history = response.json()
        assert isinstance(history, list)
        # Should have at least the message we just sent
        assert len(history) >= 1
        # Check structure
        if len(history) > 0:
            chat = history[0]
            assert "id" in chat
            assert "plant_id" in chat
            assert "user_message" in chat
            assert "ai_response" in chat
            assert "created_at" in chat
    
    def test_chat_invalid_plant(self, auth_headers):
        """Chat with invalid plant returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            headers=auth_headers,
            json={
                "plant_id": "invalid-plant-id",
                "message": "Test message",
                "history": []
            }
        )
        assert response.status_code == 404
    
    def test_chat_no_auth(self, test_plant_id):
        """Chat without auth returns 401/403"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "plant_id": test_plant_id,
                "message": "Test",
                "history": []
            }
        )
        assert response.status_code == 403
    
    def test_chat_history_no_auth(self, test_plant_id):
        """Chat history without auth returns 401/403"""
        response = requests.get(
            f"{BASE_URL}/api/chat/{test_plant_id}/history"
        )
        assert response.status_code == 403


@pytest.fixture
def test_plant_id():
    """Use existing test plant ID"""
    return "cf32e356-b052-4414-9699-1579ef1aa7d8"


@pytest.fixture
def auth_headers():
    """Get auth token and return headers"""
    # Login as test user
    login_response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "test@leafcheck.com",
            "password": "test123"
        }
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
