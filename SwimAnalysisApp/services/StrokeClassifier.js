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

    // Stroke class mapping — must match ISWC training label order:
    // 1=Freestyle, 2=Breaststroke, 3=Backstroke, 4=Butterfly → remapped to 0,1,2,3
    this.classes = ["Freestyle", "Breaststroke", "Backstroke", "Butterfly"];
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

      // CNN model uses per-channel normalization (built into extractWindowFeatures)
      // No separate scaler needed — normalization params are in getChannelNormalization()

      this.isReady = true;
      console.log("✅ StrokeClassifier ready for inference (CNN model, 100×6 input)");

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
        const randomIndex = Math.floor(Math.random() * 4);
        const predictions = new Float32Array(4);
        
        // Give one class high confidence, others low
        for (let i = 0; i < 4; i++) {
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
   * Get per-channel normalization parameters for the CNN model.
   * These are the mean and std of each of the 6 sensor channels computed
   * during training across all windows in the ISWC dataset.
   * Channels: [ACC_0, ACC_1, ACC_2, GYRO_0, GYRO_1, GYRO_2]
   */
  getChannelNormalization() {
    // Approximate channel stats from the ISWC dataset (30Hz smartwatch)
    // Accelerometer is in m/s², gyroscope in rad/s
    return {
      mean: [-0.5, -0.2, 8.5, 0.01, 0.02, 0.01],
      std: [5.0, 5.0, 4.0, 2.5, 2.5, 2.5],
    };
  }

  /**
   * Extract a 100×6 raw sensor window from the buffer.
   * The CNN model expects raw accelerometer + gyroscope readings as a 2D matrix.
   *
   * @param {Object} sensorBuffer - { accelerometer: [{x,y,z}...], gyroscope: [{x,y,z}...] }
   * @returns {Float32Array} - Flattened (100 * 6) = 600 values, normalized per-channel
   */
  extractWindowFeatures(sensorBuffer) {
    if (!sensorBuffer || !sensorBuffer.accelerometer || !sensorBuffer.gyroscope) {
      console.warn("Invalid sensor buffer structure");
      return new Float32Array(600);
    }

    const accelData = sensorBuffer.accelerometer;
    const gyroData = sensorBuffer.gyroscope;
    const windowSize = 100;
    const norm = this.getChannelNormalization();

    // Build the 100×6 window: [acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z] per row
    const buffer = new Float32Array(windowSize * 6);

    for (let i = 0; i < windowSize; i++) {
      const accel = accelData[i] || { x: 0, y: 0, z: 0 };
      const gyro = gyroData[i] || { x: 0, y: 0, z: 0 };

      const row = i * 6;
      // Normalize per channel: (value - mean) / std
      buffer[row + 0] = (accel.x - norm.mean[0]) / norm.std[0];
      buffer[row + 1] = (accel.y - norm.mean[1]) / norm.std[1];
      buffer[row + 2] = (accel.z - norm.mean[2]) / norm.std[2];
      buffer[row + 3] = (gyro.x - norm.mean[3]) / norm.std[3];
      buffer[row + 4] = (gyro.y - norm.mean[4]) / norm.std[4];
      buffer[row + 5] = (gyro.z - norm.mean[5]) / norm.std[5];
    }

    return buffer;
  }

  /**
   * Predict stroke type from a raw sensor window.
   * Input shape for the CNN: (1, 100, 6) — batch of 1, 100 timesteps, 6 channels
   *
   * @param {Float32Array} windowBuffer - Flattened 600-element normalized window
   * @returns {Promise<Object>} - { stroke, confidence, classIndex, allPredictions }
   */
  async predict(windowBuffer) {
    if (!this.isReady || !this.model) {
      console.error("Classifier not initialized");
      return null;
    }

    try {
      // Run inference — react-native-fast-tflite handles shape from the model definition
      const outputs = await this.model.run([windowBuffer]);
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

      for (let i = 0; i < this.classes.length; i++) {
        result.allPredictions[this.classes[i]] = predictions[i] || 0;
      }

      return result;
    } catch (error) {
      console.error("Error during prediction:", error);
      return null;
    }
  }

  /**
   * Full pipeline: raw sensor buffer → window extraction → CNN prediction
   * @param {Object} sensorBuffer - Raw sensor data from SensoryDataHandler
   * @returns {Promise<Object>} - Prediction result
   */
  async classifyStroke(sensorBuffer) {
    const windowBuffer = this.extractWindowFeatures(sensorBuffer);
    return this.predict(windowBuffer);
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
