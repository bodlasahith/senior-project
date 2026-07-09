import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import SensorDataHandler from '@/services/SensoryDataHandler';
import StrokeClassifier from '@/services/StrokeClassifier';
import EfficiencyCalculator from '@/services/EfficiencyCalculator';
import WearableService from '@/services/WearableService';
import { sessionAPI } from '@/services/api';

const CONFIDENCE_THRESHOLD = 0.7;
const STROKE_BATCH_SIZE = 5;
const DEFAULT_MASS_KG = 70; // Fallback if user hasn't set profile

export default function SessionScreen() {
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

  // Efficiency state
  const [efficiencyResult, setEfficiencyResult] = useState<any>(null);
  const [showEfficiency, setShowEfficiency] = useState(false);

  // Refs
  const classifierRef = useRef<any>(null);
  const sensorHandlerRef = useRef<any>(null);
  const wearableRef = useRef<any>(null);
  const efficiencyCalcRef = useRef<any>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const strokeBufferRef = useRef<any[]>([]);
  const allStrokesRef = useRef<any[]>([]);

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
    };
  }, []);

  const initializeSessionStack = async () => {
    try {
      setStatusMessage('Loading model, sensors, and wearable...');

      // Initialize stroke classifier
      const classifier = new StrokeClassifier();
      classifierRef.current = classifier;
      const modelSource = require('../../assets/models/stroke_classification_model.tflite');
      const classifierReady = await classifier.initialize(modelSource);
      if (!classifierReady) {
        throw new Error('Unable to load TFLite model.');
      }

      // Initialize sensor handler
      const sensorHandler = new SensorDataHandler(100);
      sensorHandlerRef.current = sensorHandler;
      const sensorsReady = await sensorHandler.initialize();
      if (!sensorsReady) {
        throw new Error('Unable to initialize sensors.');
      }
      sensorHandler.onBufferFull = handleBufferFull;
      sensorHandler.onNewData = () => {
        if (Math.random() < 0.1) {
          setSensorStats(sensorHandler.getBufferStats());
        }
      };

      // Initialize wearable service
      const wearable = new WearableService();
      wearableRef.current = wearable;
      const capabilities = await wearable.initialize();

      wearable.onHeartRateUpdate = (bpm: number) => {
        setHeartRate(bpm);
      };
      wearable.onConnectionChange = (status: string, source: string) => {
        if (status === 'connected') {
          setHrSource(source);
        } else {
          setHrSource(null);
        }
      };

      if (capabilities.healthKitAvailable) {
        setStatusMessage('Ready. Apple Watch HR available.');
      } else if (capabilities.bleAvailable) {
        setStatusMessage('Ready. Bluetooth HR available.');
      } else {
        setStatusMessage('Ready. No HR monitor detected — efficiency will use manual input.');
      }

      // Initialize efficiency calculator
      efficiencyCalcRef.current = new EfficiencyCalculator();

      setIsReady(true);
    } catch (error: any) {
      console.error('Initialization error:', error);
      setStatusMessage('Initialization failed. Check logs.');
      Alert.alert('Initialization Error', error.message || 'Unable to start session stack.');
    }
  };

  const startSession = async () => {
    if (!isReady) {
      Alert.alert('Not Ready', 'Finish initialization before starting a session.');
      return;
    }

    try {
      // Create session on backend
      const response = await sessionAPI.createSession({
        duration: 0,
        startTime: new Date().toISOString(),
        strokes: [],
      });

      sessionIdRef.current = response.data.session?._id || null;
      sessionStartRef.current = Date.now();
      strokeBufferRef.current = [];
      allStrokesRef.current = [];
      setRecentStrokes([]);
      setCurrentStroke('Detecting...');
      setCurrentConfidence(0);
      setEfficiencyResult(null);
      setShowEfficiency(false);

      // Start sensor collection
      sensorHandlerRef.current?.startCollecting();

      // Start heart rate monitoring
      if (wearableRef.current) {
        await wearableRef.current.startMonitoring();
      }

      setIsRecording(true);
      setStatusMessage('Recording in progress...');
    } catch (error: any) {
      console.error('Start session error:', error);
      // Start session locally even if backend fails
      sessionIdRef.current = null;
      sessionStartRef.current = Date.now();
      strokeBufferRef.current = [];
      allStrokesRef.current = [];
      setRecentStrokes([]);
      setCurrentStroke('Detecting...');
      setCurrentConfidence(0);

      sensorHandlerRef.current?.startCollecting();
      if (wearableRef.current) {
        await wearableRef.current.startMonitoring();
      }

      setIsRecording(true);
      setStatusMessage('Recording (offline mode)...');
    }
  };

  const stopSession = async () => {
    try {
      sensorHandlerRef.current?.stopCollecting();
      wearableRef.current?.stopMonitoring();
      setIsRecording(false);
      setStatusMessage('Calculating efficiency...');

      const duration = sessionStartRef.current
        ? Math.round((Date.now() - sessionStartRef.current) / 1000)
        : 0;

      // Flush remaining strokes to backend
      if (strokeBufferRef.current.length > 0 && sessionIdRef.current) {
        await flushStrokes();
      }

      // Calculate efficiency
      const avgHR = wearableRef.current?.getAverageHeartRate() || 0;
      const efficiency = calculateEfficiency(duration, avgHR);
      setEfficiencyResult(efficiency);
      setShowEfficiency(true);

      // Update session on backend with duration and efficiency
      if (sessionIdRef.current) {
        await sessionAPI.updateSession(sessionIdRef.current, {
          duration,
          endTime: new Date().toISOString(),
          efficiency: efficiency
            ? {
                score: efficiency.efficiency,
                workInput: efficiency.workInput,
                workOutput: efficiency.workOutput,
                level: efficiency.level,
                feedback: efficiency.feedback,
              }
            : undefined,
        });
      }

      setStatusMessage('Session complete.');
    } catch (error: any) {
      console.error('Stop session error:', error);
      setStatusMessage('Session saved with errors.');
      // Still show efficiency if calculated
      const duration = sessionStartRef.current
        ? Math.round((Date.now() - sessionStartRef.current) / 1000)
        : 0;
      const avgHR = wearableRef.current?.getAverageHeartRate() || 0;
      const efficiency = calculateEfficiency(duration, avgHR);
      if (efficiency) {
        setEfficiencyResult(efficiency);
        setShowEfficiency(true);
      }
    }
  };

  const calculateEfficiency = (durationSeconds: number, avgHeartRate: number) => {
    if (!efficiencyCalcRef.current) return null;

    const durationMinutes = durationSeconds / 60;
    const strokes = allStrokesRef.current;

    // If no HR data, prompt user or use a reasonable default for demo
    const hrToUse = avgHeartRate > 0 ? avgHeartRate : 0;

    if (hrToUse === 0) {
      // Can't calculate without HR — return informational result
      return {
        efficiency: 0,
        workInput: 0,
        workOutput: 0,
        level: 'no_data',
        feedback: 'No heart rate data available. Connect an Apple Watch or Bluetooth HR monitor to calculate efficiency.',
        details: { strokeCount: strokes.length, durationMinutes },
      };
    }

    const result = efficiencyCalcRef.current.calculateFromSession(
      { duration: durationSeconds, strokes },
      { heartRate: hrToUse, mass: DEFAULT_MASS_KG, distance: null }
    );

    return result;
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
    setRecentStrokes((prev) => [strokePayload, ...prev].slice(0, 10));

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
    } catch (error) {
      console.error('Stroke upload error:', error);
      strokeBufferRef.current.unshift(...strokesToSend);
    }
  };

  const dismissEfficiency = () => {
    setShowEfficiency(false);
  };

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.contentContainer}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Swim Session</ThemedText>
        <ThemedText type="default">{statusMessage}</ThemedText>
      </ThemedView>

      {/* Efficiency Results Card */}
      {showEfficiency && efficiencyResult && (
        <ThemedView style={styles.efficiencyCard}>
          <ThemedText type="subtitle">Efficiency Results</ThemedText>

          {efficiencyResult.level === 'no_data' ? (
            <ThemedText type="default">{efficiencyResult.feedback}</ThemedText>
          ) : (
            <>
              <ThemedText type="title" style={styles.efficiencyScore}>
                {efficiencyResult.efficiency.toFixed(2)}%
              </ThemedText>
              <ThemedText type="default" style={styles.efficiencyLevel}>
                Level: {efficiencyResult.level}
              </ThemedText>
              <ThemedText type="default">{efficiencyResult.feedback}</ThemedText>
              <View style={styles.efficiencyDetails}>
                <ThemedText type="default">
                  Work Input: {efficiencyResult.workInput.toLocaleString()} J
                </ThemedText>
                <ThemedText type="default">
                  Work Output: {efficiencyResult.workOutput.toLocaleString()} J
                </ThemedText>
                {efficiencyResult.details && (
                  <ThemedText type="default">
                    Strokes: {efficiencyResult.details.strokeCount} | Distance: ~{efficiencyResult.details.estimatedDistance?.toFixed(0)}m
                  </ThemedText>
                )}
              </View>
            </>
          )}

          <Pressable style={styles.dismissButton} onPress={dismissEfficiency}>
            <ThemedText type="default" style={styles.dismissText}>Dismiss</ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {/* Heart Rate Card */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Heart Rate</ThemedText>
        <View style={styles.hrRow}>
          <ThemedText type="title" style={styles.hrText}>
            {heartRate ? `${heartRate}` : '--'}
          </ThemedText>
          <ThemedText type="default"> bpm</ThemedText>
        </View>
        <ThemedText type="default" style={styles.hrSource}>
          {hrSource ? `Source: ${hrSource === 'healthkit' ? 'Apple Watch' : 'Bluetooth'}` : 'No HR monitor connected'}
        </ThemedText>
      </ThemedView>

      {/* Current Stroke Card */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Current Stroke</ThemedText>
        <ThemedText type="title" style={styles.strokeText}>
          {currentStroke}
        </ThemedText>
        <View style={styles.confidenceBar}>
          <View
            style={[
              styles.confidenceFill,
              { width: `${Math.min(100, currentConfidence * 100)}%` },
            ]}
          />
        </View>
        <ThemedText type="default">Confidence: {(currentConfidence * 100).toFixed(1)}%</ThemedText>
      </ThemedView>

      {/* Sensor Buffer Card */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Sensor Buffer</ThemedText>
        <ThemedText type="default">
          {sensorStats.accelCount || 0} / {sensorStats.bufferSize || 100} samples
        </ThemedText>
        <View style={styles.confidenceBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${sensorStats.fillPercentage || 0}%` },
            ]}
          />
        </View>
      </ThemedView>

      {/* Recent Strokes Card */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Recent Strokes ({allStrokesRef.current?.length || 0} total)</ThemedText>
        {recentStrokes.length === 0 ? (
          <ThemedText type="default">No strokes captured yet.</ThemedText>
        ) : (
          recentStrokes.map((stroke, index) => (
            <View key={`${stroke.timestamp}-${index}`} style={styles.strokeRow}>
              <ThemedText type="default">{stroke.type}</ThemedText>
              <ThemedText type="default">
                {(stroke.confidence * 100).toFixed(0)}%
              </ThemedText>
            </View>
          ))
        )}
      </ThemedView>

      {/* Start/Stop Button */}
      <Pressable
        style={[styles.button, isRecording ? styles.buttonStop : styles.buttonStart]}
        onPress={isRecording ? stopSession : startSession}
      >
        <ThemedText type="default" style={styles.buttonText}>
          {isRecording ? 'Stop Session' : 'Start Session'}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  header: {
    gap: 8,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 12,
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
  },
  efficiencyCard: {
    padding: 16,
    borderRadius: 16,
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  efficiencyScore: {
    fontSize: 36,
    color: '#10B981',
  },
  efficiencyLevel: {
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  efficiencyDetails: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(16, 185, 129, 0.2)',
  },
  dismissButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  dismissText: {
    color: '#10B981',
    fontWeight: '500',
  },
  hrRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  hrText: {
    fontSize: 32,
    color: '#EF4444',
  },
  hrSource: {
    opacity: 0.7,
  },
  strokeText: {
    fontSize: 28,
  },
  confidenceBar: {
    height: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(25, 118, 210, 0.2)',
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#1976D2',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  strokeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#10B981',
  },
  buttonStop: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
