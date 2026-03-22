import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking, Switch, Platform, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { useDialog } from '@/src/DialogContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { registerForPushNotifications } from '@/src/notifications';

function getCountryCodeFromLocale(): string {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
  const match = locale.match(/[-_](\w{2})$/);
  return match?.[1]?.toUpperCase() || 'US';
}

export default function ProfileScreen() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const { showAlert } = useDialog();
  const [premiumData, setPremiumData] = useState<any>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const countryCode = getCountryCodeFromLocale();

  const confirmAction = (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>
  ) => {
    showAlert(title, message, [
      { label: 'Cancel', kind: 'cancel' },
      { label: 'Confirm', kind: 'destructive', onPress: () => void onConfirm() },
    ]);
  };

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [premRes, notifRes] = await Promise.all([
        fetch(`${API_BASE}/premium/status?country_code=${countryCode}`, { headers }),
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

  useFocusEffect(useCallback(() => { fetchData(); }, [token, countryCode]));

  const startCheckout = async (plan: string, entryPoint: 'stripe' | 'gpay') => {
    setLoadingCheckout(`${plan}-${entryPoint}`);
    try {
      const originUrl = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/\/+$/, '');
      const res = await fetch(`${API_BASE}/premium/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, origin_url: originUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          router.push({
            pathname: '/payment-webview',
            params: {
              checkoutUrl: encodeURIComponent(data.url),
              plan,
            },
          });
        }
      } else {
        const err = await res.json();
        showAlert('Error', err.detail || 'Failed to create checkout');
      }
    } catch (e: any) {
      showAlert('Error', e.message || 'Checkout failed');
    } finally {
      setLoadingCheckout(null);
    }
  };

  const handleStripeCheckout = async (plan: string) => {
    await startCheckout(plan, 'stripe');
  };

  const handleGooglePayCheckout = async (plan: string) => {
    showAlert(
      'Google Pay',
      'This opens Google Pay as a manual UPI payment to the configured business VPA. Premium is not auto-activated by this path yet.',
      [
        { label: 'Cancel', kind: 'cancel' },
        { label: 'Continue', kind: 'primary', onPress: () => startGooglePay(plan) },
      ]
    );
  };

  const handleGooglePayTestPay = async () => {
    showAlert(
      'Google Pay Test',
      'This opens a Rs 1 Google Pay test payment. It is only for testing the wallet flow and does not activate premium.',
      [
        { label: 'Cancel', kind: 'cancel' },
        { label: 'Continue', kind: 'primary', onPress: () => startGooglePay('monthly', true) },
      ]
    );
  };

  const startGooglePay = async (plan: string, testMode = false) => {
    setLoadingCheckout(testMode ? 'gpay-test' : `${plan}-gpay`);
    try {
      const res = await fetch(`${API_BASE}/premium/upi-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, country_code: countryCode, test_mode: testMode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to create UPI payment link' }));
        showAlert('Google Pay', err.detail || 'Failed to create UPI payment link');
        return;
      }

      const data = await res.json();
      const taxLine = data.tax_name ? `\n${data.tax_name}: Rs ${Number(data.tax_amount || 0).toFixed(2)}` : '';
      showAlert(
        testMode ? 'Google Pay Test Amount' : 'Google Pay Amount',
        testMode
          ? `You are about to pay Rs ${Number(data.amount || 0).toFixed(2)} as a test payment.`
          : `You are about to pay Rs ${Number(data.amount || 0).toFixed(2)}.${taxLine}\nExchange rate used: ${Number(data.exchange_rate || 0).toFixed(4)} INR per USD.`,
        [
          { label: 'Cancel', kind: 'cancel' },
          {
            label: 'Open Google Pay',
            kind: 'primary',
            onPress: async () => {
              const preferredUrl = Platform.OS === 'android' ? data.gpay_url || data.upi_url : data.upi_url;
              const canOpenPreferred = await Linking.canOpenURL(preferredUrl);

              if (canOpenPreferred) {
                await Linking.openURL(preferredUrl);
              } else if (data.upi_url && await Linking.canOpenURL(data.upi_url)) {
                await Linking.openURL(data.upi_url);
              } else {
                showAlert('Google Pay', 'No compatible UPI app was found on this device.');
              }
            },
          },
        ]
      );
    } catch (e: any) {
      showAlert('Google Pay', e.message || 'Failed to open Google Pay');
    } finally {
      setLoadingCheckout(null);
    }
  };

  const toggleNotifications = async () => {
    if (notificationBusy) return;

    if (notifEnabled) {
      showAlert(
        'Manage Notifications',
        'Notifications are already enabled. To turn them off, open your device settings for this app.',
        [
          { label: 'Cancel', kind: 'cancel' },
          { label: 'Open Settings', kind: 'primary', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    setNotificationBusy(true);
    try {
      const pushToken = await registerForPushNotifications();
      if (pushToken) {
        const res = await fetch(`${API_BASE}/notifications/register`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ push_token: pushToken }),
        });
        if (res.ok) {
          setNotifEnabled(true);
          showAlert('Notifications Enabled', 'You will receive plant care reminders!');
        } else {
          const err = await res.json().catch(() => ({ detail: 'Failed to register notifications' }));
          showAlert('Notification Error', err.detail || 'Failed to register notifications');
        }
      } else {
        if (Platform.OS === 'web') {
          showAlert('Not Available', 'Push notifications require the Expo Go app on a physical device.');
        } else {
          showAlert('Permission Required', 'Please enable notifications in your device settings.', [
            { label: 'Cancel', kind: 'cancel' },
            { label: 'Open Settings', kind: 'primary', onPress: () => Linking.openSettings() },
          ]);
        }
      }
    } catch (e: any) {
      showAlert('Notification Error', e.message || 'Failed to enable notifications');
    } finally {
      setNotificationBusy(false);
    }
  };

  const sendTestNotification = async () => {
    const res = await fetch(`${API_BASE}/notifications/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      showAlert('Test Sent!', 'Check your notification tray.');
    } else {
      const err = await res.json();
      showAlert('Error', err.detail || 'Failed to send test');
    }
  };

  const checkReminders = async () => {
    const res = await fetch(`${API_BASE}/notifications/check-reminders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      showAlert('Reminders Checked', `Sent ${data.sent} notification(s) for ${data.total_due} due reminder(s).`);
    }
  };

  const openSecurityStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/security/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('Unable to load security status');
      }
      const data = await res.json();
      showAlert(
        'Security Status',
        [
          data.api_keys_secured ? 'API keys secured server-side' : 'API key security unavailable',
          data.jwt_auth ? 'JWT auth active' : 'JWT auth unavailable',
          data.rate_limiting ? 'Rate limiting active' : 'Rate limiting unavailable',
          `Password hashing: ${data.password_hashing || 'unknown'}`,
          data.input_validation ? 'Input validation enabled' : 'Input validation unavailable',
        ].join('\n')
      );
    } catch (e: any) {
      showAlert('Security Status', e.message || 'Failed to load security status');
    }
  };

  const openAbout = () => {
    showAlert(
      'About GreenPlantAI',
      'GreenPlantAI helps you identify plants, track your garden, manage care reminders, and chat with an AI botanist.\n\nVersion: 2.0.0'
    );
  };

  const openHelp = () => {
    showAlert(
      'Help & Support',
      'Need help?\n\n1. Pull to refresh this profile page.\n2. Make sure the backend URL is configured.\n3. Use a physical device for push notifications.\n\nIf something still fails, share the screen and the exact error message.'
    );
  };

  const handleLogout = () => {
    confirmAction('Sign Out', 'Are you sure?', async () => {
      await logout();
    });
  };

  const isPremium = premiumData?.is_premium;
  const monthlyPlan = premiumData?.plans?.monthly;
  const yearlyPlan = premiumData?.plans?.yearly;

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
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={36} color={Colors.primary} />
            )}
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

              {Platform.OS === 'android' && countryCode === 'IN' && (
                <TouchableOpacity
                  style={styles.gpayTestBtn}
                  onPress={handleGooglePayTestPay}
                  disabled={!!loadingCheckout}
                  activeOpacity={0.85}
                >
                  {loadingCheckout === 'gpay-test' ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={16} color={Colors.primary} />
                      <Text style={styles.gpayTestBtnText}>Test Google Pay with Rs 1</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

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
                    <Text style={styles.planPrice}>{monthlyPlan?.price || '$4.99'}</Text>
                    <Text style={styles.planPeriod}>/month</Text>
                  </View>
                </View>
                <Text style={styles.planFeatures}>Unlimited AI chats, Claude Sonnet access, Priority analysis</Text>
                {!!monthlyPlan?.tax_name && (
                  <Text style={styles.planMeta}>
                    Includes {monthlyPlan.tax_name} of {Number(monthlyPlan.tax_amount || 0).toFixed(2)} {monthlyPlan.currency}
                  </Text>
                )}
                {loadingCheckout === 'monthly-stripe' || loadingCheckout === 'monthly-gpay' ? (
                  <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.sm }} />
                ) : (
                  <View style={styles.paymentActions}>
                    <View style={styles.planBtn}>
                      <Ionicons name="card" size={16} color={Colors.white} />
                      <Text style={styles.planBtnText}>Subscribe with Stripe</Text>
                    </View>
                    {Platform.OS === 'android' && (
                      <TouchableOpacity
                        style={styles.altPlanBtn}
                        onPress={() => handleGooglePayCheckout('monthly')}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="logo-google" size={16} color={Colors.primary} />
                        <Text style={styles.altPlanBtnText}>
                          {countryCode === 'IN' ? `Pay ${monthlyPlan?.price || ''} with Google Pay` : 'Pay with Google Pay'}
                        </Text>
                      </TouchableOpacity>
                    )}
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
                    <Text style={styles.planPrice}>{yearlyPlan?.price || '$39.99'}</Text>
                    <Text style={styles.planPeriod}>/year</Text>
                  </View>
                </View>
                <Text style={styles.planFeatures}>Everything in Monthly + Save 33% annually</Text>
                {!!yearlyPlan?.tax_name && (
                  <Text style={styles.planMeta}>
                    Includes {yearlyPlan.tax_name} of {Number(yearlyPlan.tax_amount || 0).toFixed(2)} {yearlyPlan.currency}
                  </Text>
                )}
                {loadingCheckout === 'yearly-stripe' || loadingCheckout === 'yearly-gpay' ? (
                  <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.sm }} />
                ) : (
                  <View style={styles.paymentActions}>
                    <View style={[styles.planBtn, styles.planBtnHighlight]}>
                      <Ionicons name="card" size={16} color={Colors.white} />
                      <Text style={styles.planBtnText}>Subscribe with Stripe</Text>
                    </View>
                    {Platform.OS === 'android' && (
                      <TouchableOpacity
                        style={styles.altPlanBtn}
                        onPress={() => handleGooglePayCheckout('yearly')}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="logo-google" size={16} color={Colors.primary} />
                        <Text style={styles.altPlanBtnText}>
                          {countryCode === 'IN' ? `Pay ${yearlyPlan?.price || ''} with Google Pay` : 'Pay with Google Pay'}
                        </Text>
                      </TouchableOpacity>
                    )}
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
                disabled={notificationBusy}
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
            <TouchableOpacity style={styles.menuItem} testID="profile-security-btn" onPress={openSecurityStatus}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIcon, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.menuText}>Security Status</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} testID="profile-about-btn" onPress={openAbout}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIcon, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="leaf" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.menuText}>About GreenPlantAI</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} testID="profile-help-btn" onPress={openHelp}>
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
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm, overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
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
  gpayTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#F8FBF7',
    borderRadius: Radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  gpayTestBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
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
  planMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 17 },
  planBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.full, paddingVertical: 12, marginTop: Spacing.sm,
  },
  planBtnHighlight: { backgroundColor: Colors.primaryDark },
  planBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
  paymentActions: { gap: Spacing.sm, marginTop: Spacing.sm },
  altPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  altPlanBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
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
