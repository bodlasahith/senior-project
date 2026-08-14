import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TechniqueClassifier, { TECHNIQUE_CLASSES } from '@/services/TechniqueClassifier';

type Pov = 'front' | 'top' | 'side';
const POVS: { key: Pov; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'top', label: 'Top' },
  { key: 'side', label: 'Side' },
];

// Feedback + color per class index (0..2).
const CLASS_META = [
  { color: '#10B981', icon: '✅', feedback: 'Clean technique — your form reads as efficient from this angle. Keep it consistent.' },
  { color: '#F59E0B', icon: '⚠️', feedback: 'Your form needs work from this angle. Focus on body line and a steady, deliberate stroke.' },
  { color: '#6B7280', icon: '❓', feedback: 'Couldn\'t get a clear read. Reframe so the swimmer fills the frame from this POV and try again.' },
];

export default function TechniqueScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const classifierRef = useRef<TechniqueClassifier | null>(null);

  const [pov, setPov] = useState<Pov>('front');
  const [modelReady, setModelReady] = useState(false);
  const [status, setStatus] = useState('Loading technique models…');
  const [isBusy, setIsBusy] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setStatus('Technique analysis requires a device camera.');
      return;
    }
    const classifier = new TechniqueClassifier();
    classifierRef.current = classifier;
    classifier
      .initialize({
        front: require('../../assets/models/technique/front_pov.tflite'),
        top: require('../../assets/models/technique/top_pov.tflite'),
        side: require('../../assets/models/technique/side_pov.tflite'),
      })
      .then(() => {
        setModelReady(true);
        setStatus(classifier.usingMock ? 'Ready (mock — native model unavailable).' : 'Ready. Frame the swimmer and capture.');
      });
    return () => classifier.dispose();
  }, []);

  const capture = async () => {
    if (!cameraRef.current || !modelReady || isBusy) return;
    setIsBusy(true);
    setResult(null);
    setStatus('Capturing…');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) throw new Error('No image captured');
      setCapturedUri(photo.uri);
      setStatus('Analyzing technique…');
      const res = await classifierRef.current!.classify(pov, photo.uri);
      if (!res) throw new Error('Classification failed');
      setResult(res);
      setStatus('Done.');
    } catch (e: any) {
      setStatus(e.message || 'Something went wrong.');
    } finally {
      setIsBusy(false);
    }
  };

  const retake = () => {
    setCapturedUri(null);
    setResult(null);
    setStatus('Ready. Frame the swimmer and capture.');
  };

  // ─── Permission states ───
  if (Platform.OS === 'web') {
    return (
      <ThemedView style={[styles.centered, { paddingTop: insets.top + 16 }]}>
        <ThemedText type="subtitle">Technique</ThemedText>
        <ThemedText type="default" style={styles.subtle}>Technique analysis requires a device camera.</ThemedText>
      </ThemedView>
    );
  }
  if (!permission) {
    return (
      <ThemedView style={styles.centered}><ActivityIndicator /></ThemedView>
    );
  }
  if (!permission.granted) {
    return (
      <ThemedView style={[styles.centered, { paddingTop: insets.top + 16 }]}>
        <ThemedText type="subtitle">Camera access needed</ThemedText>
        <ThemedText type="default" style={styles.subtle}>
          Grant camera access to analyze your swimming technique.
        </ThemedText>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <ThemedText type="default" style={styles.primaryButtonText}>Grant Camera Access</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Technique</ThemedText>
        <ThemedText type="default" style={styles.subtle}>{status}</ThemedText>
      </ThemedView>

      {/* POV selector */}
      <View style={styles.povRow}>
        {POVS.map((p) => (
          <Pressable
            key={p.key}
            style={[styles.povChip, pov === p.key && styles.povChipActive]}
            onPress={() => setPov(p.key)}
          >
            <ThemedText type="default" style={[styles.povText, pov === p.key && styles.povTextActive]}>
              {p.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Camera or captured image */}
      <View style={styles.viewport}>
        {capturedUri ? (
          <Image source={{ uri: capturedUri }} style={styles.viewportFill} resizeMode="cover" />
        ) : (
          <CameraView ref={cameraRef} style={styles.viewportFill} facing="back" />
        )}
        {isBusy && (
          <View style={styles.busyOverlay}><ActivityIndicator color="#fff" /></View>
        )}
      </View>

      {/* Result */}
      {result && (
        <ThemedView style={[styles.resultCard, { borderLeftColor: CLASS_META[result.classIndex]?.color || '#6B7280' }]}>
          <ThemedText type="subtitle">
            {CLASS_META[result.classIndex]?.icon} {result.label}
          </ThemedText>
          <ThemedText type="default" style={styles.confidence}>
            {(result.confidence * 100).toFixed(1)}% confidence · {pov} view
          </ThemedText>

          {TECHNIQUE_CLASSES.map((c, i) => (
            <View key={c} style={styles.barRow}>
              <ThemedText type="default" style={styles.barLabel}>{c}</ThemedText>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round((result.allPredictions?.[c] || 0) * 100)}%`, backgroundColor: CLASS_META[i]?.color },
                  ]}
                />
              </View>
              <ThemedText type="default" style={styles.barPct}>
                {Math.round((result.allPredictions?.[c] || 0) * 100)}%
              </ThemedText>
            </View>
          ))}

          <ThemedText type="default" style={styles.feedback}>
            💡 {CLASS_META[result.classIndex]?.feedback}
          </ThemedText>
        </ThemedView>
      )}

      {/* Actions */}
      {capturedUri ? (
        <Pressable style={styles.secondaryButton} onPress={retake}>
          <ThemedText type="default" style={styles.secondaryButtonText}>↺ Retake</ThemedText>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.primaryButton, (!modelReady || isBusy) && styles.buttonDisabled]}
          onPress={capture}
          disabled={!modelReady || isBusy}
        >
          <ThemedText type="default" style={styles.primaryButtonText}>
            {isBusy ? 'Working…' : '📸 Capture & Analyze'}
          </ThemedText>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header: { gap: 6 },
  subtle: { opacity: 0.7, textAlign: 'center' },

  povRow: { flexDirection: 'row', gap: 8 },
  povChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
  },
  povChipActive: { backgroundColor: '#1976D2' },
  povText: { fontWeight: '600' },
  povTextActive: { color: '#fff' },

  viewport: {
    width: '100%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#000', justifyContent: 'center', alignItems: 'center',
  },
  viewportFill: { width: '100%', height: '100%' },
  busyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },

  resultCard: {
    padding: 16, borderRadius: 16, gap: 10,
    backgroundColor: 'rgba(25, 118, 210, 0.06)',
    borderLeftWidth: 4,
  },
  confidence: { opacity: 0.7, textTransform: 'capitalize' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { flex: 3, fontSize: 12 },
  barTrack: { flex: 4, height: 8, borderRadius: 4, backgroundColor: 'rgba(120,120,120,0.15)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barPct: { width: 40, textAlign: 'right', fontSize: 12 },
  feedback: { lineHeight: 20, marginTop: 4 },

  primaryButton: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', backgroundColor: '#10B981' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  secondaryButton: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(25, 118, 210, 0.12)' },
  secondaryButtonText: { color: '#1976D2', fontWeight: '700', fontSize: 16 },
});
