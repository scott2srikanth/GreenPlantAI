import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RemindersScreen() {
  const { token } = useAuth();
  const [reminders, setReminders] = useState<any[]>([]);
  const [plants, setPlants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [remRes, plantsRes] = await Promise.all([
        fetch(`${API_BASE}/reminders`, { headers }),
        fetch(`${API_BASE}/garden`, { headers }),
      ]);
      if (remRes.ok) setReminders(await remRes.json());
      if (plantsRes.ok) setPlants(await plantsRes.json());
    } catch (e) {
      console.log('Fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [token]));

  const toggleReminder = async (id: string, enabled: boolean) => {
    await fetch(`${API_BASE}/reminders/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    fetchData();
  };

  const deleteReminder = async (id: string) => {
    Alert.alert('Delete Reminder', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await fetch(`${API_BASE}/reminders/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          fetchData();
        },
      },
    ]);
  };

  const getPlantName = (plantId: string) => {
    const plant = plants.find(p => p.id === plantId);
    return plant?.species_name || 'Unknown Plant';
  };

  const isOverdue = (nextReminder: string) => {
    if (!nextReminder) return false;
    return new Date(nextReminder) <= new Date();
  };

  const renderReminder = ({ item }: { item: any }) => {
    const overdue = isOverdue(item.next_reminder);
    return (
      <View
        style={[styles.reminderCard, overdue && styles.overdueCard]}
        testID={`reminder-${item.id}`}
      >
        <View style={styles.reminderHeader}>
          <View style={styles.reminderLeft}>
            <View style={[styles.iconWrap, { backgroundColor: overdue ? '#FEE2E2' : '#E0F2FE' }]}>
              <Ionicons
                name={item.reminder_type === 'watering' ? 'water' : 'sunny'}
                size={20}
                color={overdue ? Colors.danger : Colors.info}
              />
            </View>
            <View style={styles.reminderInfo}>
              <Text style={styles.plantName}>{getPlantName(item.plant_id)}</Text>
              <Text style={styles.reminderType}>
                {item.reminder_type} - Every {item.frequency_days} days at {item.time_of_day}
              </Text>
              {item.next_reminder && (
                <Text style={[styles.nextDate, overdue && styles.overdueText]}>
                  {overdue ? 'Overdue!' : `Next: ${new Date(item.next_reminder).toLocaleDateString()}`}
                </Text>
              )}
            </View>
          </View>
          <Switch
            testID={`toggle-reminder-${item.id}`}
            value={item.enabled}
            onValueChange={() => toggleReminder(item.id, item.enabled)}
            trackColor={{ false: '#E5E5E5', true: Colors.primaryLight }}
            thumbColor={item.enabled ? Colors.primary : '#F4F3F4'}
          />
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => deleteReminder(item.id)}
          testID={`delete-reminder-${item.id}`}
        >
          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          <Text style={styles.deleteText}>Remove</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Care Reminders</Text>
        <Text style={styles.subtitle}>{reminders.length} active reminders</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : reminders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Reminders</Text>
          <Text style={styles.emptySubtitle}>Add reminders from your plant details page</Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item.id}
          renderItem={renderReminder}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={Colors.primary} />
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
  reminderCard: {
    backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  overdueCard: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reminderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: Spacing.sm },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm,
  },
  reminderInfo: { flex: 1 },
  plantName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  reminderType: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  nextDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  overdueText: { color: Colors.danger, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-end', marginTop: Spacing.sm, paddingVertical: 4,
  },
  deleteText: { fontSize: 12, color: Colors.danger },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.md },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' },
});
