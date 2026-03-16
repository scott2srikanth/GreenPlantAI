import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PlantDetailScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plant, setPlant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderDays, setReminderDays] = useState('3');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [savingReminder, setSavingReminder] = useState(false);

  useEffect(() => { fetchPlant(); }, [id]);

  const fetchPlant = async () => {
    try {
      const res = await fetch(`${API_BASE}/garden/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPlant(await res.json());
    } catch (e) {
      console.log('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const waterPlant = async () => {
    await fetch(`${API_BASE}/garden/${id}/water`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchPlant();
  };

  const addReminder = async () => {
    setSavingReminder(true);
    try {
      const res = await fetch(`${API_BASE}/reminders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plant_id: id,
          reminder_type: 'watering',
          frequency_days: parseInt(reminderDays) || 3,
          time_of_day: reminderTime,
          enabled: true,
        }),
      });
      if (res.ok) {
        Alert.alert('Reminder Set!', `Watering reminder every ${reminderDays} days`);
        setShowReminderModal(false);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create reminder');
    } finally {
      setSavingReminder(false);
    }
  };

  const deletePlant = () => {
    Alert.alert('Remove Plant', 'Remove this plant from your garden?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await fetch(`${API_BASE}/garden/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!plant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Plant not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.heroWrap}>
          {plant.photo_base64 ? (
            <Image source={{ uri: `data:image/jpeg;base64,${plant.photo_base64}` }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="leaf" size={72} color={Colors.primaryLight} />
            </View>
          )}
          <TouchableOpacity style={styles.heroBack} onPress={() => router.back()} testID="detail-back-btn">
            <Ionicons name="arrow-back" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Name Section */}
          <View style={styles.nameSection}>
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.speciesName}>{plant.species_name}</Text>
                {plant.common_names?.length > 0 && (
                  <Text style={styles.commonName}>{plant.common_names.join(', ')}</Text>
                )}
              </View>
              {plant.confidence && (
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>{Math.round(plant.confidence * 100)}%</Text>
                </View>
              )}
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionCard} onPress={waterPlant} testID="detail-water-btn">
              <View style={[styles.actionIcon, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="water" size={24} color={Colors.info} />
              </View>
              <Text style={styles.actionLabel}>Water</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => setShowReminderModal(true)} testID="detail-reminder-btn">
              <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="notifications" size={24} color={Colors.warning} />
              </View>
              <Text style={styles.actionLabel}>Remind</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={deletePlant} testID="detail-delete-btn">
              <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="trash" size={24} color={Colors.danger} />
              </View>
              <Text style={styles.actionLabel}>Remove</Text>
            </TouchableOpacity>
          </View>

          {/* Last Watered */}
          {plant.last_watered && (
            <View style={styles.infoCard}>
              <Ionicons name="water" size={18} color={Colors.info} />
              <Text style={styles.infoText}>
                Last watered: {new Date(plant.last_watered).toLocaleDateString()}
              </Text>
            </View>
          )}

          {/* Description */}
          {plant.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.sectionText}>{plant.description}</Text>
            </View>
          )}

          {/* Care Guide */}
          {(plant.watering_info || plant.light_condition || plant.soil_type) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Care Guide</Text>
              {plant.watering_info && (
                <View style={styles.careRow}>
                  <View style={[styles.careIcon, { backgroundColor: '#E0F2FE' }]}>
                    <Ionicons name="water" size={18} color={Colors.info} />
                  </View>
                  <View style={styles.careInfo}>
                    <Text style={styles.careLabel}>Watering</Text>
                    <Text style={styles.careValue}>{plant.watering_info}</Text>
                  </View>
                </View>
              )}
              {plant.light_condition && (
                <View style={styles.careRow}>
                  <View style={[styles.careIcon, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="sunny" size={18} color={Colors.warning} />
                  </View>
                  <View style={styles.careInfo}>
                    <Text style={styles.careLabel}>Light</Text>
                    <Text style={styles.careValue}>{plant.light_condition}</Text>
                  </View>
                </View>
              )}
              {plant.soil_type && (
                <View style={styles.careRow}>
                  <View style={[styles.careIcon, { backgroundColor: '#F3E8D6' }]}>
                    <Ionicons name="earth" size={18} color="#8B6914" />
                  </View>
                  <View style={styles.careInfo}>
                    <Text style={styles.careLabel}>Soil</Text>
                    <Text style={styles.careValue}>{plant.soil_type}</Text>
                  </View>
                </View>
              )}
              {plant.toxicity && (
                <View style={styles.careRow}>
                  <View style={[styles.careIcon, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                  </View>
                  <View style={styles.careInfo}>
                    <Text style={styles.careLabel}>Toxicity</Text>
                    <Text style={styles.careValue}>{plant.toxicity}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      {/* Reminder Modal */}
      <Modal visible={showReminderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Watering Reminder</Text>
            <Text style={styles.modalSubtitle}>For {plant.species_name}</Text>

            <Text style={styles.inputLabel}>Frequency (days)</Text>
            <TextInput
              testID="reminder-days-input"
              style={styles.modalInput}
              value={reminderDays}
              onChangeText={setReminderDays}
              keyboardType="numeric"
              placeholder="3"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.inputLabel}>Time of Day</Text>
            <TextInput
              testID="reminder-time-input"
              style={styles.modalInput}
              value={reminderTime}
              onChangeText={setReminderTime}
              placeholder="09:00"
              placeholderTextColor={Colors.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowReminderModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, savingReminder && { opacity: 0.7 }]}
                onPress={addReminder}
                disabled={savingReminder}
                testID="save-reminder-btn"
              >
                {savingReminder ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Reminder</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: Colors.textSecondary },
  backButton: { marginTop: Spacing.md, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: Colors.primary, borderRadius: Radius.full },
  backButtonText: { color: Colors.white, fontWeight: '600' },
  heroWrap: { height: 280, backgroundColor: Colors.subtle },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.secondary },
  heroBack: {
    position: 'absolute', top: 12, left: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: Spacing.lg, marginTop: -Spacing.lg, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, backgroundColor: Colors.background },
  nameSection: { marginBottom: Spacing.lg },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  speciesName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, fontStyle: 'italic' },
  commonName: { fontSize: 15, color: Colors.textSecondary, marginTop: 4 },
  confidenceBadge: { backgroundColor: Colors.secondary, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4, marginLeft: Spacing.sm },
  confidenceText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  actionCard: {
    flex: 1, backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md,
    alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  actionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#E0F2FE', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg,
  },
  infoText: { fontSize: 14, color: Colors.textPrimary },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  careRow: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.paper,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  careIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  careInfo: { flex: 1 },
  careLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  careValue: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.paper, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  modalSubtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: Spacing.lg },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.xs },
  modalInput: {
    backgroundColor: Colors.subtle, borderRadius: Radius.md, padding: 14,
    fontSize: 16, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  modalCancel: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: Colors.subtle, borderRadius: Radius.full,
  },
  modalCancelText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  modalSave: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.full,
  },
  modalSaveText: { fontSize: 16, fontWeight: '600', color: Colors.white },
});
