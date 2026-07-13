import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import SensorDataHandler from '@/services/SensoryDataHandler';
import StrokeClassifier from '@/services/StrokeClassifier';
import EfficiencyCalculator from '@/services/EfficiencyCalculator';
import WearableService from '@/services/WearableService';
import { sessionAPI } from '@/services/api';

const CONFIDENCE_THRESHOLD = 0.7;
const STROKE_BATCH_SIZE = 5;
const DEFAULT_MASS_KG = 70;

export default function SessionScreen() {
  const insets = useSafeAreaInsets();
  // Session state
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing sensors and model...');
  const [currentStroke, setCurrentStroke] = useState('Waiting...');
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const [sensorStats, setSensorStats] = useState({ accelCount: 0, bufferSize: 100, fillPercentage: 0 });
  const [recentStrokes, setRecentStrokes] = useState<any[]>([]);

  // Heart rate state
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [hrSource, setHrSource] = useState<string | null>(null);

  // Efficiency & insights state
  const [efficiencyResult, setEfficiencyResult] = useState<any>(null);
  const [showEfficiency, setShowEfficiency] = useState(false);
  const [liveStrokeRate, setLiveStrokeRate] = useState<number>(0);
  const [sessionElapsed, setSessionElapsed] = useState<number>(0);

  // Refs
  const classifierRef = useRef<any>(null);
  const sensorHandlerRef = useRef<any>(null);
  const wearableRef = useRef<any>(null);
  const efficiencyCalcRef = useRef<any>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const strokeBufferRef = useRef<any[]>([]);
  const allStrokesRef = useRef<any[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setStatusMessage('This screen requires a device or simulator.');
      return;
    }
    initializeSessionStack();
    return () => {
      sensorHandlerRef.current?.dispose();
      classifierRef.current?.dispose();
      wearableRef.current?.dispose();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const initializeSessionStack = async () => {
    try {
      setStatusMessage('Loading model, sensors, and wearable...');

      const classifier = new StrokeClassifier();
      classifierRef.current = classifier;
      const modelSource = require('../../assets/models/stroke_classification_model.tflite');
      const classifierReady = await classifier.initialize(modelSource);
      if (!classifierReady) throw new Error('Unable to load TFLite model.');

      const sensorHandler = new SensorDataHandler(100);
      sensorHandlerRef.current = sensorHandler;
      const sensorsReady = await sensorHandler.initialize();
      if (!sensorsReady) throw new Error('Unable to initialize sensors.');
      sensorHandler.onBufferFull = handleBufferFull;
      sensorHandler.onNewData = () => {
        if (Math.random() < 0.1) setSensorStats(sensorHandler.getBufferStats());
      };

      const wearable = new WearableService();
      wearableRef.current = wearable;
      const capabilities = await wearable.initialize();
      wearable.onHeartRateUpdate = (bpm: number) => setHeartRate(bpm);
      wearable.onConnectionChange = (status: string, source: string) => {
        setHrSource(status === 'connected' ? source : null);
      };

      // Initialize efficiency calculator with user profile
      const calc = new EfficiencyCalculator();
      calc.setUserProfile({ mass: DEFAULT_MASS_KG, level: 'recreational' });
      efficiencyCalcRef.current = calc;

      if (capabilities.healthKitAvailable) {
        setStatusMessage('Ready. Apple Watch HR available.');
      } else if (capabilities.bleAvailable) {
        setStatusMessage('Ready. Bluetooth HR available.');
      } else {
        setStatusMessage('Ready. No HR monitor — connect a wearable for full analysis.');
      }
      setIsReady(true);
    } catch (error: any) {
      console.error('Initialization error:', error);
      setStatusMessage('Initialization failed.');
      Alert.alert('Error', error.message || 'Unable to start.');
    }
  };

  const startSession = async () => {
    if (!isReady) {
      Alert.alert('Not Ready', 'Finish initialization before starting.');
      return;
    }

    // Reset state
    sessionStartRef.current = Date.now();
    strokeBufferRef.current = [];
    allStrokesRef.current = [];
    setRecentStrokes([]);
    setCurrentStroke('Detecting...');
    setCurrentConfidence(0);
    setEfficiencyResult(null);
    setShowEfficiency(false);
    setSessionElapsed(0);
    setLiveStrokeRate(0);
    efficiencyCalcRef.current?.resetLapHistory();

    // Create backend session
    try {
      const response = await sessionAPI.createSession({
        duration: 0, startTime: new Date().toISOString(), strokes: [],
      });
      sessionIdRef.current = response.data.session?._id || null;
    } catch {
      sessionIdRef.current = null;
    }

    // Start collection
    sensorHandlerRef.current?.startCollecting();
    if (wearableRef.current) await wearableRef.current.startMonitoring();

    // Start elapsed timer
    timerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - (sessionStartRef.current || Date.now())) / 1000);
      setSessionElapsed(elapsed);
      // Update live stroke rate
      const strokes = allStrokesRef.current.length;
      const minutes = elapsed / 60;
      setLiveStrokeRate(minutes > 0.1 ? Math.round(strokes / minutes) : 0);
    }, 1000);

    setIsRecording(true);
    setStatusMessage('Recording...');
  };

  const stopSession = async () => {
    sensorHandlerRef.current?.stopCollecting();
    wearableRef.current?.stopMonitoring();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setStatusMessage('Analyzing session...');

    const duration = sessionStartRef.current
      ? Math.round((Date.now() - sessionStartRef.current) / 1000) : 0;

    // Flush strokes
    if (strokeBufferRef.current.length > 0 && sessionIdRef.current) await flushStrokes();

    // Calculate efficiency with the enhanced calculator
    const avgHR = wearableRef.current?.getAverageHeartRate() || 0;
    const efficiency = calculateEfficiency(duration, avgHR);
    setEfficiencyResult(efficiency);
    setShowEfficiency(true);

    // Save to backend
    try {
      if (sessionIdRef.current) {
        await sessionAPI.updateSession(sessionIdRef.current, {
          duration,
          endTime: new Date().toISOString(),
          efficiency: efficiency ? {
            score: efficiency.efficiency,
            workInput: efficiency.workInput,
            workOutput: efficiency.workOutput,
            level: efficiency.level,
            feedback: efficiency.feedback,
          } : undefined,
        });
      }
    } catch (e) { console.error('Save error:', e); }

    setStatusMessage('Session complete.');
  };

  const calculateEfficiency = (durationSeconds: number, avgHeartRate: number) => {
    if (!efficiencyCalcRef.current) return null;
    const strokes = allStrokesRef.current;

    if (avgHeartRate === 0) {
      return {
        efficiency: 0, workInput: 0, workOutput: 0,
        level: 'no_data',
        feedback: 'No heart rate data. Connect a wearable for efficiency analysis.',
        details: { strokeCount: strokes.length, durationMinutes: durationSeconds / 60 },
        strokeFrequencyAnalysis: null,
      };
    }

    return efficiencyCalcRef.current.calculateFromSession(
      { duration: durationSeconds, strokes },
      { heartRate: avgHeartRate, mass: DEFAULT_MASS_KG, distance: null }
    );
  };

  const handleBufferFull = async (buffer: any) => {
    if (!isRecording || !classifierRef.current) return;
    const result = await classifierRef.current.classifyStroke(buffer);
    if (!result) return;

    setCurrentStroke(result.stroke);
    setCurrentConfidence(result.confidence);
    if (result.confidence < CONFIDENCE_THRESHOLD) return;

    const strokePayload = {
      type: result.stroke,
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
      allPredictions: result.allPredictions,
    };

    strokeBufferRef.current.push(strokePayload);
    allStrokesRef.current.push(strokePayload);
    setRecentStrokes((prev) => [strokePayload, ...prev].slice(0, 8));

    if (strokeBufferRef.current.length >= STROKE_BATCH_SIZE && sessionIdRef.current) {
      await flushStrokes();
    }
  };

  const flushStrokes = async () => {
    if (!sessionIdRef.current || strokeBufferRef.current.length === 0) return;
    const strokesToSend = [...strokeBufferRef.current];
    strokeBufferRef.current = [];
    try {
      await sessionAPI.addStrokes(sessionIdRef.current, strokesToSend);
    } catch {
      strokeBufferRef.current.unshift(...strokesToSend);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 16 }]}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Swim Session</ThemedText>
        <ThemedText type="default">{statusMessage}</ThemedText>
      </ThemedView>

      {/* ─── POST-SESSION: EFFICIENCY RESULTS ─── */}
      {showEfficiency && efficiencyResult && (
        <ThemedView style={styles.efficiencyCard}>
          <ThemedText type="subtitle">📊 Session Analysis</ThemedText>

          {efficiencyResult.level === 'no_data' ? (
            <ThemedText type="default">{efficiencyResult.feedback}</ThemedText>
          ) : (
            <>
              {/* Efficiency Score */}
              <View style={styles.scoreRow}>
                <View>
                  <ThemedText type="title" style={styles.efficiencyScore}>
                    {efficiencyResult.efficiency.toFixed(2)}%
                  </ThemedText>
                  <ThemedText type="default" style={styles.efficiencyLevel}>
                    {efficiencyResult.level}
                  </ThemedText>
                </View>
                <View style={styles.scoreDetails}>
                  <ThemedText type="default">⚡ {efficiencyResult.workOutput?.toLocaleString()} J output</ThemedText>
                  <ThemedText type="default">🔥 {efficiencyResult.workInput?.toLocaleString()} J input</ThemedText>
                  <ThemedText type="default">🏊 ~{efficiencyResult.details?.estimatedDistance?.toFixed(0)}m</ThemedText>
                </View>
              </View>

              {/* Coaching Feedback */}
              <ThemedView style={styles.feedbackBox}>
                <ThemedText type="default" style={styles.feedbackText}>
                  💡 {efficiencyResult.feedback}
                </ThemedText>
              </ThemedView>

              {/* Stroke Frequency Analysis */}
              {efficiencyResult.strokeFrequencyAnalysis && (
                <ThemedView style={styles.insightBox}>
                  <ThemedText type="subtitle" style={styles.insightTitle}>
                    {efficiencyResult.strokeFrequencyAnalysis.isOptimal ? '✅' : '⚠️'} Stroke Rate
                  </ThemedText>
                  <ThemedText type="default">
                    {efficiencyResult.strokeFrequencyAnalysis.currentSF} SPM
                    {efficiencyResult.strokeFrequencyAnalysis.isOptimal
                      ? ` (within optimal range)`
                      : ` (optimal: ~${efficiencyResult.strokeFrequencyAnalysis.optimalSF} SPM)`}
                  </ThemedText>
                  {efficiencyResult.strokeFrequencyAnalysis.recommendation && (
                    <ThemedText type="default" style={styles.recommendationText}>
                      {efficiencyResult.strokeFrequencyAnalysis.recommendation}
                    </ThemedText>
                  )}
                  {efficiencyResult.strokeFrequencyAnalysis.strokeLength > 0 && (
                    <ThemedText type="default" style={styles.metricText}>
                      Distance/stroke: {efficiencyResult.strokeFrequencyAnalysis.strokeLength}m
                      (expected: {efficiencyResult.strokeFrequencyAnalysis.expectedStrokeLength}m)
                    </ThemedText>
                  )}
                </ThemedView>
              )}

              {/* Model Info */}
              {efficiencyResult.details && (
                <ThemedText type="default" style={styles.modelInfo}>
                  Model: {efficiencyResult.details.model} | VO₂: {efficiencyResult.details.vo2_mL_min} mL/min
                </ThemedText>
              )}
            </>
          )}

          <Pressable style={styles.dismissButton} onPress={() => setShowEfficiency(false)}>
            <ThemedText type="default" style={styles.dismissText}>Dismiss</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {/* ─── LIVE: SESSION METRICS ─── */}
      {isRecording && (
        <ThemedView style={styles.liveMetrics}>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <ThemedText type="title" style={styles.metricValue}>{formatTime(sessionElapsed)}</ThemedText>
              <ThemedText type="default" style={styles.metricLabel}>Duration</ThemedText>
            </View>
            <View style={styles.metric}>
              <ThemedText type="title" style={styles.metricValue}>{allStrokesRef.current?.length || 0}</ThemedText>
              <ThemedText type="default" style={styles.metricLabel}>Strokes</ThemedText>
            </View>
            <View style={styles.metric}>
              <ThemedText type="title" style={styles.metricValue}>{liveStrokeRate}</ThemedText>
              <ThemedText type="default" style={styles.metricLabel}>SPM</ThemedText>
            </View>
            <View style={styles.metric}>
              <ThemedText type="title" style={[styles.metricValue, styles.hrText]}>
                {heartRate || '--'}
              </ThemedText>
              <ThemedText type="default" style={styles.metricLabel}>BPM</ThemedText>
            </View>
          </View>
          {!hrSource && (
            <ThemedText type="default" style={styles.hrWarning}>
              No HR monitor connected
            </ThemedText>
          )}
        </ThemedView>
      )}

      {/* ─── CURRENT STROKE ─── */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Current Stroke</ThemedText>
        <ThemedText type="title" style={styles.strokeText}>{currentStroke}</ThemedText>
        <View style={styles.confidenceBar}>
          <View style={[styles.confidenceFill, { width: `${Math.min(100, currentConfidence * 100)}%` }]} />
        </View>
        <ThemedText type="default">Confidence: {(currentConfidence * 100).toFixed(1)}%</ThemedText>
      </ThemedView>

      {/* ─── SENSOR BUFFER ─── */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Sensor Buffer</ThemedText>
        <ThemedText type="default">
          {sensorStats.accelCount || 0} / {sensorStats.bufferSize || 100} samples
        </ThemedText>
        <View style={styles.confidenceBar}>
          <View style={[styles.progressFill, { width: `${sensorStats.fillPercentage || 0}%` }]} />
        </View>
      </ThemedView>

      {/* ─── RECENT STROKES ─── */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Recent Strokes</ThemedText>
        {recentStrokes.length === 0 ? (
          <ThemedText type="default">No strokes captured yet.</ThemedText>
        ) : (
          recentStrokes.map((stroke, index) => (
            <View key={`${stroke.timestamp}-${index}`} style={styles.strokeRow}>
              <ThemedText type="default">{stroke.type}</ThemedText>
              <ThemedText type="default">{(stroke.confidence * 100).toFixed(0)}%</ThemedText>
            </View>
          ))
        )}
      </ThemedView>

      {/* ─── START/STOP ─── */}
      <Pressable
        style={[styles.button, isRecording ? styles.buttonStop : styles.buttonStart]}
        onPress={isRecording ? stopSession : startSession}
      >
        <ThemedText type="default" style={styles.buttonText}>
          {isRecording ? '⏹ Stop Session' : '▶ Start Session'}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flex: 1 },
  contentContainer: { padding: 16, gap: 14, paddingBottom: 40 },
  header: { gap: 6 },

  // Live metrics bar
  liveMetrics: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(25, 118, 210, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(25, 118, 210, 0.2)',
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-around' },
  metric: { alignItems: 'center', gap: 2 },
  metricValue: { fontSize: 22, fontWeight: '700' },
  metricLabel: { fontSize: 11, opacity: 0.7 },
  hrWarning: { textAlign: 'center', marginTop: 6, fontSize: 12, opacity: 0.6 },

  // Cards
  card: { padding: 14, borderRadius: 14, gap: 10, backgroundColor: 'rgba(25, 118, 210, 0.06)' },

  // Efficiency results
  efficiencyCard: {
    padding: 16, borderRadius: 16, gap: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreDetails: { gap: 2, alignItems: 'flex-end' },
  efficiencyScore: { fontSize: 38, color: '#10B981', fontWeight: '800' },
  efficiencyLevel: { textTransform: 'capitalize', fontWeight: '600', fontSize: 14 },
  feedbackBox: { padding: 10, borderRadius: 10, backgroundColor: 'rgba(16, 185, 129, 0.08)' },
  feedbackText: { lineHeight: 20 },
  insightBox: {
    padding: 12, borderRadius: 10, gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  insightTitle: { fontSize: 14 },
  recommendationText: { fontSize: 13, lineHeight: 18, opacity: 0.85 },
  metricText: { fontSize: 12, opacity: 0.7 },
  modelInfo: { fontSize: 11, opacity: 0.5, textAlign: 'right' },
  dismissButton: {
    alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  dismissText: { color: '#10B981', fontWeight: '500', fontSize: 13 },

  // Stroke display
  strokeText: { fontSize: 26 },
  confidenceBar: { height: 6, borderRadius: 4, backgroundColor: 'rgba(25, 118, 210, 0.15)', overflow: 'hidden' },
  confidenceFill: { height: '100%', backgroundColor: '#1976D2' },
  progressFill: { height: '100%', backgroundColor: '#10B981' },
  strokeRow: { flexDirection: 'row', justifyContent: 'space-between' },

  // HR
  hrText: { color: '#EF4444' },

  // Buttons
  button: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  buttonStart: { backgroundColor: '#10B981' },
  buttonStop: { backgroundColor: '#EF4444' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
