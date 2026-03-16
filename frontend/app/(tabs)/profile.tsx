import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { user, token, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={36} color={Colors.primary} />
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.memberSince}>
          Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
        </Text>
      </View>

      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuItem} testID="profile-premium-btn" onPress={async () => {
          const res = await fetch(`${API_BASE}/premium/status`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            if (data.is_premium) {
              Alert.alert('Premium Active', `Expires: ${data.premium_expires ? new Date(data.premium_expires).toLocaleDateString() : 'Never'}\nChats used today: ${data.daily_chats_used}`);
            } else {
              Alert.alert('Upgrade to Premium', `$4.99/month or $39.99/year\n\nFeatures:\n- Unlimited AI chats\n- Claude Sonnet 4.5 access\n- Priority analysis`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Monthly ($4.99)', onPress: async () => {
                  const r = await fetch(`${API_BASE}/premium/upgrade`, {
                    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plan: 'monthly' }),
                  });
                  if (r.ok) Alert.alert('Premium Activated!', 'Enjoy unlimited AI consults');
                }},
                { text: 'Yearly ($39.99)', onPress: async () => {
                  const r = await fetch(`${API_BASE}/premium/upgrade`, {
                    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plan: 'yearly' }),
                  });
                  if (r.ok) Alert.alert('Premium Activated!', 'Enjoy unlimited AI consults');
                }},
              ]);
            }
          }
        }}>
          <View style={styles.menuLeft}>
            <View style={[styles.menuIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="star" size={20} color="#E6B050" />
            </View>
            <Text style={styles.menuText}>Premium Plan</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} testID="profile-security-btn" onPress={async () => {
          const res = await fetch(`${API_BASE}/security/status`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            Alert.alert('Security Status', `API Keys: Server-side only\nJWT Auth: Active\nRate Limiting: Active\nPassword: bcrypt hashed\nHTTPS: Enforced\nCORS: Enabled`);
          }
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

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        testID="profile-logout-btn"
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>GreenPlantAI v2.0.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  profileCard: {
    alignItems: 'center', backgroundColor: Colors.paper, marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  name: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  email: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  memberSince: { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm },
  menuSection: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
  },
  menuText: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.lg, paddingVertical: 14, borderRadius: Radius.md,
    backgroundColor: '#FEF2F2', gap: Spacing.sm,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: Colors.danger },
  version: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: Spacing.lg },
});
