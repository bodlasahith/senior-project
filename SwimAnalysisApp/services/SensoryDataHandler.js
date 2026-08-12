/**
 * Sensor Data Handler
 * Collects, buffers, and manages IMU sensor data streams
 */

import { Accelerometer, Gyroscope } from "expo-sensors";

class SensorDataHandler {
  constructor(bufferSize = 100) {
    this.bufferSize = bufferSize;
    this.sensorBuffer = {
      accelerometer: [],
      gyroscope: [],
      timestamps: [],
    };

    this.isCollecting = false;
    this.accelSubscription = null;
    this.gyroSubscription = null;

    // Emit a window for classification every `windowStride` new accelerometer
    // samples (50% overlap). Prevents onBufferFull from firing on every sample
    // once the buffer is full, which would flood the classifier.
    this.windowStride = Math.max(1, Math.floor(bufferSize / 2));
    this.samplesSinceLastEmit = 0;

    // Sampling rate (Hz)
    this.samplingRate = 30;

    // Callbacks
    this.onBufferFull = null;
    this.onNewData = null;
  }

  /**
   * Initialize sensors and set sampling rate
   */
  async initialize() {
    try {
      console.log("🔄 Initializing sensors...");

      // Set sensor update interval
      const interval = 1000 / this.samplingRate;

      Accelerometer.setUpdateInterval(interval);
      Gyroscope.setUpdateInterval(interval);

      console.log(`✅ Sensors initialized at ${this.samplingRate}Hz`);
      return true;
    } catch (error) {
      console.error("❌ Error initializing sensors:", error);
      return false;
    }
  }

  /**
   * Start collecting sensor data
   */
  startCollecting() {
    if (this.isCollecting) {
      console.warn("Already collecting sensor data");
      return;
    }

    console.log("📊 Starting sensor data collection...");
    this.isCollecting = true;
    this.clearBuffer();

    // Subscribe to accelerometer
    this.accelSubscription = Accelerometer.addListener((data) => {
      this.handleAccelerometerData(data);
    });

    // Subscribe to gyroscope
    this.gyroSubscription = Gyroscope.addListener((data) => {
      this.handleGyroscopeData(data);
    });

    console.log("✅ Sensor collection started");
  }

  /**
   * Stop collecting sensor data
   */
  stopCollecting() {
    if (!this.isCollecting) {
      console.warn("Not currently collecting");
      return;
    }

    if (this.accelSubscription) {
      this.accelSubscription.remove();
      this.accelSubscription = null;
    }

    if (this.gyroSubscription) {
      this.gyroSubscription.remove();
      this.gyroSubscription = null;
    }

    this.isCollecting = false;
    console.log("✅ Sensor collection stopped");
  }

  /**
   * Handle accelerometer data
   * @param {Object} data - {x, y, z}
   */
  handleAccelerometerData(data) {
    this.sensorBuffer.accelerometer.push({
      x: data.x,
      y: data.y,
      z: data.z,
      timestamp: Date.now(),
    });

    // Maintain buffer size
    if (this.sensorBuffer.accelerometer.length > this.bufferSize) {
      this.sensorBuffer.accelerometer.shift();
    }

    // Count window progress off the accelerometer stream only (accel and gyro
    // arrive at the same rate, so counting one avoids double-counting).
    this.samplesSinceLastEmit++;
    this.checkBufferStatus();

    if (this.onNewData) {
      this.onNewData("accelerometer", data);
    }
  }

  /**
   * Handle gyroscope data
   * @param {Object} data - {x, y, z}
   */
  handleGyroscopeData(data) {
    this.sensorBuffer.gyroscope.push({
      x: data.x,
      y: data.y,
      z: data.z,
      timestamp: Date.now(),
    });

    // Maintain buffer size
    if (this.sensorBuffer.gyroscope.length > this.bufferSize) {
      this.sensorBuffer.gyroscope.shift();
    }

    this.checkBufferStatus();

    if (this.onNewData) {
      this.onNewData("gyroscope", data);
    }
  }

  /**
   * Check if buffer is full and ready for inference
   */
  checkBufferStatus() {
    const minDataPoints = Math.floor(this.bufferSize * 0.8); // 80% full

    const isFull =
      this.sensorBuffer.accelerometer.length >= minDataPoints &&
      this.sensorBuffer.gyroscope.length >= minDataPoints;

    // Only emit a window once the buffer is full AND a full stride of new
    // samples has arrived since the last emit — otherwise onBufferFull would
    // fire on every sample once the buffer stays full.
    if (isFull && this.samplesSinceLastEmit >= this.windowStride) {
      this.samplesSinceLastEmit = 0;
      if (this.onBufferFull) {
        this.onBufferFull(this.getBuffer());
      }
    }
  }

  /**
   * Get current buffer (for inference)
   * @returns {Object} - Current sensor buffer
   */
  getBuffer() {
    return {
      accelerometer: [...this.sensorBuffer.accelerometer],
      gyroscope: [...this.sensorBuffer.gyroscope],
    };
  }

  /**
   * Clear the buffer
   */
  clearBuffer() {
    this.sensorBuffer = {
      accelerometer: [],
      gyroscope: [],
      timestamps: [],
    };
    this.samplesSinceLastEmit = 0;
  }

  /**
   * Get buffer statistics
   * @returns {Object} - Stats about current buffer
   */
  getBufferStats() {
    return {
      accelCount: this.sensorBuffer.accelerometer.length,
      gyroCount: this.sensorBuffer.gyroscope.length,
      bufferSize: this.bufferSize,
      fillPercentage: Math.round((this.sensorBuffer.accelerometer.length / this.bufferSize) * 100),
      isCollecting: this.isCollecting,
    };
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stopCollecting();
  }
}

export default SensorDataHandler;
