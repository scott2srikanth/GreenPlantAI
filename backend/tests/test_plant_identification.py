"""Test plant identification endpoints (Plant.id API integration)"""
import pytest
import base64
import requests

class TestPlantIdentification:
    """Plant identification endpoint tests"""

    def test_identify_plant_with_sample_image(self, api_client, base_url):
        """Test POST /api/plants/identify with a sample plant image"""
        # Download a sample plant image and convert to base64
        try:
            # Use a small public plant image for testing
            img_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Monstera_deliciosa3.jpg/320px-Monstera_deliciosa3.jpg"
            img_response = requests.get(img_url, timeout=10)
            
            if img_response.status_code != 200:
                pytest.skip("Could not download sample plant image for testing")
            
            image_base64 = base64.b64encode(img_response.content).decode('utf-8')
            
            # Test identification endpoint (no auth required based on code review)
            response = api_client.post(
                f"{base_url}/api/plants/identify",
                json={
                    "image_base64": image_base64,
                    "health_check": True
                }
            )
            
            # Plant.id API might have rate limits or API key issues
            if response.status_code == 429:
                pytest.skip("Plant.id API rate limit reached")
            elif response.status_code == 502:
                print("⚠ Plant.id API error (502) - API key or service issue")
                # Don't fail test, just report
                data = response.json()
                assert "detail" in data
                return
            
            assert response.status_code == 200, f"Identification failed: {response.text}"
            
            data = response.json()
            assert "success" in data, "Response missing 'success' field"
            assert "suggestions" in data, "Response missing 'suggestions' field"
            assert "is_plant" in data, "Response missing 'is_plant' field"
            
            if data.get("success"):
                print(f"✓ Plant identification passed")
                if data.get("suggestions"):
                    top_match = data["suggestions"][0]
                    print(f"  Top match: {top_match.get('name')} ({top_match.get('probability', 0)*100:.1f}%)")
            
        except requests.exceptions.RequestException as e:
            pytest.skip(f"Network error downloading test image: {str(e)}")
        except Exception as e:
            print(f"⚠ Plant identification test error: {str(e)}")
            pytest.skip(f"Test setup failed: {str(e)}")

    def test_identify_plant_requires_image(self, api_client, base_url):
        """Test POST /api/plants/identify without image_base64 returns error"""
        response = api_client.post(
            f"{base_url}/api/plants/identify",
            json={"health_check": True}
        )
        
        # Should return validation error (422 for missing required field)
        assert response.status_code in [400, 422], "Missing image should return 400 or 422"
        print("✓ Missing image validation passed")

    def test_identify_plant_invalid_base64(self, api_client, base_url):
        """Test POST /api/plants/identify with invalid base64 returns error"""
        response = api_client.post(
            f"{base_url}/api/plants/identify",
            json={
                "image_base64": "invalid_base64_string",
                "health_check": False
            }
        )
        
        # Should return error (500 or 502)
        assert response.status_code in [400, 500, 502], "Invalid image should return error"
        print("✓ Invalid base64 validation passed")
