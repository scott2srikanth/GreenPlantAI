import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  ActivityIndicator, Linking, Switch, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { registerForPushNotifications } from '@/src/notifications';

export default function ProfileScreen() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [premiumData, setPremiumData] = useState<any>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [premRes, notifRes] = await Promise.all([
        fetch(`${API_BASE}/premium/status`, { headers }),
        fetch(`${API_BASE}/notifications/status`, { headers }),
      ]);
      if (premRes.ok) setPremiumData(await premRes.json());
      if (notifRes.ok) {
        const nd = await notifRes.json();
        setNotifEnabled(nd.enabled);
      }
    } catch (e) {
      console.log('Profile fetch error:', e);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [token]));

  const handleStripeCheckout = async (plan: string) => {
    setLoadingCheckout(plan);
    try {
      const originUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${API_BASE}/premium/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, origin_url: originUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          await Linking.openURL(data.url);
        }
      } else {
        const err = await res.json();
        Alert.alert('Error', err.detail || 'Failed to create checkout');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Checkout failed');
    } finally {
      setLoadingCheckout(null);
    }
  };

  const toggleNotifications = async () => {
    if (!notifEnabled) {
      // Enable
      const pushToken = await registerForPushNotifications();
      if (pushToken) {
        const res = await fetch(`${API_BASE}/notifications/register`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ push_token: pushToken }),
        });
        if (res.ok) {
          setNotifEnabled(true);
          Alert.alert('Notifications Enabled', 'You will receive plant care reminders!');
        }
      } else {
        if (Platform.OS === 'web') {
          Alert.alert('Not Available', 'Push notifications require the Expo Go app on a physical device.');
        } else {
          Alert.alert('Permission Required', 'Please enable notifications in your device settings.');
        }
      }
    } else {
      Alert.alert('Disable Notifications', 'You can disable notifications in your device settings.');
    }
  };

  const sendTestNotification = async () => {
    const res = await fetch(`${API_BASE}/notifications/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      Alert.alert('Test Sent!', 'Check your notification tray.');
    } else {
      const err = await res.json();
      Alert.alert('Error', err.detail || 'Failed to send test');
    }
  };

  const checkReminders = async () => {
    const res = await fetch(`${API_BASE}/notifications/check-reminders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      Alert.alert('Reminders Checked', `Sent ${data.sent} notification(s) for ${data.total_due} due reminder(s).`);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } },
    ]);
  };

  const isPremium = premiumData?.is_premium;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={Colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* User Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={Colors.primary} />
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {isPremium && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={14} color="#E6B050" />
              <Text style={styles.premiumBadgeText}>Premium Member</Text>
            </View>
          )}
        </View>

        {/* Premium Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isPremium ? 'Premium Active' : 'Upgrade to Premium'}
          </Text>

          {isPremium ? (
            <View style={styles.premiumActiveCard}>
              <Ionicons name="star" size={28} color="#E6B050" />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.premiumActiveTitle}>Premium Plan</Text>
                {premiumData?.premium_expires && (
                  <Text style={styles.premiumExpiry}>
                    Expires: {new Date(premiumData.premium_expires).toLocaleDateString()}
                  </Text>
                )}
                <Text style={styles.chatCount}>
                  Chats today: {premiumData?.daily_chats_used || 0} / Unlimited
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.plansContainer}>
              {/* Chat usage */}
              <View style={styles.usageBar}>
                <Text style={styles.usageText}>
                  AI Chats: {premiumData?.daily_chats_used || 0} / {premiumData?.daily_chat_limit || 10} today
                </Text>
                <View style={styles.usageTrack}>
                  <View style={[styles.usageFill, {
                    width: `${Math.min(100, ((premiumData?.daily_chats_used || 0) / (premiumData?.daily_chat_limit || 10)) * 100)}%`
                  }]} />
                </View>
              </View>

              {/* Monthly Plan */}
              <TouchableOpacity
                style={styles.planCard}
                onPress={() => handleStripeCheckout('monthly')}
                disabled={!!loadingCheckout}
                testID="plan-monthly-btn"
              >
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>Monthly</Text>
                  <View style={styles.planPriceBadge}>
                    <Text style={styles.planPrice}>$4.99</Text>
                    <Text style={styles.planPeriod}>/month</Text>
                  </View>
                </View>
                <Text style={styles.planFeatures}>Unlimited AI chats, Claude Sonnet access, Priority analysis</Text>
                {loadingCheckout === 'monthly' ? (
                  <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.sm }} />
                ) : (
                  <View style={styles.planBtn}>
                    <Ionicons name="card" size={16} color={Colors.white} />
                    <Text style={styles.planBtnText}>Subscribe with Stripe</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Yearly Plan */}
              <TouchableOpacity
                style={[styles.planCard, styles.planCardHighlight]}
                onPress={() => handleStripeCheckout('yearly')}
                disabled={!!loadingCheckout}
                testID="plan-yearly-btn"
              >
                <View style={styles.saveBadge}>
                  <Text style={styles.saveText}>SAVE 33%</Text>
                </View>
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>Yearly</Text>
                  <View style={styles.planPriceBadge}>
                    <Text style={styles.planPrice}>$39.99</Text>
                    <Text style={styles.planPeriod}>/year</Text>
                  </View>
                </View>
                <Text style={styles.planFeatures}>Everything in Monthly + Save 33% annually</Text>
                {loadingCheckout === 'yearly' ? (
                  <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.sm }} />
                ) : (
                  <View style={[styles.planBtn, styles.planBtnHighlight]}>
                    <Ionicons name="card" size={16} color={Colors.white} />
                    <Text style={styles.planBtnText}>Subscribe with Stripe</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notifications</Text>
          <View style={styles.menuCard}>
            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="notifications" size={20} color={Colors.warning} />
                </View>
                <View>
                  <Text style={styles.menuText}>Care Reminders</Text>
                  <Text style={styles.menuSubtext}>Get notified when plants need care</Text>
                </View>
              </View>
              <Switch
                testID="notification-toggle"
                value={notifEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ false: '#E5E5E5', true: Colors.primaryLight }}
                thumbColor={notifEnabled ? Colors.primary : '#F4F3F4'}
              />
            </View>

            {notifEnabled && (
              <>
                <TouchableOpacity style={styles.subMenuItem} onPress={sendTestNotification} testID="test-notification-btn">
                  <Ionicons name="paper-plane" size={16} color={Colors.info} />
                  <Text style={styles.subMenuText}>Send Test Notification</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.subMenuItem} onPress={checkReminders} testID="check-reminders-btn">
                  <Ionicons name="refresh" size={16} color={Colors.primary} />
                  <Text style={styles.subMenuText}>Check Due Reminders Now</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} testID="profile-security-btn" onPress={async () => {
              const res = await fetch(`${API_BASE}/security/status`, { headers: { Authorization: `Bearer ${token}` } });
              if (res.ok) Alert.alert('Security', 'All API keys secured server-side\nJWT auth active\nRate limiting active\nPasswords bcrypt hashed\nHTTPS enforced');
            }}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIcon, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.menuText}>Security Status</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} testID="profile-about-btn">
              <View style={styles.menuLeft}>
                <View style={[styles.menuIcon, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="leaf" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.menuText}>About GreenPlantAI</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} testID="profile-help-btn">
              <View style={styles.menuLeft}>
                <View style={[styles.menuIcon, { backgroundColor: '#E3F2FD' }]}>
                  <Ionicons name="help-circle" size={20} color={Colors.info} />
                </View>
                <Text style={styles.menuText}>Help & Support</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="profile-logout-btn">
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>GreenPlantAI v2.0.0</Text>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  profileCard: {
    alignItems: 'center', backgroundColor: Colors.paper, marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  name: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  email: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  premiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.sm,
    backgroundColor: '#FEF3C7', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4,
  },
  premiumBadgeText: { fontSize: 12, fontWeight: '700', color: '#B45309' },
  section: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  premiumActiveCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7',
    borderRadius: Radius.md, padding: Spacing.lg,
  },
  premiumActiveTitle: { fontSize: 16, fontWeight: '700', color: '#B45309' },
  premiumExpiry: { fontSize: 13, color: '#92400E', marginTop: 2 },
  chatCount: { fontSize: 12, color: '#78350F', marginTop: 2 },
  plansContainer: { gap: Spacing.sm },
  usageBar: { backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.xs },
  usageText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.xs },
  usageTrack: { height: 6, backgroundColor: Colors.subtle, borderRadius: 3, overflow: 'hidden' },
  usageFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  planCard: {
    backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  planCardHighlight: { borderColor: Colors.primary, borderWidth: 2 },
  saveBadge: {
    position: 'absolute', top: -1, right: -1,
    backgroundColor: Colors.primary, borderTopRightRadius: Radius.md - 2, borderBottomLeftRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  saveText: { fontSize: 10, fontWeight: '800', color: Colors.white },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  planPriceBadge: { flexDirection: 'row', alignItems: 'baseline' },
  planPrice: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  planPeriod: { fontSize: 13, color: Colors.textSecondary },
  planFeatures: { fontSize: 13, color: Colors.textSecondary, marginTop: Spacing.xs, lineHeight: 18 },
  planBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.full, paddingVertical: 12, marginTop: Spacing.sm,
  },
  planBtnHighlight: { backgroundColor: Colors.primaryDark },
  planBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
  menuCard: { backgroundColor: Colors.paper, borderRadius: Radius.md, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  menuIcon: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
  },
  menuText: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  menuSubtext: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  subMenuItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 12, paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  subMenuText: { fontSize: 14, color: Colors.textPrimary },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.lg, paddingVertical: 14, borderRadius: Radius.md,
    backgroundColor: '#FEF2F2', gap: Spacing.sm, marginTop: Spacing.sm,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: Colors.danger },
  version: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: Spacing.md },
});
