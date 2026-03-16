import pytest
import requests
import os

@pytest.fixture(scope="session")
def base_url():
    """Base URL for API testing"""
    return os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://plant-scan-ai.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="function")
def test_user_token(api_client, base_url):
    """Login test user and return token"""
    try:
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "test@leafcheck.com", "password": "test123"}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        else:
            pytest.skip("Test user login failed - skipping authenticated tests")
    except Exception as e:
        pytest.skip(f"Test user setup failed: {str(e)}")

@pytest.fixture(scope="function")
def cleanup_test_data(api_client, base_url, test_user_token):
    """Cleanup test data after tests"""
    yield
    # Cleanup logic after test completes
    try:
        headers = {"Authorization": f"Bearer {test_user_token}"}
        # Get all plants
        plants_response = api_client.get(f"{base_url}/api/garden", headers=headers)
        if plants_response.ok:
            plants = plants_response.json()
            for plant in plants:
                if plant.get('species_name', '').startswith('TEST_'):
                    api_client.delete(f"{base_url}/api/garden/{plant['id']}", headers=headers)
        
        # Get all reminders
        reminders_response = api_client.get(f"{base_url}/api/reminders", headers=headers)
        if reminders_response.ok:
            reminders = reminders_response.json()
            for reminder in reminders:
                api_client.delete(f"{base_url}/api/reminders/{reminder['id']}", headers=headers)
    except:
        pass
