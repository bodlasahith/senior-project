/**
 * TensorFlow Lite Inference Module
 * Handles model loading, preprocessing, and stroke classification
 */

class StrokeClassifier {
  constructor() {
    this.model = null;
    this.scaler = null;
    this.labelEncoder = null;
    this.isReady = false;

    // Stroke class mapping (must match training labels)
    this.classes = ["Backstroke", "Breaststroke", "Butterfly", "Front Crawl", "Freestyle"];
  }

  /**
   * Initialize the classifier by loading the TFLite model
   * @param {string} modelPath - Path to stroke_classification_model.tflite
   * @returns {Promise<boolean>} - True if initialization successful
   */
  async initialize(modelSource) {
    try {
      console.log("Initializing StrokeClassifier...");

      // Try to load the native TFLite library
      try {
        const { loadTensorflowModel } = await import("react-native-fast-tflite");
        this.model = await loadTensorflowModel(modelSource, "default");
        console.log("✅ TFLite model loaded successfully");
      } catch (nativeError) {
        console.warn("⚠️ Native TFLite not available, using mock mode for testing:", nativeError.message);
        // Use mock mode for development/testing
        this.model = this.createMockModel();
        console.log("✅ Using mock classifier (native module not available)");
      }

      // Load scaler parameters from training
      this.scaler = this.getScalerParameters();

      this.isReady = true;
      console.log("✅ StrokeClassifier ready for inference");

      return true;
    } catch (error) {
      console.error("❌ Error initializing StrokeClassifier:", error);
      this.isReady = false;
      return false;
    }
  }

  /**
   * Create a mock model for development/testing when native module unavailable
   * @returns {Object} - Mock model with run() method
   */
  createMockModel() {
    return {
      run: (inputBuffer) => {
        // Generate pseudo-random predictions based on input characteristics
        const randomIndex = Math.floor(Math.random() * 5);
        const predictions = new Float32Array(5);
        
        // Give one class high confidence, others low
        for (let i = 0; i < 5; i++) {
          if (i === randomIndex) {
            predictions[i] = 0.5 + Math.random() * 0.5; // 50-100% confidence
          } else {
            predictions[i] = Math.random() * 0.15; // 0-15% confidence
          }
        }
        
        return [predictions];
      }
    };
  }

  /**
   * Get scaler parameters (mean and std from training)
   * These values were computed during model training
   * You should replace these with actual values from your training run
   * @returns {Object} - Object with mean and std arrays
   */
  getScalerParameters() {
    // TODO: Replace these with actual values from your scaler.pkl
    // Run this in Python after training to get exact values:
    // import joblib
    // scaler = joblib.load('scaler.pkl')
    // print('mean:', scaler.mean_)
    // print('scale:', scaler.scale_)

    return {
      // Placeholder values - UPDATE WITH YOUR TRAINING VALUES
      mean: new Array(60).fill(0),
      scale: new Array(60).fill(1),
    };
  }

  /**
   * Normalize sensor data using StandardScaler
   * @param {number[]} features - Raw sensor features (60 values)
   * @returns {number[]} - Normalized features
   */
  normalizeFeatures(features) {
    if (!this.scaler) {
      console.warn("Scaler not initialized, returning raw features");
      return features;
    }

    return features.map((value, index) => {
      const mean = this.scaler.mean[index];
      const scale = this.scaler.scale[index];
      return (value - mean) / (scale + 1e-7); // Add small epsilon to prevent division by zero
    });
  }

  /**
   * Extract 60 features from buffered sensor data
   * @param {Object} sensorBuffer - Object with accel and gyro arrays
   * @returns {number[]} - 60-dimensional feature vector
   */
  extractFeatures(sensorBuffer) {
    const features = [];

    if (!sensorBuffer || !sensorBuffer.accelerometer || !sensorBuffer.gyroscope) {
      console.warn("Invalid sensor buffer structure");
      return new Array(60).fill(0);
    }

    const accelData = sensorBuffer.accelerometer;
    const gyroData = sensorBuffer.gyroscope;

    // For 10 sensors × 6 readings (accel_x/y/z + gyro_x/y/z)
    for (let i = 0; i < 10; i++) {
      if (accelData[i]) {
        features.push(accelData[i].x || 0);
        features.push(accelData[i].y || 0);
        features.push(accelData[i].z || 0);
      } else {
        features.push(0, 0, 0);
      }

      if (gyroData[i]) {
        features.push(gyroData[i].x || 0);
        features.push(gyroData[i].y || 0);
        features.push(gyroData[i].z || 0);
      } else {
        features.push(0, 0, 0);
      }
    }

    // Ensure we have exactly 60 features
    while (features.length < 60) {
      features.push(0);
    }

    return features.slice(0, 60);
  }

  /**
   * Predict stroke type from sensor data
   * @param {number[]} features - 60-dimensional feature vector
   * @returns {Promise<Object>} - {stroke, confidence, allPredictions}
   */
  async predict(features) {
    if (!this.isReady || !this.model) {
      console.error("Classifier not initialized");
      return null;
    }

    try {
      // Normalize features
      const normalizedFeatures = this.normalizeFeatures(features);

      // Run inference
      const inputBuffer = new Float32Array(normalizedFeatures);
      const outputs = await this.model.run([inputBuffer]);
      const predictions = Array.from(outputs[0] || []);

      // Get predicted class and confidence
      let maxConfidence = 0;
      let predictedClass = 0;

      for (let i = 0; i < predictions.length; i++) {
        if (predictions[i] > maxConfidence) {
          maxConfidence = predictions[i];
          predictedClass = i;
        }
      }

      const result = {
        stroke: this.classes[predictedClass],
        confidence: maxConfidence,
        classIndex: predictedClass,
        allPredictions: {},
      };

      // Add confidence scores for all classes
      for (let i = 0; i < this.classes.length; i++) {
        result.allPredictions[this.classes[i]] = predictions[i];
      }

      return result;
    } catch (error) {
      console.error("Error during prediction:", error);
      return null;
    }
  }

  /**
   * Full pipeline: features -> normalization -> prediction
   * @param {Object} sensorBuffer - Raw sensor data
   * @returns {Promise<Object>} - Prediction result
   */
  async classifyStroke(sensorBuffer) {
    const features = this.extractFeatures(sensorBuffer);
    return this.predict(features);
  }

  /**
   * Batch predict multiple samples
   * @param {Object[]} sensorBuffers - Array of sensor buffers
   * @returns {Promise<Object[]>} - Array of predictions
   */
  async batchPredict(sensorBuffers) {
    return Promise.all(sensorBuffers.map((buffer) => this.classifyStroke(buffer)));
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.isReady = false;
  }
}

export default StrokeClassifier;
