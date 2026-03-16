"""Test garden (plant CRUD) endpoints"""
import pytest

class TestGarden:
    """Garden CRUD endpoint tests"""

    def test_save_plant_to_garden(self, api_client, base_url, test_user_token, cleanup_test_data):
        """Test POST /api/garden creates plant and GET verifies persistence"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Create plant
        create_payload = {
            "species_name": "TEST_Monstera deliciosa",
            "common_names": ["Swiss Cheese Plant", "Split-leaf Philodendron"],
            "description": "TEST plant for automated testing",
            "watering_info": "Water weekly",
            "light_condition": "Bright indirect light",
            "confidence": 0.95
        }
        
        create_response = api_client.post(
            f"{base_url}/api/garden",
            json=create_payload,
            headers=headers
        )
        assert create_response.status_code == 200, f"Create plant failed: {create_response.text}"
        
        created_plant = create_response.json()
        assert created_plant["species_name"] == create_payload["species_name"], "Species name mismatch"
        assert "id" in created_plant, "Plant ID missing"
        plant_id = created_plant["id"]
        print(f"✓ Plant created: {plant_id}")
        
        # Verify persistence with GET
        get_response = api_client.get(f"{base_url}/api/garden/{plant_id}", headers=headers)
        assert get_response.status_code == 200, "Failed to retrieve created plant"
        
        retrieved_plant = get_response.json()
        assert retrieved_plant["id"] == plant_id, "Plant ID mismatch"
        assert retrieved_plant["species_name"] == create_payload["species_name"], "Species name not persisted"
        assert retrieved_plant["confidence"] == create_payload["confidence"], "Confidence not persisted"
        print("✓ Plant persistence verified")

    def test_get_all_garden_plants(self, api_client, base_url, test_user_token):
        """Test GET /api/garden returns list of plants"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        response = api_client.get(f"{base_url}/api/garden", headers=headers)
        
        assert response.status_code == 200, f"Get garden failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Garden fetch passed: {len(data)} plants")

    def test_get_single_plant(self, api_client, base_url, test_user_token, cleanup_test_data):
        """Test GET /api/garden/{plant_id} returns specific plant"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Create test plant
        create_response = api_client.post(
            f"{base_url}/api/garden",
            json={"species_name": "TEST_Pothos", "common_names": ["Devil's Ivy"]},
            headers=headers
        )
        plant_id = create_response.json()["id"]
        
        # Get specific plant
        get_response = api_client.get(f"{base_url}/api/garden/{plant_id}", headers=headers)
        assert get_response.status_code == 200, "Get single plant failed"
        
        plant = get_response.json()
        assert plant["id"] == plant_id, "Plant ID mismatch"
        assert plant["species_name"] == "TEST_Pothos", "Species name mismatch"
        print(f"✓ Single plant fetch passed: {plant_id}")

    def test_get_nonexistent_plant(self, api_client, base_url, test_user_token):
        """Test GET /api/garden/{invalid_id} returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        response = api_client.get(f"{base_url}/api/garden/invalid-id-12345", headers=headers)
        
        assert response.status_code == 404, "Nonexistent plant should return 404"
        print("✓ 404 for nonexistent plant passed")

    def test_water_plant(self, api_client, base_url, test_user_token, cleanup_test_data):
        """Test POST /api/garden/{plant_id}/water updates last_watered"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Create plant
        create_response = api_client.post(
            f"{base_url}/api/garden",
            json={"species_name": "TEST_Fern"},
            headers=headers
        )
        plant_id = create_response.json()["id"]
        
        # Water plant
        water_response = api_client.post(
            f"{base_url}/api/garden/{plant_id}/water",
            json={},
            headers=headers
        )
        assert water_response.status_code == 200, f"Water plant failed: {water_response.text}"
        
        water_data = water_response.json()
        assert water_data["success"] == True, "Success should be True"
        assert "last_watered" in water_data, "last_watered missing"
        print(f"✓ Plant watering passed: {plant_id}")
        
        # Verify last_watered was updated
        get_response = api_client.get(f"{base_url}/api/garden/{plant_id}", headers=headers)
        plant = get_response.json()
        assert plant["last_watered"] is not None, "last_watered should be set"
        print("✓ last_watered persistence verified")

    def test_delete_plant(self, api_client, base_url, test_user_token):
        """Test DELETE /api/garden/{plant_id} removes plant and GET returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Create plant
        create_response = api_client.post(
            f"{base_url}/api/garden",
            json={"species_name": "TEST_ToDelete"},
            headers=headers
        )
        plant_id = create_response.json()["id"]
        
        # Delete plant
        delete_response = api_client.delete(f"{base_url}/api/garden/{plant_id}", headers=headers)
        assert delete_response.status_code == 200, f"Delete plant failed: {delete_response.text}"
        
        delete_data = delete_response.json()
        assert delete_data["success"] == True, "Delete success should be True"
        print(f"✓ Plant deleted: {plant_id}")
        
        # Verify deletion with GET
        get_response = api_client.get(f"{base_url}/api/garden/{plant_id}", headers=headers)
        assert get_response.status_code == 404, "Deleted plant should return 404"
        print("✓ Deletion verified via 404")

    def test_delete_nonexistent_plant(self, api_client, base_url, test_user_token):
        """Test DELETE /api/garden/{invalid_id} returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        response = api_client.delete(f"{base_url}/api/garden/invalid-id-12345", headers=headers)
        
        assert response.status_code == 404, "Delete nonexistent plant should return 404"
        print("✓ Delete nonexistent plant returns 404")
