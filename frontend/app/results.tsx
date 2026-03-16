import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ResultsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ resultData: string; imageBase64: string }>();
  const [saving, setSaving] = useState(false);

  let data: any = null;
  try {
    data = params.resultData ? JSON.parse(params.resultData) : null;
  } catch {
    data = null;
  }

  const topMatch = data?.top_match;
  const isPlant = data?.is_plant?.binary !== false;
  const isHealthy = data?.is_healthy?.binary;
  const healthProb = data?.is_healthy?.probability;
  const diseases = data?.diseases || [];
  const suggestions = data?.suggestions || [];

  const saveToGarden = async () => {
    if (!topMatch) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/garden`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          species_name: topMatch.name,
          common_names: topMatch.common_names || [],
          description: topMatch.description,
          photo_base64: params.imageBase64 || null,
          watering_info: topMatch.best_watering,
          light_condition: topMatch.best_light_condition,
          soil_type: topMatch.best_soil_type,
          toxicity: topMatch.toxicity,
          confidence: topMatch.probability,
          health_status: isHealthy === false ? 'unhealthy' : 'healthy',
          health_details: healthProb ? `Health confidence: ${Math.round(healthProb * 100)}%` : null,
          diseases: diseases.filter((d: any) => d.probability > 0.1),
        }),
      });
      if (res.ok) {
        Alert.alert('Saved!', `${topMatch.name} has been added to your garden.`, [
          { text: 'View Garden', onPress: () => router.replace('/(tabs)/garden') },
          { text: 'OK' },
        ]);
      } else {
        Alert.alert('Error', 'Failed to save plant');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to save plant');
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>No Results</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="results-back-btn">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Results</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Image Preview */}
        {params.imageBase64 && (
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${params.imageBase64}` }}
              style={styles.resultImage}
            />
          </View>
        )}

        {/* Is it a Plant? */}
        {!isPlant && (
          <View style={styles.notPlantCard}>
            <Ionicons name="close-circle" size={24} color={Colors.danger} />
            <Text style={styles.notPlantText}>This doesn't appear to be a plant</Text>
          </View>
        )}

        {/* Top Match */}
        {topMatch && (
          <View style={styles.matchCard}>
            <View style={styles.matchHeader}>
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceText}>
                  {Math.round(topMatch.probability * 100)}% Match
                </Text>
              </View>
            </View>
            <Text style={styles.speciesName}>{topMatch.name}</Text>
            {topMatch.common_names?.length > 0 && (
              <Text style={styles.commonNames}>{topMatch.common_names.slice(0, 3).join(', ')}</Text>
            )}
            {topMatch.description && (
              <Text style={styles.description} numberOfLines={4}>{topMatch.description}</Text>
            )}
          </View>
        )}

        {/* Health Status */}
        {data.is_healthy && (
          <View style={[styles.healthCard, isHealthy ? styles.healthyCard : styles.unhealthyCard]}>
            <View style={styles.healthHeader}>
              <Ionicons
                name={isHealthy ? 'heart' : 'heart-dislike'}
                size={24}
                color={isHealthy ? Colors.healthy : Colors.danger}
              />
              <Text style={[styles.healthTitle, { color: isHealthy ? Colors.healthy : Colors.danger }]}>
                {isHealthy ? 'Healthy Plant' : 'Health Issues Detected'}
              </Text>
            </View>
            {healthProb !== undefined && (
              <Text style={styles.healthProb}>
                Health confidence: {Math.round(healthProb * 100)}%
              </Text>
            )}
          </View>
        )}

        {/* Diseases */}
        {diseases.length > 0 && diseases.some((d: any) => d.probability > 0.1) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Health Assessment</Text>
            {diseases.filter((d: any) => d.probability > 0.1).map((disease: any, idx: number) => (
              <View key={idx} style={styles.diseaseCard}>
                <View style={styles.diseaseHeader}>
                  <Ionicons
                    name={disease.is_harmful !== false ? 'warning' : 'checkmark-circle'}
                    size={18}
                    color={disease.is_harmful !== false ? Colors.warning : Colors.healthy}
                  />
                  <Text style={styles.diseaseName}>{disease.name}</Text>
                  <Text style={styles.diseaseProb}>{Math.round(disease.probability * 100)}%</Text>
                </View>
                {disease.description && (
                  <Text style={styles.diseaseDesc} numberOfLines={3}>{disease.description}</Text>
                )}
                {disease.treatment && (
                  <View style={styles.treatmentBox}>
                    {disease.treatment.prevention && (
                      <View style={styles.treatmentRow}>
                        <Ionicons name="shield-checkmark" size={14} color={Colors.primary} />
                        <Text style={styles.treatmentText} numberOfLines={2}>
                          {disease.treatment.prevention}
                        </Text>
                      </View>
                    )}
                    {disease.treatment.biological && (
                      <View style={styles.treatmentRow}>
                        <Ionicons name="leaf" size={14} color={Colors.healthy} />
                        <Text style={styles.treatmentText} numberOfLines={2}>
                          {disease.treatment.biological}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Care Info */}
        {topMatch && (topMatch.best_watering || topMatch.best_light_condition || topMatch.best_soil_type) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Care Guide</Text>
            <View style={styles.careGrid}>
              {topMatch.best_watering && (
                <View style={styles.careItem}>
                  <Ionicons name="water" size={22} color={Colors.info} />
                  <Text style={styles.careLabel}>Watering</Text>
                  <Text style={styles.careValue} numberOfLines={3}>{topMatch.best_watering}</Text>
                </View>
              )}
              {topMatch.best_light_condition && (
                <View style={styles.careItem}>
                  <Ionicons name="sunny" size={22} color={Colors.warning} />
                  <Text style={styles.careLabel}>Light</Text>
                  <Text style={styles.careValue} numberOfLines={3}>{topMatch.best_light_condition}</Text>
                </View>
              )}
              {topMatch.best_soil_type && (
                <View style={styles.careItem}>
                  <Ionicons name="earth" size={22} color="#8B6914" />
                  <Text style={styles.careLabel}>Soil</Text>
                  <Text style={styles.careValue} numberOfLines={3}>{topMatch.best_soil_type}</Text>
                </View>
              )}
              {topMatch.toxicity && (
                <View style={styles.careItem}>
                  <Ionicons name="alert-circle" size={22} color={Colors.danger} />
                  <Text style={styles.careLabel}>Toxicity</Text>
                  <Text style={styles.careValue} numberOfLines={3}>{topMatch.toxicity}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Other Suggestions */}
        {suggestions.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other Possibilities</Text>
            {suggestions.slice(1, 4).map((s: any, idx: number) => (
              <View key={idx} style={styles.otherSuggestion}>
                <Text style={styles.otherName}>{s.name}</Text>
                <Text style={styles.otherProb}>{Math.round(s.probability * 100)}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Save Button */}
        {topMatch && (
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={saveToGarden}
            disabled={saving}
            testID="results-save-btn"
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <View style={styles.saveBtnContent}>
                <Ionicons name="add-circle" size={22} color={Colors.white} />
                <Text style={styles.saveBtnText}>Save to My Garden</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  backButton: { marginTop: Spacing.md, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: Colors.primary, borderRadius: Radius.full },
  backButtonText: { color: Colors.white, fontWeight: '600' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  scrollContent: { padding: Spacing.lg },
  imageWrap: { borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Spacing.md, height: 200 },
  resultImage: { width: '100%', height: '100%' },
  notPlantCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#FEF2F2', padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md,
  },
  notPlantText: { fontSize: 15, fontWeight: '600', color: Colors.danger },
  matchCard: {
    backgroundColor: Colors.paper, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  matchHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: Spacing.sm },
  confidenceBadge: {
    backgroundColor: Colors.secondary, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4,
  },
  confidenceText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  speciesName: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, fontStyle: 'italic' },
  commonNames: { fontSize: 15, color: Colors.textSecondary, marginTop: 4 },
  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginTop: Spacing.sm },
  healthCard: {
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md,
  },
  healthyCard: { backgroundColor: '#E8F5E9' },
  unhealthyCard: { backgroundColor: '#FEF2F2' },
  healthHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  healthTitle: { fontSize: 16, fontWeight: '700' },
  healthProb: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, marginLeft: 36 },
  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  diseaseCard: {
    backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm,
    borderLeftWidth: 3, borderLeftColor: Colors.warning,
  },
  diseaseHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  diseaseName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  diseaseProb: { fontSize: 12, color: Colors.textSecondary },
  diseaseDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: Spacing.xs, lineHeight: 18 },
  treatmentBox: { marginTop: Spacing.sm, gap: Spacing.xs },
  treatmentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  treatmentText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  careGrid: { gap: Spacing.sm },
  careItem: {
    backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md,
    flexDirection: 'column', gap: 4,
  },
  careLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  careValue: { fontSize: 13, color: Colors.textPrimary, lineHeight: 18 },
  otherSuggestion: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.xs,
  },
  otherName: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary, fontStyle: 'italic' },
  otherProb: { fontSize: 13, color: Colors.textSecondary },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full, paddingVertical: 16,
    alignItems: 'center', marginTop: Spacing.sm,
    shadowColor: Colors.primaryDark, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: Colors.white },
});
