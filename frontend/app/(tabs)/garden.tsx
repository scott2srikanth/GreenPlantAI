import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function GardenScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [plants, setPlants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPlants = async () => {
    try {
      const res = await fetch(`${API_BASE}/garden`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPlants(await res.json());
    } catch (e) {
      console.log('Fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchPlants(); }, [token]));

  const deletePlant = async (id: string) => {
    Alert.alert('Remove Plant', 'Remove this plant from your garden?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await fetch(`${API_BASE}/garden/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          fetchPlants();
        },
      },
    ]);
  };

  const waterPlant = async (id: string) => {
    await fetch(`${API_BASE}/garden/${id}/water`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchPlants();
  };

  const renderPlant = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.plantCard}
      onPress={() => router.push({ pathname: '/plant-detail', params: { id: item.id } })}
      testID={`garden-plant-${item.id}`}
      activeOpacity={0.8}
    >
      <View style={styles.plantImageWrap}>
        {item.photo_base64 ? (
          <Image source={{ uri: `data:image/jpeg;base64,${item.photo_base64}` }} style={styles.plantImage} />
        ) : (
          <View style={styles.plantPlaceholder}>
            <Ionicons name="leaf" size={36} color={Colors.primaryLight} />
          </View>
        )}
      </View>
      <View style={styles.plantInfo}>
        <Text style={styles.plantName} numberOfLines={1}>{item.species_name}</Text>
        <Text style={styles.plantCommon} numberOfLines={1}>
          {item.common_names?.[0] || 'Plant'}
        </Text>
        {item.last_watered && (
          <View style={styles.wateredRow}>
            <Ionicons name="water" size={14} color={Colors.info} />
            <Text style={styles.wateredText}>
              Watered {new Date(item.last_watered).toLocaleDateString()}
            </Text>
          </View>
        )}
        {item.confidence && (
          <Text style={styles.confidence}>{Math.round(item.confidence * 100)}% match</Text>
        )}
      </View>
      <View style={styles.plantActions}>
        <TouchableOpacity
          onPress={() => waterPlant(item.id)}
          style={styles.actionBtn}
          testID={`water-plant-${item.id}`}
        >
          <Ionicons name="water" size={18} color={Colors.info} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => deletePlant(item.id)}
          style={styles.actionBtn}
          testID={`delete-plant-${item.id}`}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Garden</Text>
        <Text style={styles.subtitle}>{plants.length} plants</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : plants.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="leaf-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Plants Yet</Text>
          <Text style={styles.emptySubtitle}>Scan a plant to add it to your garden</Text>
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => router.push('/scan')}
            testID="garden-scan-btn"
          >
            <Ionicons name="camera" size={20} color={Colors.white} />
            <Text style={styles.scanBtnText}>Scan Plant</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={plants}
          keyExtractor={(item) => item.id}
          renderItem={renderPlant}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPlants(); }} tintColor={Colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  list: { padding: Spacing.lg, paddingTop: 0 },
  plantCard: {
    flexDirection: 'row', backgroundColor: Colors.paper, borderRadius: Radius.md,
    marginBottom: Spacing.sm, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  plantImageWrap: { width: 90, height: 90 },
  plantImage: { width: '100%', height: '100%' },
  plantPlaceholder: {
    width: '100%', height: '100%', backgroundColor: Colors.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  plantInfo: { flex: 1, padding: Spacing.sm, justifyContent: 'center' },
  plantName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  plantCommon: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  wateredRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  wateredText: { fontSize: 11, color: Colors.textSecondary },
  confidence: { fontSize: 11, color: Colors.primaryLight, marginTop: 2 },
  plantActions: { justifyContent: 'center', paddingRight: Spacing.sm, gap: Spacing.xs },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.md },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: Spacing.xs },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary,
    borderRadius: Radius.full, paddingVertical: 14, paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg, gap: Spacing.sm,
  },
  scanBtnText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
});
