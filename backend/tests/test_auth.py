"""Test authentication endpoints"""
import pytest
import uuid

class TestAuth:
    """Authentication endpoint tests"""

    def test_register_new_user(self, api_client, base_url):
        """Test POST /api/auth/register creates new user"""
        unique_email = f"TEST_user_{uuid.uuid4().hex[:8]}@test.com"
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": unique_email,
                "password": "testpass123",
                "name": "TEST User"
            }
        )
        assert response.status_code == 200, f"Registration failed with {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert "user" in data, "Response missing user object"
        assert data["user"]["email"] == unique_email, "Email mismatch"
        assert data["user"]["name"] == "TEST User", "Name mismatch"
        assert "id" in data["user"], "User ID missing"
        print(f"✓ User registration passed: {unique_email}")

    def test_register_duplicate_email(self, api_client, base_url):
        """Test POST /api/auth/register with existing email returns 400"""
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": "test@leafcheck.com",
                "password": "test123",
                "name": "Test"
            }
        )
        assert response.status_code == 400, "Duplicate email should return 400"
        print("✓ Duplicate email rejection passed")

    def test_login_success(self, api_client, base_url):
        """Test POST /api/auth/login with valid credentials"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={
                "email": "test@leafcheck.com",
                "password": "test123"
            }
        )
        assert response.status_code == 200, f"Login failed with {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert "user" in data, "Response missing user object"
        assert data["user"]["email"] == "test@leafcheck.com", "Email mismatch"
        assert data["token_type"] == "bearer", "Token type should be bearer"
        print("✓ Login passed")

    def test_login_invalid_credentials(self, api_client, base_url):
        """Test POST /api/auth/login with invalid password returns 401"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={
                "email": "test@leafcheck.com",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401, "Invalid credentials should return 401"
        print("✓ Invalid login rejection passed")

    def test_get_current_user(self, api_client, base_url, test_user_token):
        """Test GET /api/auth/me returns current user"""
        response = api_client.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert response.status_code == 200, f"Get me failed with {response.status_code}"
        
        data = response.json()
        assert "email" in data, "Response missing email"
        assert "name" in data, "Response missing name"
        assert "id" in data, "Response missing id"
        print(f"✓ Get current user passed: {data['email']}")

    def test_get_current_user_no_token(self, api_client, base_url):
        """Test GET /api/auth/me without token returns 403"""
        response = api_client.get(f"{base_url}/api/auth/me")
        assert response.status_code == 403, "No token should return 403"
        print("✓ No token rejection passed")

    def test_get_current_user_invalid_token(self, api_client, base_url):
        """Test GET /api/auth/me with invalid token returns 401"""
        response = api_client.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_12345"}
        )
        assert response.status_code == 401, "Invalid token should return 401"
        print("✓ Invalid token rejection passed")
