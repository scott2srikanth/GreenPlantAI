import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [plants, setPlants] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [plantsRes, remindersRes] = await Promise.all([
        fetch(`${API_BASE}/garden`, { headers }),
        fetch(`${API_BASE}/reminders`, { headers }),
      ]);
      if (plantsRes.ok) setPlants(await plantsRes.json());
      if (remindersRes.ok) setReminders(await remindersRes.json());
    } catch (e) {
      console.log('Fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [token]));

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const dueReminders = reminders.filter(r => {
    if (!r.enabled) return false;
    if (!r.next_reminder) return true;
    return new Date(r.next_reminder) <= new Date();
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.userName}>{user?.name || 'Plant Lover'}</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => router.push('/profile')}
            activeOpacity={0.85}
            testID="home-profile-btn"
          >
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={24} color={Colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Scan Card */}
        <TouchableOpacity
          testID="home-scan-btn"
          style={styles.scanCard}
          onPress={() => router.push('/scan')}
          activeOpacity={0.9}
        >
          <View style={styles.scanCardContent}>
            <View style={styles.scanIconWrap}>
              <Ionicons name="scan" size={32} color={Colors.white} />
            </View>
            <View style={styles.scanTextWrap}>
              <Text style={styles.scanTitle}>Identify a Plant</Text>
              <Text style={styles.scanSubtitle}>Take a photo or pick from gallery</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.white} />
          </View>
        </TouchableOpacity>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="leaf" size={24} color={Colors.primary} />
            <Text style={styles.statNumber}>{plants.length}</Text>
            <Text style={styles.statLabel}>Plants</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="water" size={24} color={Colors.info} />
            <Text style={styles.statNumber}>{dueReminders.length}</Text>
            <Text style={styles.statLabel}>Due Today</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="notifications" size={24} color={Colors.warning} />
            <Text style={styles.statNumber}>{reminders.length}</Text>
            <Text style={styles.statLabel}>Reminders</Text>
          </View>
        </View>

        {/* Due Reminders */}
        {dueReminders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs Attention</Text>
            {dueReminders.slice(0, 3).map((r) => {
              const plant = plants.find(p => p.id === r.plant_id);
              return (
                <View key={r.id} style={styles.reminderCard} testID={`due-reminder-${r.id}`}>
                  <View style={styles.reminderLeft}>
                    <Ionicons name="water" size={20} color={Colors.info} />
                  </View>
                  <View style={styles.reminderInfo}>
                    <Text style={styles.reminderPlant}>{plant?.species_name || 'Unknown Plant'}</Text>
                    <Text style={styles.reminderType}>{r.reminder_type} - Every {r.frequency_days} days</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </View>
              );
            })}
          </View>
        )}

        {/* Recent Plants */}
        {plants.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Plants</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/garden')}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.plantScroll}>
              {plants.slice(0, 5).map((plant) => (
                <TouchableOpacity
                  key={plant.id}
                  style={styles.plantCard}
                  onPress={() => router.push({ pathname: '/plant-detail', params: { id: plant.id } })}
                  testID={`recent-plant-${plant.id}`}
                >
                  <View style={styles.plantImagePlaceholder}>
                    {plant.photo_base64 ? (
                      <Image source={{ uri: `data:image/jpeg;base64,${plant.photo_base64}` }} style={styles.plantImage} />
                    ) : (
                      <Ionicons name="leaf" size={32} color={Colors.primaryLight} />
                    )}
                  </View>
                  <Text style={styles.plantName} numberOfLines={1}>{plant.species_name}</Text>
                  <Text style={styles.plantCommon} numberOfLines={1}>
                    {plant.common_names?.[0] || 'Plant'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Empty State */}
        {!loading && plants.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="leaf-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Your Garden is Empty</Text>
            <Text style={styles.emptySubtitle}>Scan your first plant to get started!</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/scan')}
              testID="empty-scan-btn"
            >
              <Ionicons name="camera" size={20} color={Colors.white} />
              <Text style={styles.emptyBtnText}>Scan a Plant</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
  },
  greeting: { fontSize: 16, color: Colors.textSecondary },
  userName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },
  avatarContainer: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  scanCard: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.primary,
    borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg,
    shadowColor: Colors.primaryDark, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  scanCardContent: { flexDirection: 'row', alignItems: 'center' },
  scanIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
  },
  scanTextWrap: { flex: 1 },
  scanTitle: { fontSize: 18, fontWeight: '700', color: Colors.white },
  scanSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  statsRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1, backgroundColor: Colors.paper, borderRadius: Radius.md,
    padding: Spacing.md, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  statNumber: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.xs },
  statLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  seeAll: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  reminderCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.paper,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, padding: Spacing.md,
    borderRadius: Radius.md, borderLeftWidth: 3, borderLeftColor: Colors.info,
  },
  reminderLeft: { marginRight: Spacing.md },
  reminderInfo: { flex: 1 },
  reminderPlant: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  reminderType: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  plantScroll: { paddingLeft: Spacing.lg, paddingRight: Spacing.sm },
  plantCard: {
    width: 140, backgroundColor: Colors.paper, borderRadius: Radius.md,
    marginRight: Spacing.sm, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  plantImagePlaceholder: {
    height: 120, backgroundColor: Colors.subtle, alignItems: 'center', justifyContent: 'center',
  },
  plantImage: { width: '100%', height: '100%' },
  plantName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm },
  plantCommon: { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: Spacing.sm, paddingBottom: Spacing.sm },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.md },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary,
    borderRadius: Radius.full, paddingVertical: 14, paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg, gap: Spacing.sm,
  },
  emptyBtnText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  loadingWrap: { paddingVertical: Spacing.xxl },
});
