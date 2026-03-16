"""Test reminder CRUD endpoints"""
import pytest

class TestReminders:
    """Reminder CRUD endpoint tests"""

    def test_create_reminder(self, api_client, base_url, test_user_token, cleanup_test_data):
        """Test POST /api/reminders creates reminder and GET verifies"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # First create a plant
        plant_response = api_client.post(
            f"{base_url}/api/garden",
            json={"species_name": "TEST_PlantForReminder"},
            headers=headers
        )
        plant_id = plant_response.json()["id"]
        
        # Create reminder
        reminder_payload = {
            "plant_id": plant_id,
            "reminder_type": "watering",
            "frequency_days": 3,
            "time_of_day": "09:00",
            "enabled": True
        }
        
        create_response = api_client.post(
            f"{base_url}/api/reminders",
            json=reminder_payload,
            headers=headers
        )
        assert create_response.status_code == 200, f"Create reminder failed: {create_response.text}"
        
        reminder = create_response.json()
        assert reminder["plant_id"] == plant_id, "Plant ID mismatch"
        assert reminder["frequency_days"] == 3, "Frequency mismatch"
        assert "id" in reminder, "Reminder ID missing"
        reminder_id = reminder["id"]
        print(f"✓ Reminder created: {reminder_id}")
        
        # Verify with GET
        get_response = api_client.get(f"{base_url}/api/reminders", headers=headers)
        assert get_response.status_code == 200, "Get reminders failed"
        
        reminders = get_response.json()
        created_reminder = next((r for r in reminders if r["id"] == reminder_id), None)
        assert created_reminder is not None, "Created reminder not found in list"
        assert created_reminder["frequency_days"] == 3, "Frequency not persisted"
        print("✓ Reminder persistence verified")

    def test_create_reminder_nonexistent_plant(self, api_client, base_url, test_user_token):
        """Test POST /api/reminders with invalid plant_id returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        response = api_client.post(
            f"{base_url}/api/reminders",
            json={
                "plant_id": "invalid-plant-id",
                "reminder_type": "watering",
                "frequency_days": 3,
                "time_of_day": "09:00"
            },
            headers=headers
        )
        assert response.status_code == 404, "Invalid plant_id should return 404"
        print("✓ Invalid plant_id rejection passed")

    def test_get_all_reminders(self, api_client, base_url, test_user_token):
        """Test GET /api/reminders returns list"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        response = api_client.get(f"{base_url}/api/reminders", headers=headers)
        
        assert response.status_code == 200, f"Get reminders failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Reminders fetch passed: {len(data)} reminders")

    def test_update_reminder(self, api_client, base_url, test_user_token, cleanup_test_data):
        """Test PUT /api/reminders/{id} updates reminder and GET verifies"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Create plant and reminder
        plant_response = api_client.post(
            f"{base_url}/api/garden",
            json={"species_name": "TEST_UpdateReminder"},
            headers=headers
        )
        plant_id = plant_response.json()["id"]
        
        reminder_response = api_client.post(
            f"{base_url}/api/reminders",
            json={"plant_id": plant_id, "frequency_days": 3},
            headers=headers
        )
        reminder_id = reminder_response.json()["id"]
        
        # Update reminder
        update_response = api_client.put(
            f"{base_url}/api/reminders/{reminder_id}",
            json={"frequency_days": 7, "enabled": False},
            headers=headers
        )
        assert update_response.status_code == 200, f"Update reminder failed: {update_response.text}"
        
        updated = update_response.json()
        assert updated["frequency_days"] == 7, "Frequency not updated"
        assert updated["enabled"] == False, "Enabled status not updated"
        print(f"✓ Reminder updated: {reminder_id}")
        
        # Verify with GET
        get_response = api_client.get(f"{base_url}/api/reminders", headers=headers)
        reminders = get_response.json()
        updated_reminder = next((r for r in reminders if r["id"] == reminder_id), None)
        assert updated_reminder["frequency_days"] == 7, "Update not persisted"
        print("✓ Update persistence verified")

    def test_update_nonexistent_reminder(self, api_client, base_url, test_user_token):
        """Test PUT /api/reminders/{invalid_id} returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        response = api_client.put(
            f"{base_url}/api/reminders/invalid-id",
            json={"frequency_days": 5},
            headers=headers
        )
        assert response.status_code == 404, "Update nonexistent reminder should return 404"
        print("✓ Update nonexistent reminder returns 404")

    def test_delete_reminder(self, api_client, base_url, test_user_token, cleanup_test_data):
        """Test DELETE /api/reminders/{id} removes reminder"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Create plant and reminder
        plant_response = api_client.post(
            f"{base_url}/api/garden",
            json={"species_name": "TEST_DeleteReminder"},
            headers=headers
        )
        plant_id = plant_response.json()["id"]
        
        reminder_response = api_client.post(
            f"{base_url}/api/reminders",
            json={"plant_id": plant_id},
            headers=headers
        )
        reminder_id = reminder_response.json()["id"]
        
        # Delete reminder
        delete_response = api_client.delete(
            f"{base_url}/api/reminders/{reminder_id}",
            headers=headers
        )
        assert delete_response.status_code == 200, f"Delete reminder failed: {delete_response.text}"
        print(f"✓ Reminder deleted: {reminder_id}")
        
        # Verify deletion
        get_response = api_client.get(f"{base_url}/api/reminders", headers=headers)
        reminders = get_response.json()
        deleted_reminder = next((r for r in reminders if r["id"] == reminder_id), None)
        assert deleted_reminder is None, "Deleted reminder still exists"
        print("✓ Deletion verified")

    def test_delete_nonexistent_reminder(self, api_client, base_url, test_user_token):
        """Test DELETE /api/reminders/{invalid_id} returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        response = api_client.delete(f"{base_url}/api/reminders/invalid-id", headers=headers)
        
        assert response.status_code == 404, "Delete nonexistent reminder should return 404"
        print("✓ Delete nonexistent reminder returns 404")
