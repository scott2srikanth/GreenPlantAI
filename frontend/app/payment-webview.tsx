import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Colors, Radius, Spacing } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PaymentWebViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ checkoutUrl?: string | string[]; plan?: string | string[] }>();
  const [loading, setLoading] = useState(true);

  const checkoutUrl = useMemo(() => {
    const rawUrl = Array.isArray(params.checkoutUrl) ? params.checkoutUrl[0] : params.checkoutUrl;
    return rawUrl ? decodeURIComponent(rawUrl) : '';
  }, [params.checkoutUrl]);

  const plan = Array.isArray(params.plan) ? params.plan[0] : params.plan;

  const handleNavigation = (url: string) => {
    if (!url) return;

    if (url.includes('/payment-success')) {
      const sessionId = url.match(/[?&]session_id=([^&]+)/)?.[1];
      router.replace({
        pathname: '/payment-success',
        params: sessionId ? { session_id: sessionId } : {},
      });
      return;
    }

    if (url.includes('/payment-cancel')) {
      router.replace('/payment-cancel');
    }
  };

  if (!checkoutUrl) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>Checkout Unavailable</Text>
          <Text style={styles.subtitle}>We couldn&apos;t open the payment screen. Please try again.</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Checkout</Text>
          <Text style={styles.headerSubtitle}>
            {plan ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)} Premium` : 'Premium Plan'}
          </Text>
        </View>
        <View style={styles.closeButton} />
      </View>

      <View style={styles.webviewWrap}>
        <WebView
          source={{ uri: checkoutUrl }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(navState) => handleNavigation(navState.url)}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loaderOverlay}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loaderText}>Loading secure checkout...</Text>
            </View>
          )}
        />
        {loading && (
          <View pointerEvents="none" style={styles.inlineLoader}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  webviewWrap: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  loaderOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    gap: Spacing.sm,
  },
  loaderText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  inlineLoader: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  button: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
});
