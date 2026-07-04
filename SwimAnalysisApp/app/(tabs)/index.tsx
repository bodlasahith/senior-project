import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import SensorDataHandler from '@/services/SensoryDataHandler';
import StrokeClassifier from '@/services/StrokeClassifier';
import { sessionAPI } from '@/services/api';

const CONFIDENCE_THRESHOLD = 0.7;
const STROKE_BATCH_SIZE = 5;

export default function SessionScreen() {
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing sensors and model...');
  const [currentStroke, setCurrentStroke] = useState('Waiting...');
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const [sensorStats, setSensorStats] = useState({ accelCount: 0, bufferSize: 100, fillPercentage: 0 });
  const [recentStrokes, setRecentStrokes] = useState([]);

  const classifierRef = useRef(null);
  const sensorHandlerRef = useRef(null);
  const sessionIdRef = useRef(null);
  const sessionStartRef = useRef(null);
  const strokeBufferRef = useRef([]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setStatusMessage('This screen requires a device or simulator.');
      return;
    }

    initializeSessionStack();

    return () => {
      sensorHandlerRef.current?.dispose();
      classifierRef.current?.dispose();
    };
  }, []);

  const initializeSessionStack = async () => {
    try {
      setStatusMessage('Loading model and sensors...');

      const classifier = new StrokeClassifier();
      classifierRef.current = classifier;

      const modelSource = require('../../assets/models/stroke_classification_model.tflite');
      const classifierReady = await classifier.initialize(modelSource);
      if (!classifierReady) {
        throw new Error('Unable to load TFLite model.');
      }

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

      setIsReady(true);
      setStatusMessage('Ready to record.');
    } catch (error) {
      console.error('Initialization error:', error);
      setStatusMessage('Initialization failed. Check logs.');
      Alert.alert('Initialization Error', error.message || 'Unable to start session stack.');
    }
  };

  // Model is loaded directly from bundled assets.

  const startSession = async () => {
    if (!isReady) {
      Alert.alert('Not Ready', 'Finish initialization before starting a session.');
      return;
    }

    try {
      const response = await sessionAPI.createSession({
        duration: 0,
        startTime: new Date().toISOString(),
        strokes: [],
      });

      sessionIdRef.current = response.data.session?._id || null;
      sessionStartRef.current = Date.now();
      strokeBufferRef.current = [];
      setRecentStrokes([]);
      setCurrentStroke('Detecting...');
      setCurrentConfidence(0);

      sensorHandlerRef.current?.startCollecting();
      setIsRecording(true);
      setStatusMessage('Recording in progress...');
    } catch (error) {
      console.error('Start session error:', error);
      Alert.alert('Session Error', 'Unable to start session. Check backend connection.');
    }
  };

  const stopSession = async () => {
    try {
      sensorHandlerRef.current?.stopCollecting();
      setIsRecording(false);
      setStatusMessage('Saving session...');

      const duration = sessionStartRef.current
        ? Math.round((Date.now() - sessionStartRef.current) / 1000)
        : 0;

      if (strokeBufferRef.current.length > 0 && sessionIdRef.current) {
        await flushStrokes();
      }

      if (sessionIdRef.current) {
        await sessionAPI.updateSession(sessionIdRef.current, {
          duration,
          endTime: new Date().toISOString(),
        });
      }

      setStatusMessage('Session saved.');
      Alert.alert('Session Complete', `Recorded ${recentStrokes.length} strokes.`);
    } catch (error) {
      console.error('Stop session error:', error);
      Alert.alert('Session Error', 'Unable to save session.');
    }
  };

  const handleBufferFull = async (buffer) => {
    if (!isRecording || !classifierRef.current) {
      return;
    }

    const result = await classifierRef.current.classifyStroke(buffer);
    if (!result) {
      return;
    }

    setCurrentStroke(result.stroke);
    setCurrentConfidence(result.confidence);

    if (result.confidence < CONFIDENCE_THRESHOLD) {
      return;
    }

    const strokePayload = {
      type: result.stroke,
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
      allPredictions: result.allPredictions,
    };

    strokeBufferRef.current.push(strokePayload);
    setRecentStrokes((prev) => [strokePayload, ...prev].slice(0, 10));

    if (strokeBufferRef.current.length >= STROKE_BATCH_SIZE && sessionIdRef.current) {
      await flushStrokes();
    }
  };

  const flushStrokes = async () => {
    if (!sessionIdRef.current || strokeBufferRef.current.length === 0) {
      return;
    }

    const strokesToSend = [...strokeBufferRef.current];
    strokeBufferRef.current = [];

    try {
      await sessionAPI.addStrokes(sessionIdRef.current, strokesToSend);
    } catch (error) {
      console.error('Stroke upload error:', error);
      strokeBufferRef.current.unshift(...strokesToSend);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Swim Session</ThemedText>
        <ThemedText type="default">{statusMessage}</ThemedText>
      </ThemedView>

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

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Recent Strokes</ThemedText>
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

      <Pressable
        style={[styles.button, isRecording ? styles.buttonStop : styles.buttonStart]}
        onPress={isRecording ? stopSession : startSession}
      >
        <ThemedText type="default" style={styles.buttonText}>
          {isRecording ? 'Stop Session' : 'Start Session'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 16,
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
  },
});
