import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const [status, setStatus] = useState<string>('checking');
  const [paymentStatus, setPaymentStatus] = useState<string>('');

  useEffect(() => {
    if (session_id) checkPayment();
    else setStatus('success');
  }, [session_id]);

  const checkPayment = async () => {
    try {
      const res = await fetch(`${API_BASE}/premium/checkout/status/${session_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPaymentStatus(data.payment_status);
        setStatus(data.payment_status === 'paid' ? 'success' : 'pending');
      }
    } catch (e) {
      setStatus('success');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {status === 'checking' ? (
          <>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.title}>Verifying Payment...</Text>
          </>
        ) : (
          <>
            <View style={styles.iconWrap}>
              <Ionicons name="checkmark-circle" size={72} color={Colors.healthy} />
            </View>
            <Text style={styles.title}>Welcome to Premium!</Text>
            <Text style={styles.subtitle}>Your GreenPlantAI Premium is now active</Text>
            <View style={styles.features}>
              {['Unlimited AI chats', 'Claude Sonnet 4.5 access', 'Priority plant analysis'].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name="checkmark" size={18} color={Colors.healthy} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={() => router.replace('/(tabs)')}
              testID="payment-continue-btn"
            >
              <Text style={styles.continueBtnText}>Continue to App</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  iconWrap: { marginBottom: Spacing.lg },
  title: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.md, textAlign: 'center' },
  subtitle: { fontSize: 16, color: Colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' },
  features: { marginTop: Spacing.xl, gap: Spacing.md, width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  featureText: { fontSize: 16, color: Colors.textPrimary },
  continueBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 16, paddingHorizontal: Spacing.xl, marginTop: Spacing.xl,
  },
  continueBtnText: { fontSize: 17, fontWeight: '700', color: Colors.white },
});
