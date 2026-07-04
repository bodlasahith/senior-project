/**
 * Swimming Stroke Recognition App
 * Complete React Native implementation with TFLite inference
 */

import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
} from "react-native";
import * as FileSystem from "expo-file-system";
import StrokeClassifier from "./SwimAnalysisApp/services/StrokeClassifier";
import SensorDataHandler from "./SwimAnalysisApp/services/SensoryDataHandler";

const SwimTrackerApp = () => {
  // State management
  const [appState, setAppState] = useState("idle"); // idle, loading, tracking, classifying
  const [currentStroke, setCurrentStroke] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [sensorStats, setSensorStats] = useState({});
  const [initError, setInitError] = useState(null);

  // References to modules
  const classifierRef = useRef(null);
  const sensorHandlerRef = useRef(null);
  const sessionRef = useRef({
    startTime: null,
    strokes: [],
    accuracy: 0,
    efficiency: 0,
  });

  /**
   * Initialize app on mount
   */
  useEffect(() => {
    initializeApp();

    return () => {
      // Cleanup on unmount
      if (sensorHandlerRef.current) {
        sensorHandlerRef.current.dispose();
      }
      if (classifierRef.current) {
        classifierRef.current.dispose();
      }
    };
  }, []);

  /**
   * Main initialization function
   */
  const initializeApp = async () => {
    try {
      setAppState("loading");
      console.log("🚀 Initializing Swimming Stroke Recognition App...");

      // Check if model file exists
      const modelPath = `${FileSystem.documentDirectory}stroke_classification_model.tflite`;
      const fileInfo = await FileSystem.getInfoAsync(modelPath);

      if (!fileInfo.exists) {
        throw new Error(
          "Model file not found. Please ensure stroke_classification_model.tflite is in the app directory.",
        );
      }

      console.log("✅ Model file found");

      // Initialize classifier
      classifierRef.current = new StrokeClassifier();
      const classifierReady = await classifierRef.current.initialize(modelPath);

      if (!classifierReady) {
        throw new Error("Failed to initialize TFLite model");
      }

      // Initialize sensor handler
      sensorHandlerRef.current = new SensorDataHandler(100); // 100 sample buffer
      const sensorsReady = await sensorHandlerRef.current.initialize();

      if (!sensorsReady) {
        throw new Error("Failed to initialize sensors");
      }

      // Set up sensor callbacks
      sensorHandlerRef.current.onBufferFull = handleBufferFull;
      sensorHandlerRef.current.onNewData = handleNewSensorData;

      setAppState("idle");
      console.log("✅ App initialization complete!");
    } catch (error) {
      console.error("❌ Initialization error:", error);
      setInitError(error.message);
      setAppState("idle");
      Alert.alert("Initialization Error", error.message);
    }
  };

  /**
   * Handle new sensor data
   */
  const handleNewSensorData = (type, data) => {
    // Update sensor stats every 10 samples
    if (Math.random() < 0.1) {
      setSensorStats(sensorHandlerRef.current.getBufferStats());
    }
  };

  /**
   * Handle when sensor buffer is full
   * Triggers inference
   */
  const handleBufferFull = async (buffer) => {
    if (!sessionActive) return;

    setAppState("classifying");

    try {
      // Run inference
      const result = await classifierRef.current.classifyStroke(buffer);

      if (result) {
        setCurrentStroke(result.stroke);
        setConfidence(result.confidence);

        // Only record if confidence is high enough
        if (result.confidence > 0.7) {
          recordStroke(result);
        }

        // Add to recent predictions
        setPredictions((prev) => [
          {
            stroke: result.stroke,
            confidence: (result.confidence * 100).toFixed(1),
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9), // Keep last 10
        ]);
      }

      setAppState("tracking");
    } catch (error) {
      console.error("Inference error:", error);
      setAppState("tracking");
    }
  };

  /**
   * Record detected stroke to session
   */
  const recordStroke = (prediction) => {
    sessionRef.current.strokes.push({
      type: prediction.stroke,
      confidence: prediction.confidence,
      timestamp: new Date(),
      classDetails: prediction.allPredictions,
    });

    console.log(`✅ Recorded: ${prediction.stroke} (${(prediction.confidence * 100).toFixed(1)}%)`);
  };

  /**
   * Start tracking session
   */
  const startSession = () => {
    try {
      sensorHandlerRef.current.startCollecting();
      sessionRef.current = {
        startTime: new Date(),
        strokes: [],
        accuracy: 0,
        efficiency: 0,
      };
      setSessionActive(true);
      setAppState("tracking");
      setPredictions([]);
      Alert.alert("Session Started", "Begin your swimming workout!");
    } catch (error) {
      console.error("Error starting session:", error);
      Alert.alert("Error", "Failed to start tracking session");
    }
  };

  /**
   * Stop tracking session
   */
  const stopSession = () => {
    sensorHandlerRef.current.stopCollecting();
    setSessionActive(false);
    setAppState("idle");
    setCurrentStroke(null);

    // Calculate session stats
    const session = sessionRef.current;
    const duration = Math.round(
      (new Date() - session.startTime) / 1000 / 60, // Convert to minutes
    );

    const strokeCounts = {};
    session.strokes.forEach((stroke) => {
      strokeCounts[stroke.type] = (strokeCounts[stroke.type] || 0) + 1;
    });

    const sessionSummary = `
Session Summary
━━━━━━━━━━━━━━━━━━━━━━
Duration: ${duration} minutes
Total Strokes: ${session.strokes.length}
Strokes by Type:
${Object.entries(strokeCounts)
  .map(([type, count]) => `  • ${type}: ${count}`)
  .join("\n")}
Average Confidence: ${(
      session.strokes.reduce((sum, s) => sum + s.confidence, 0) / (session.strokes.length || 1)
    ).toFixed(2)}
    `;

    Alert.alert("Session Complete", sessionSummary);

    // Save session data
    saveSession(session);
  };

  /**
   * Save session to storage
   */
  const saveSession = async (session) => {
    try {
      const fileName = `swim_session_${Date.now()}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(session, null, 2));

      console.log(`✅ Session saved: ${fileName}`);
      Alert.alert("Session Saved", `Data saved to ${fileName}`);
    } catch (error) {
      console.error("Error saving session:", error);
      Alert.alert("Save Error", "Failed to save session data");
    }
  };

  /**
   * Clear predictions
   */
  const clearPredictions = () => {
    setPredictions([]);
  };

  /**
   * Render prediction item
   */
  const renderPredictionItem = ({ item, index }) => (
    <View style={styles.predictionItem}>
      <View style={styles.predictionContent}>
        <Text style={styles.predictionStroke}>{item.stroke}</Text>
        <Text style={styles.predictionConfidence}>{item.confidence}% confidence</Text>
        <Text style={styles.predictionTime}>{item.timestamp}</Text>
      </View>
      <View
        style={[
          styles.confidenceBar,
          {
            backgroundColor: getConfidenceColor(parseFloat(item.confidence)),
          },
        ]}
      />
    </View>
  );

  /**
   * Get color based on confidence
   */
  const getConfidenceColor = (confidence) => {
    if (confidence >= 80) return "#4CAF50"; // Green
    if (confidence >= 60) return "#FFC107"; // Amber
    return "#F44336"; // Red
  };

  // Render loading state
  if (initError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ Error</Text>
          <Text style={styles.errorText}>{initError}</Text>
          <TouchableOpacity style={styles.button} onPress={initializeApp}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render main app
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🏊 Swim Stroke Tracker</Text>
        <Text style={styles.subtitle}>AI-powered stroke recognition</Text>
      </View>

      {/* Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[styles.statusValue, { color: sessionActive ? "#4CAF50" : "#666" }]}>
            {sessionActive ? "● Recording" : "● Idle"}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Sensors:</Text>
          <Text style={styles.statusValue}>
            {sensorStats.accelCount || 0} / {sensorStats.bufferSize || 100}
          </Text>
        </View>
        {sensorStats.fillPercentage !== undefined && (
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${sensorStats.fillPercentage}%` }]} />
          </View>
        )}
      </View>

      {/* Current Detection Card */}
      {currentStroke && (
        <View style={styles.detectionCard}>
          <Text style={styles.detectionLabel}>Current Stroke</Text>
          <Text style={styles.detectionStroke}>{currentStroke}</Text>
          <View style={styles.confidenceContainer}>
            <View
              style={[
                styles.confidenceBar2,
                {
                  width: `${confidence * 100}%`,
                  backgroundColor: getConfidenceColor(confidence * 100),
                },
              ]}
            />
          </View>
          <Text style={styles.confidenceText}>{(confidence * 100).toFixed(1)}% confidence</Text>
        </View>
      )}

      {/* Control Buttons */}
      <View style={styles.buttonContainer}>
        {!sessionActive ? (
          <TouchableOpacity
            style={[styles.button, styles.startButton]}
            onPress={startSession}
            disabled={appState === "loading"}
          >
            {appState === "loading" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>▶ Start Session</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopSession}>
            <Text style={styles.buttonText}>⏹ Stop Session</Text>
          </TouchableOpacity>
        )}

        {predictions.length > 0 && (
          <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={clearPredictions}>
            <Text style={styles.buttonText}>Clear History</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Predictions List */}
      {predictions.length > 0 && (
        <View style={styles.predictionsSection}>
          <Text style={styles.sectionTitle}>Recent Detections ({predictions.length})</Text>
          <FlatList
            data={predictions}
            renderItem={renderPredictionItem}
            keyExtractor={(item, index) => index.toString()}
            scrollEnabled={false}
            nestedScrollEnabled={false}
          />
        </View>
      )}

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>How to Use</Text>
        <Text style={styles.infoText}>
          1. Tap "Start Session" to begin recording{"\n"}
          2. Keep your phone's accelerometer and gyroscope active{"\n"}
          3. Perform swimming strokes naturally{"\n"}
          4. The app will detect and classify strokes in real-time{"\n"}
          5. Tap "Stop Session" to end and save your data
        </Text>
      </View>

      {/* Model Info */}
      <View style={styles.modelInfo}>
        <Text style={styles.modelTitle}>Model Information</Text>
        <Text style={styles.modelText}>
          • Model: Hybrid CNN+Dense Neural Network{"\n"}• Input: 60 IMU features (10 sensors × 6
          readings){"\n"}• Output: 5 stroke types{"\n"}• Framework: TensorFlow Lite
        </Text>
      </View>
    </ScrollView>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingTop: 40,
  },
  header: {
    backgroundColor: "#1976D2",
    padding: 20,
    paddingBottom: 30,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: "#E3F2FD",
  },
  statusCard: {
    backgroundColor: "#fff",
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 15,
    borderRadius: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  statusValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: "#eee",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 10,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#1976D2",
    borderRadius: 3,
  },
  detectionCard: {
    backgroundColor: "#fff",
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 20,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  detectionLabel: {
    fontSize: 12,
    color: "#999",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  detectionStroke: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1976D2",
    marginBottom: 10,
  },
  confidenceContainer: {
    height: 8,
    backgroundColor: "#eee",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  confidenceBar2: {
    height: "100%",
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 15,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  startButton: {
    backgroundColor: "#4CAF50",
    flex: 1,
    minWidth: "48%",
  },
  stopButton: {
    backgroundColor: "#F44336",
    flex: 1,
    minWidth: "48%",
  },
  clearButton: {
    backgroundColor: "#FF9800",
    flex: 1,
    minWidth: "48%",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  predictionsSection: {
    marginHorizontal: 15,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  predictionItem: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  predictionContent: {
    flex: 1,
  },
  predictionStroke: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  predictionConfidence: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  predictionTime: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
  confidenceBar: {
    width: 4,
    borderRadius: 2,
    marginLeft: 10,
  },
  infoSection: {
    backgroundColor: "#E3F2FD",
    marginHorizontal: 15,
    marginBottom: 20,
    padding: 15,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#1565C0",
    lineHeight: 22,
  },
  modelInfo: {
    backgroundColor: "#fff",
    marginHorizontal: 15,
    marginBottom: 30,
    padding: 15,
    borderRadius: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  modelTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  modelText: {
    fontSize: 13,
    color: "#666",
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#F44336",
    marginBottom: 10,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 24,
  },
});

export default SwimTrackerApp;
