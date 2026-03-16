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

type TabKey = 'about' | 'health' | 'care' | 'problems';

export default function PlantDetailScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plant, setPlant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('about');
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [reminderDays, setReminderDays] = useState('3');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [savingReminder, setSavingReminder] = useState(false);
  const [editField, setEditField] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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
    Alert.alert('Watered!', 'Plant watering logged');
  };

  const addReminder = async () => {
    setSavingReminder(true);
    try {
      const res = await fetch(`${API_BASE}/reminders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plant_id: id, reminder_type: 'watering',
          frequency_days: parseInt(reminderDays) || 3, time_of_day: reminderTime, enabled: true,
        }),
      });
      if (res.ok) {
        Alert.alert('Reminder Set!', `Watering reminder every ${reminderDays} days`);
        setShowReminderModal(false);
      }
    } catch (e) { Alert.alert('Error', 'Failed to create reminder'); }
    finally { setSavingReminder(false); }
  };

  const openEditModal = (field: string, label: string, currentValue: string) => {
    setEditField(field);
    setEditLabel(label);
    setEditValue(currentValue || '');
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const res = await fetch(`${API_BASE}/garden/${id}/care`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [editField]: editValue }),
      });
      if (res.ok) {
        await fetchPlant();
        setShowEditModal(false);
      }
    } catch (e) { Alert.alert('Error', 'Failed to update'); }
    finally { setSavingEdit(false); }
  };

  const deletePlant = () => {
    Alert.alert('Remove Plant', 'Remove this plant from your garden?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await fetch(`${API_BASE}/garden/${id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
          });
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
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

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'about', label: 'About', icon: 'information-circle' },
    { key: 'health', label: 'Health', icon: 'heart' },
    { key: 'care', label: 'Care', icon: 'water' },
    { key: 'problems', label: 'Issues', icon: 'warning' },
  ];

  const renderAboutTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.nameSection}>
        <Text style={styles.speciesName}>{plant.species_name}</Text>
        {plant.common_names?.length > 0 && (
          <Text style={styles.commonName}>{plant.common_names.join(', ')}</Text>
        )}
        {plant.confidence && (
          <View style={styles.badgeRow}>
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>{Math.round(plant.confidence * 100)}% match</Text>
            </View>
          </View>
        )}
      </View>
      {plant.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.sectionText}>{plant.description}</Text>
        </View>
      )}
      {plant.toxicity && (
        <View style={[styles.infoCard, { backgroundColor: '#FEF2F2' }]}>
          <Ionicons name="alert-circle" size={18} color={Colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Toxicity</Text>
            <Text style={styles.infoValue}>{plant.toxicity}</Text>
          </View>
        </View>
      )}
      {plant.last_watered && (
        <View style={[styles.infoCard, { backgroundColor: '#E0F2FE' }]}>
          <Ionicons name="water" size={18} color={Colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Last Watered</Text>
            <Text style={styles.infoValue}>{new Date(plant.last_watered).toLocaleDateString()}</Text>
          </View>
        </View>
      )}
    </View>
  );

  const renderHealthTab = () => (
    <View style={styles.tabContent}>
      <View style={[styles.healthBanner, plant.health_status === 'unhealthy' ? styles.unhealthyBanner : styles.healthyBanner]}>
        <Ionicons
          name={plant.health_status === 'unhealthy' ? 'heart-dislike' : 'heart'}
          size={28}
          color={plant.health_status === 'unhealthy' ? Colors.danger : Colors.healthy}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.healthStatusText, { color: plant.health_status === 'unhealthy' ? Colors.danger : Colors.healthy }]}>
            {plant.health_status === 'unhealthy' ? 'Health Issues Detected' : 'Plant Looks Healthy'}
          </Text>
          {plant.health_details && (
            <Text style={styles.healthDetailText}>{plant.health_details}</Text>
          )}
        </View>
      </View>

      {plant.diseases && plant.diseases.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detected Conditions</Text>
          {plant.diseases.map((d: any, i: number) => (
            <View key={i} style={styles.diseaseCard}>
              <View style={styles.diseaseHeader}>
                <Ionicons name="bug" size={18} color={Colors.warning} />
                <Text style={styles.diseaseName}>{d.name}</Text>
                {d.probability && <Text style={styles.diseaseProb}>{Math.round(d.probability * 100)}%</Text>}
              </View>
              {d.description && <Text style={styles.diseaseDesc}>{d.description}</Text>}
              {d.treatment && (
                <View style={styles.treatmentBox}>
                  {d.treatment.prevention && (
                    <View style={styles.treatmentItem}>
                      <Ionicons name="shield-checkmark" size={14} color={Colors.primary} />
                      <Text style={styles.treatmentText}>{Array.isArray(d.treatment.prevention) ? d.treatment.prevention.join(', ') : d.treatment.prevention}</Text>
                    </View>
                  )}
                  {d.treatment.biological && (
                    <View style={styles.treatmentItem}>
                      <Ionicons name="leaf" size={14} color={Colors.healthy} />
                      <Text style={styles.treatmentText}>{Array.isArray(d.treatment.biological) ? d.treatment.biological.join(', ') : d.treatment.biological}</Text>
                    </View>
                  )}
                  {d.treatment.chemical && (
                    <View style={styles.treatmentItem}>
                      <Ionicons name="flask" size={14} color={Colors.info} />
                      <Text style={styles.treatmentText}>{Array.isArray(d.treatment.chemical) ? d.treatment.chemical.join(', ') : d.treatment.chemical}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptySection}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.healthy} />
          <Text style={styles.emptyText}>No health issues detected</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.chatBtn}
        onPress={() => router.push({ pathname: '/botanist-chat', params: { plantId: id, plantName: plant.species_name } })}
        testID="health-chat-btn"
      >
        <Ionicons name="chatbubbles" size={20} color={Colors.white} />
        <Text style={styles.chatBtnText}>Ask AI Botanist for Treatment Advice</Text>
      </TouchableOpacity>
    </View>
  );

  const careFields: { field: string; label: string; icon: string; iconColor: string; bgColor: string }[] = [
    { field: 'soil_type', label: 'Soil', icon: 'earth', iconColor: '#8B6914', bgColor: '#F3E8D6' },
    { field: 'light_condition', label: 'Light', icon: 'sunny', iconColor: '#E6B050', bgColor: '#FEF3C7' },
    { field: 'temperature', label: 'Temperature', icon: 'thermometer', iconColor: '#D35D47', bgColor: '#FEE2E2' },
    { field: 'watering_info', label: 'Water', icon: 'water', iconColor: '#4A90E2', bgColor: '#E0F2FE' },
    { field: 'repot_cycle', label: 'Repot Cycle', icon: 'flower', iconColor: '#7C3AED', bgColor: '#EDE9FE' },
    { field: 'prune_cycle', label: 'Prune Cycle', icon: 'cut', iconColor: '#059669', bgColor: '#D1FAE5' },
  ];

  const renderCareTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Plant Care Guide</Text>
      <Text style={styles.sectionSubtitle}>Tap any field to edit</Text>
      {careFields.map((cf) => (
        <TouchableOpacity
          key={cf.field}
          style={styles.careCard}
          onPress={() => openEditModal(cf.field, cf.label, plant[cf.field])}
          testID={`care-edit-${cf.field}`}
        >
          <View style={[styles.careIconWrap, { backgroundColor: cf.bgColor }]}>
            <Ionicons name={cf.icon as any} size={22} color={cf.iconColor} />
          </View>
          <View style={styles.careInfo}>
            <Text style={styles.careLabel}>{cf.label}</Text>
            <Text style={styles.careValue} numberOfLines={2}>
              {plant[cf.field] || 'Tap to add info'}
            </Text>
          </View>
          <Ionicons name="create-outline" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderProblemsTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Common Problems</Text>
      {plant.common_problems ? (
        <View style={styles.problemsCard}>
          <Text style={styles.problemsText}>{plant.common_problems}</Text>
        </View>
      ) : (
        <View style={styles.emptySection}>
          <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No common problems recorded</Text>
          <Text style={styles.emptySubtext}>Ask the AI Botanist about common issues</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.chatBtn}
        onPress={() => router.push({ pathname: '/botanist-chat', params: { plantId: id, plantName: plant.species_name } })}
        testID="problems-chat-btn"
      >
        <Ionicons name="chatbubbles" size={20} color={Colors.white} />
        <Text style={styles.chatBtnText}>Ask AI Botanist About Issues</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
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
          {/* Action buttons on hero */}
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroActionBtn} onPress={waterPlant} testID="detail-water-btn">
              <Ionicons name="water" size={18} color={Colors.info} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroActionBtn} onPress={() => setShowReminderModal(true)} testID="detail-reminder-btn">
              <Ionicons name="notifications" size={18} color={Colors.warning} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroActionBtn}
              onPress={() => router.push({ pathname: '/botanist-chat', params: { plantId: id, plantName: plant.species_name } })}
              testID="detail-chat-btn"
            >
              <Ionicons name="chatbubbles" size={18} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroActionBtn} onPress={deletePlant} testID="detail-delete-btn">
              <Ionicons name="trash" size={18} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              testID={`tab-${tab.key}`}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={activeTab === tab.key ? Colors.primary : Colors.textMuted}
              />
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === 'about' && renderAboutTab()}
        {activeTab === 'health' && renderHealthTab()}
        {activeTab === 'care' && renderCareTab()}
        {activeTab === 'problems' && renderProblemsTab()}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Reminder Modal */}
      <Modal visible={showReminderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Watering Reminder</Text>
            <Text style={styles.modalSubtitle}>For {plant.species_name}</Text>
            <Text style={styles.inputLabel}>Frequency (days)</Text>
            <TextInput testID="reminder-days-input" style={styles.modalInput} value={reminderDays} onChangeText={setReminderDays} keyboardType="numeric" placeholder="3" placeholderTextColor={Colors.textMuted} />
            <Text style={styles.inputLabel}>Time of Day</Text>
            <TextInput testID="reminder-time-input" style={styles.modalInput} value={reminderTime} onChangeText={setReminderTime} placeholder="09:00" placeholderTextColor={Colors.textMuted} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowReminderModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, savingReminder && { opacity: 0.7 }]} onPress={addReminder} disabled={savingReminder} testID="save-reminder-btn">
                {savingReminder ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Care Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit {editLabel}</Text>
            <TextInput
              testID="edit-care-input"
              style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={`Enter ${editLabel.toLowerCase()} info...`}
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, savingEdit && { opacity: 0.7 }]} onPress={saveEdit} disabled={savingEdit} testID="save-care-btn">
                {savingEdit ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.modalSaveText}>Save</Text>}
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
  heroWrap: { height: 260, backgroundColor: Colors.subtle },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.secondary },
  heroBack: {
    position: 'absolute', top: 12, left: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  heroActions: {
    position: 'absolute', bottom: 12, right: 16, flexDirection: 'row', gap: 8,
  },
  heroActionBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.paper, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.sm,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 13, fontWeight: '500', color: Colors.textMuted },
  tabLabelActive: { color: Colors.primary, fontWeight: '700' },
  tabContent: { padding: Spacing.lg },
  nameSection: { marginBottom: Spacing.lg },
  speciesName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, fontStyle: 'italic' },
  commonName: { fontSize: 15, color: Colors.textSecondary, marginTop: 4 },
  badgeRow: { flexDirection: 'row', marginTop: Spacing.sm },
  confidenceBadge: { backgroundColor: Colors.secondary, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  confidenceText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  sectionSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.md },
  sectionText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  infoLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, color: Colors.textPrimary, marginTop: 1 },
  healthBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg,
  },
  healthyBanner: { backgroundColor: '#E8F5E9' },
  unhealthyBanner: { backgroundColor: '#FEF2F2' },
  healthStatusText: { fontSize: 18, fontWeight: '700' },
  healthDetailText: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  diseaseCard: {
    backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm, borderLeftWidth: 3, borderLeftColor: Colors.warning,
  },
  diseaseHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  diseaseName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  diseaseProb: { fontSize: 12, color: Colors.textSecondary },
  diseaseDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: Spacing.xs, lineHeight: 18 },
  treatmentBox: { marginTop: Spacing.sm, gap: 6 },
  treatmentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  treatmentText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  emptySection: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.md },
  emptySubtext: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.full, paddingVertical: 14, marginTop: Spacing.md,
  },
  chatBtnText: { fontSize: 15, fontWeight: '600', color: Colors.white },
  careCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.paper,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  careIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  careInfo: { flex: 1 },
  careLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  careValue: { fontSize: 14, color: Colors.textPrimary, marginTop: 2 },
  problemsCard: { backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.lg },
  problemsText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
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
  modalCancel: { flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: Colors.subtle, borderRadius: Radius.full },
  modalCancelText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  modalSave: { flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: Radius.full },
  modalSaveText: { fontSize: 16, fontWeight: '600', color: Colors.white },
});
