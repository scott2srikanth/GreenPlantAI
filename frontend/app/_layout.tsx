import { Stack } from 'expo-router';
import { AuthProvider } from '@/src/AuthContext';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="results" options={{ presentation: 'modal' }} />
        <Stack.Screen name="plant-detail" />
      </Stack>
    </AuthProvider>
  );
}
