import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PaymentCancelScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="close-circle" size={72} color={Colors.warning} />
        </View>
        <Text style={styles.title}>Payment Cancelled</Text>
        <Text style={styles.subtitle}>No worries! You can upgrade anytime from your profile.</Text>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => router.replace('/(tabs)')}
          testID="cancel-continue-btn"
        >
          <Text style={styles.continueBtnText}>Back to App</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  iconWrap: { marginBottom: Spacing.lg },
  title: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 16, color: Colors.textSecondary, marginTop: Spacing.sm, textAlign: 'center' },
  continueBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 16, paddingHorizontal: Spacing.xl, marginTop: Spacing.xl,
  },
  continueBtnText: { fontSize: 17, fontWeight: '700', color: Colors.white },
});
