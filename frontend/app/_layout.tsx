import 'expo-dev-client';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '@/src/AuthContext';
import { DialogProvider } from '@/src/DialogContext';
import { ScanSessionProvider } from '@/src/ScanSessionContext';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="payment-webview" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="results" options={{ presentation: 'modal' }} />
        <Stack.Screen name="plant-detail" />
        <Stack.Screen name="botanist-chat" />
        <Stack.Screen name="payment-success" />
        <Stack.Screen name="payment-cancel" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <DialogProvider>
        <ScanSessionProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </ScanSessionProvider>
      </DialogProvider>
    </AuthProvider>
  );
}
