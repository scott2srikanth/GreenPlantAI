"""Test health check endpoints"""
import pytest

class TestHealth:
    """Health check endpoint tests"""

    def test_health_endpoint(self, api_client, base_url):
        """Test GET /api/health returns 200"""
        response = api_client.get(f"{base_url}/api/health")
        assert response.status_code == 200, f"Health check failed with {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response missing 'status' field"
        assert data["status"] == "healthy", f"Unexpected status: {data['status']}"
        print("✓ Health check passed")

    def test_root_endpoint(self, api_client, base_url):
        """Test GET /api/ returns API info"""
        response = api_client.get(f"{base_url}/api/")
        assert response.status_code == 200, f"Root endpoint failed with {response.status_code}"
        
        data = response.json()
        assert "message" in data, "Response missing 'message' field"
        assert "LeafCheck" in data["message"], "Unexpected API name"
        print("✓ Root endpoint passed")
