import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, API_BASE } from '@/src/AuthContext';
import { useScanSession } from '@/src/ScanSessionContext';
import { Colors, Spacing, Radius } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ScanScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { setScanResult } = useScanSession();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickImage = async (useCamera: boolean) => {
    setError('');
    
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError('Camera permission is required to scan plants');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Gallery permission is required to pick images');
        return;
      }
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
          allowsEditing: true,
          aspect: [1, 1],
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
          allowsEditing: true,
          aspect: [1, 1],
        });

    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null);
    }
  };

  const identifyPlant = async () => {
    if (!imageBase64) {
      setError('Please capture or select an image first');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/plants/identify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          image_base64: imageBase64,
          health_check: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Identification failed');
      }

      const data = await res.json();

      setScanResult({
        resultData: data,
        imageBase64,
      });
      router.push('/results');
    } catch (e: any) {
      setError(e.message || 'Failed to identify plant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="scan-back-btn">
          <Ionicons name="close" size={28} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Scan Plant</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Image Preview */}
      <View style={styles.previewContainer}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="camera-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.placeholderText}>Take a photo or pick from gallery</Text>
          </View>
        )}

        {imageUri && (
          <View style={styles.overlayBadge}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.healthy} />
            <Text style={styles.overlayText}>Image ready</Text>
          </View>
        )}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.captureBtn}
          onPress={() => pickImage(true)}
          disabled={loading}
          testID="scan-camera-btn"
          activeOpacity={0.8}
        >
          <Ionicons name="camera" size={24} color={Colors.white} />
          <Text style={styles.captureBtnText}>Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.galleryBtn}
          onPress={() => pickImage(false)}
          disabled={loading}
          testID="scan-gallery-btn"
          activeOpacity={0.8}
        >
          <Ionicons name="images" size={24} color={Colors.primary} />
          <Text style={styles.galleryBtnText}>Gallery</Text>
        </TouchableOpacity>
      </View>

      {/* Identify Button */}
      {imageUri && (
        <TouchableOpacity
          style={[styles.identifyBtn, loading && styles.identifyBtnDisabled]}
          onPress={identifyPlant}
          disabled={loading}
          testID="scan-identify-btn"
          activeOpacity={0.8}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.white} />
              <Text style={styles.identifyBtnText}>Analyzing...</Text>
            </View>
          ) : (
            <View style={styles.loadingRow}>
              <Ionicons name="scan" size={22} color={Colors.white} />
              <Text style={styles.identifyBtnText}>Identify Plant</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  previewContainer: {
    flex: 1, marginHorizontal: Spacing.lg, marginVertical: Spacing.md,
    borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.subtle,
  },
  preview: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  placeholderText: { fontSize: 16, color: Colors.textMuted, marginTop: Spacing.md },
  overlayBadge: {
    position: 'absolute', bottom: 16, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  overlayText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF2F2', padding: Spacing.sm + 4,
    borderRadius: Radius.sm, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  errorText: { fontSize: 13, color: Colors.danger, flex: 1 },
  actions: {
    flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md,
  },
  captureBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 14, gap: Spacing.sm,
  },
  captureBtnText: { fontSize: 16, fontWeight: '600', color: Colors.white },
  galleryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.secondary, borderRadius: Radius.full,
    paddingVertical: 14, gap: Spacing.sm,
  },
  galleryBtnText: { fontSize: 16, fontWeight: '600', color: Colors.primary },
  identifyBtn: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.lg,
    backgroundColor: Colors.primaryDark, borderRadius: Radius.full,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: Colors.primaryDark, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  identifyBtnDisabled: { opacity: 0.7 },
  identifyBtnText: { fontSize: 17, fontWeight: '700', color: Colors.white },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
