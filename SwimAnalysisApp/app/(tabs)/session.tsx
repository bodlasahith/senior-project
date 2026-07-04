import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import SensorDataHandler from '../../services/SensoryDataHandler';
import StrokeClassifier from '../../services/StrokeClassifier';
import { sessionAPI } from '../../services/api';
import * as FileSystem from 'expo-file-system';

export default function SessionScreen() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [strokes, setStrokes] = useState<any[]>([]);

  const sensorHandlerRef = useRef<SensorDataHandler | null>(null);
  const classifierRef = useRef<StrokeClassifier | null>(null);
  const sessionRef = useRef<any>(null);

  // Initialize on mount
  useEffect(() => {
    initializeApp();
    return () => {
      sensorHandlerRef.current?.dispose();
      classifierRef.current?.dispose();
    };
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize sensor handler
      sensorHandlerRef.current = new SensorDataHandler(100);
      await sensorHandlerRef.current.initialize();

      // Initialize classifier
      classifierRef.current = new StrokeClassifier();
      const modelPath = `${FileSystem.documentDirectory}stroke_classification_model.tflite`;
      await classifierRef.current.initialize(modelPath);

      // Set up buffer full callback
      if (sensorHandlerRef.current) {
        sensorHandlerRef.current.onBufferFull = handleBufferFull;
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to initialize: ' + error.message);
    }
  };

  const handleBufferFull = async (buffer: any) => {
    if (!isSessionActive || !classifierRef.current) return;

    const result = await classifierRef.current.classifyStroke(buffer);
    if (result && result.confidence > 0.7) {
      setCurrentStroke(result.stroke);
      setConfidence(result.confidence);

      const newStroke = {
        type: result.stroke,
        confidence: result.confidence,
        timestamp: new Date().toISOString(),
        allPredictions: result.allPredictions,
      };

      setStrokes(prev => [...prev, newStroke]);
    }
  };

  const startSession = async () => {
    try {
      sensorHandlerRef.current?.startCollecting();
      sessionRef.current = {
        startTime: new Date(),
        strokes: [],
      };
      setIsSessionActive(true);
      setStrokes([]);
    } catch (error) {
      Alert.alert('Error', 'Failed to start session');
    }
  };

  const stopSession = async () => {
    try {
      sensorHandlerRef.current?.stopCollecting();
      setIsSessionActive(false);

      // Save to backend
      const response = await sessionAPI.createSession({
        duration: Math.round((new Date().getTime() - sessionRef.current.startTime.getTime()) / 1000),
        strokes: strokes,
      });

      Alert.alert('Success', `Session saved! ${strokes.length} strokes recorded.`);
    } catch (error) {
      Alert.alert('Error', 'Failed to save session');
    }
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        🏊 Swim Session
      </Text>

      {currentStroke && (
        <View style={{ backgroundColor: '#1976D2', padding: 20, borderRadius: 10, marginBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: 'bold' }}>
            {currentStroke}
          </Text>
          <Text style={{ color: '#fff', marginTop: 10 }}>
            Confidence: {(confidence * 100).toFixed(1)}%
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={isSessionActive ? stopSession : startSession}
        style={{
          backgroundColor: isSessionActive ? '#F44336' : '#4CAF50',
          padding: 16,
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }}>
          {isSessionActive ? '⏹ Stop Session' : '▶ Start Session'}
        </Text>
      </TouchableOpacity>

      {strokes.length > 0 && (
        <View>
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>
            Recent Strokes ({strokes.length})
          </Text>
          {strokes.map((stroke, idx) => (
            <View key={idx} style={{ padding: 10, backgroundColor: '#fff', marginBottom: 8, borderRadius: 8 }}>
              <Text style={{ fontWeight: 'bold' }}>{stroke.type}</Text>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {(stroke.confidence * 100).toFixed(1)}% confidence
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}